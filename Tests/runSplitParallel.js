require('dotenv').config();

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { performance } = require('perf_hooks');
const {
  buildTimingSummary,
  formatDurationMs,
  mergePhaseTimings,
  normalizePhaseTimings,
} = require('../utils/reportWriter');
const {
  buildArtifactLinks,
  ensureDir,
  escapeCell,
  readJsonIfExists,
  relativeLink,
  writeReportArtifacts,
} = require('../utils/runnerArtifacts');
const {
  prefixOutput,
  spawnNodeChild,
  waitForChild,
} = require('../utils/runnerLifecycle');
const { appendPhaseTimingSection, summarizeResults } = require('../utils/runnerReport');
const { resolveLaneUdids } = require('../utils/simulatorConfig');
const {
  DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS,
  DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS,
  buildSplitThreeSchedule,
  defaultRunId,
  loadHistoricalDurationEstimates,
} = require('../utils/splitSchedule');
const { coverageFor, splitLaneTests, testsFor } = require('./testManifest');

const csv = tests => tests.map(test => test.name).join(',');
const splitTwoTests = testsFor('split2');
const MAIN_TESTS = csv(splitTwoTests.filter(test => test.split2Lane === 'main'));
const STANDALONE_TESTS = csv(splitTwoTests.filter(test => test.split2Lane === 'standalone'));
const THREE_LANE_MAIN_TESTS = csv(splitLaneTests('main'));
const THREE_LANE_CONVERSATION_LIST_TESTS = csv(splitLaneTests('conversationList'));
const THREE_LANE_CONVERSATION_VIEW_TESTS = csv(splitLaneTests('conversationView'));
const EXCLUSIVE_SETTINGS_TESTS = csv(testsFor('exclusive'));
const DEFAULT_SESSION_STAGGER_MS = 6000;
const BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';

function envValue(name, fallback) {
  return process.env[name] || fallback;
}

function makeLane({
  label,
  runId,
  tests,
  deviceName,
  udid,
  appiumPort,
  wdaPort,
  derivedDataPath,
  logicalCategories = {},
}) {
  return {
    label,
    runId,
    tests,
    deviceName,
    udid,
    wdaPort,
    derivedDataPath,
    env: {
      ...process.env,
      PARALLEL_RUN_ID: runId,
      PARALLEL_WORKERS: '1',
      PARALLEL_TESTS: tests,
      PARALLEL_DEVICE_NAMES: deviceName,
      PARALLEL_UDIDS: udid,
      PARALLEL_APPIUM_PORTS: appiumPort,
      PARALLEL_LOGIN_ONCE_PER_WORKER:
        process.env.SPLIT_LOGIN_ONCE_PER_LANE || process.env.PARALLEL_LOGIN_ONCE_PER_WORKER || '1',
      PARALLEL_REUSE_DRIVER: process.env.PARALLEL_REUSE_DRIVER || '1',
      APPIUM_PORT: appiumPort,
      DEVICE_NAME: deviceName,
      SIMULATOR_UDID: udid,
      WDA_LOCAL_PORT: wdaPort,
      WDA_DERIVED_DATA_PATH: derivedDataPath,
      PARALLEL_LOGICAL_CATEGORIES: JSON.stringify(logicalCategories),
    },
    appiumPort,
    logicalCategories,
  };
}

function withResolvedLaneEnvironment(lane) {
  return {
    ...lane,
    env: {
      ...lane.env,
      PARALLEL_UDIDS: lane.udid,
      SIMULATOR_UDID: lane.udid,
    },
  };
}

function listCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function assignment(name, logicalCategory) {
  return { name, logicalCategory };
}

function categoriesForAssignments(assignments) {
  return Object.fromEntries(assignments.map(item => [item.name, item.logicalCategory]));
}

function testNames(assignments) {
  return assignments.map(item => item.name).join(',');
}

function artifactLinks({ reportPath, result }) {
  const dryRun = result.status === 'DRY_RUN';
  return buildArtifactLinks({
    reportPath,
    artifacts: [
      { label: 'summary', path: result.summaryPath },
      { label: 'log', path: result.logPath, include: !dryRun },
      { label: 'json', path: result.resultPath, include: !dryRun },
      { label: 'screenshots', path: result.screenshotDir, include: !dryRun },
    ],
  });
}

function loadLaneResults(lane, code) {
  const repoRoot = path.resolve(__dirname, '..');
  const runRoot = path.join(repoRoot, 'reports', 'runs', lane.runId);
  const resultDir = path.join(runRoot, 'results');
  const logDir = path.join(runRoot, 'logs');
  const summaryPath = path.join(runRoot, 'summary.md');
  const summaryJson = readJsonIfExists(path.join(runRoot, 'summary.json'));
  const tests = listCsv(lane.tests);

  return tests.map((testName, index) => {
    const resultPath = path.join(resultDir, `${testName}.json`);
    const result = summaryJson?.results?.find(item => item.name === testName) || null;
    const status = result?.status || (code === 0 ? 'UNKNOWN' : 'FAIL');
    return {
      ...(result || {}),
      name: testName,
      status,
      durationMs: result?.durationMs,
      duration: result?.duration || (Number.isFinite(result?.durationMs) ? formatDurationMs(result.durationMs) : ''),
      startedAt: result?.startedAt || '',
      finishedAt: result?.finishedAt || '',
      error: result?.error || (status === 'FAIL' ? `Lane exited with code ${code}` : ''),
      workerIndex: result?.workerIndex ?? index,
      laneLabel: lane.label,
      laneRunId: lane.runId,
      logicalCategory: result?.logicalCategory || lane.logicalCategories?.[testName] || lane.label,
      deviceName: lane.deviceName,
      udid: lane.udid,
      appiumPort: lane.appiumPort,
      wdaPort: lane.wdaPort,
      summaryPath,
      logPath: path.join(logDir, `${testName}.log`),
      resultPath,
      screenshotDir: path.join(repoRoot, 'screenshots', lane.runId, testName),
      timings: result?.timings || normalizePhaseTimings(),
    };
  });
}

function laneWithReportedTimings(lane) {
  const repoRoot = path.resolve(__dirname, '..');
  const summary = readJsonIfExists(path.join(repoRoot, 'reports', 'runs', lane.runId, 'summary.json'));
  const timings = mergePhaseTimings(...(summary?.lanes || []).map(item => item.timings));
  return { ...lane, timings };
}

function writeCombinedReport({ reportPath, runId, lanes, laneCodes, durationMs, startedAt, cleanup }) {
  const results = lanes.flatMap((lane, index) => loadLaneResults(lane, laneCodes[index]));
  const reportedLanes = lanes.map(laneWithReportedTimings);
  const {
    passed,
    failed,
    unknown,
    skipped,
    blocked,
    inconclusive,
    dryRun,
    total,
    executed,
    failures,
    slowest,
  } = summarizeResults(results, {
    failureStatuses: ['FAIL', 'UNKNOWN', 'BLOCKED', 'INCONCLUSIVE'],
    slowestLimit: 8,
    slowestExcludedStatuses: [],
  });
  const finishedAt = new Date().toISOString();
  const productStatus = failed || unknown
    ? 'FAIL'
    : blocked || inconclusive || skipped
      ? 'INCOMPLETE'
      : dryRun === total
        ? 'DRY_RUN'
        : 'PASS';
  const cleanupFailedStrictly = cleanup?.strict && cleanup.status === 'FAIL';
  const statusCode = cleanupFailedStrictly ? 'FAIL' : productStatus;
  const status = statusCode === 'FAIL'
    ? cleanupFailedStrictly && productStatus !== 'FAIL'
      ? '**Status: FAIL** (strict post-suite cleanup failed; product tests passed)'
      : `**Status: FAIL** (${failed} failing, ${unknown} unknown)`
    : statusCode === 'INCOMPLETE'
      ? `**Status: INCOMPLETE** (${blocked} blocked, ${inconclusive} inconclusive, ${skipped} skipped)`
      : statusCode === 'DRY_RUN'
      ? '**Status: DRY RUN**'
      : '**Status: PASS**';

  const lines = [
    '# Split Parallel iOS Automation Report',
    '',
    status,
    '',
    `- Run ID: ${runId}`,
    `- Started: ${startedAt}`,
    `- Finished: ${finishedAt}`,
    `- Total wall time: ${formatDurationMs(durationMs)}`,
    `- Product status: ${productStatus}`,
    dryRun === total
      ? `- Result: dry run only (${total} tests selected)`
      : `- Result: ${passed}/${executed.length} executed tests passed`,
    `- Skipped: ${skipped}; blocked: ${blocked}; inconclusive: ${inconclusive}`,
    `- Lanes: ${lanes.map(lane => `${lane.label} (${lane.deviceName}, :${lane.appiumPort})`).join(' + ')}`,
    '',
    '## Lane Summaries',
    '',
    '| Lane | Exit Code | Device | Appium Port | Tests | Summary |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  lanes.forEach((lane, index) => {
    const summaryPath = path.join(path.resolve(__dirname, '..'), 'reports', 'runs', lane.runId, 'summary.md');
    lines.push(
      `| ${escapeCell(lane.label)} | ${escapeCell(laneCodes[index])} | ${escapeCell(lane.deviceName)} | ${escapeCell(lane.appiumPort)} | ${escapeCell(lane.tests)} | ${relativeLink(reportPath, summaryPath, 'summary')} |`
    );
  });

  if (cleanup?.enabled) {
    lines.push(
      '',
      '## Post-Suite Cleanup',
      '',
      `- Status: ${cleanup.status}`,
      `- Strict mode: ${cleanup.strict ? 'enabled' : 'disabled'}`,
      `- Physical lane: ${cleanup.laneLabel || ''}`,
      `- Result: ${cleanup.error || cleanup.result?.error || cleanup.reason || 'Generated-room cleanup completed'}`
    );
  }

  if (failures.length) {
    lines.push(
      '',
      '## Needs Attention',
      '',
      '| Test | Lane | Status | Duration | Error | Artifacts |',
      '| --- | --- | --- | --- | --- | --- |'
    );
    failures.forEach(result => {
      lines.push(
        `| ${escapeCell(result.name)} | ${escapeCell(result.laneLabel)} | ${escapeCell(result.status)} | ${escapeCell(result.duration)} | ${escapeCell(result.error)} | ${artifactLinks({ reportPath, result })} |`
      );
    });
  }

  if (slowest.length) {
    lines.push('', '## Slowest Tests', '', '| Test | Lane | Duration | Status |', '| --- | --- | --- | --- |');
    slowest.forEach(result => {
      lines.push(
        `| ${escapeCell(result.name)} | ${escapeCell(result.laneLabel)} | ${escapeCell(result.duration || formatDurationMs(result.durationMs))} | ${escapeCell(result.status)} |`
      );
    });
  }

  const timings = buildTimingSummary({ lanes: reportedLanes, results });
  lines.push('');
  appendPhaseTimingSection(lines, timings);

  lines.push(
    '',
    '## Full Results',
    '',
    '| Test | Category | Physical Lane | Status | Duration | Device | Appium Port | Artifacts |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  );
  results.forEach(result => {
    lines.push(
      `| ${escapeCell(result.name)} | ${escapeCell(result.logicalCategory)} | ${escapeCell(result.laneLabel)} | ${escapeCell(result.status)} | ${escapeCell(result.duration)} | ${escapeCell(result.deviceName)} | ${escapeCell(result.appiumPort)} | ${artifactLinks({ reportPath, result })} |`
    );
  });

  writeReportArtifacts({
    reportPath,
    lines,
    summary: {
      runId,
      status: statusCode,
      productStatus,
      startedAt,
      updatedAt: finishedAt,
      durationMs,
      counts: { total, passed, failed, unknown, skipped, blocked, inconclusive, dryRun },
      lanes: reportedLanes.map(lane => ({
        label: lane.label,
        runId: lane.runId,
        deviceName: lane.deviceName,
        appiumPort: lane.appiumPort,
        wdaPort: lane.wdaPort,
        tests: listCsv(lane.tests),
        assignments: listCsv(lane.tests).map(name => ({
          name,
          logicalCategory: lane.logicalCategories?.[name] || lane.label,
        })),
        timings: lane.timings,
      })),
      results,
      coverage: coverageFor(results.map(result => result.name)),
      timings,
      cleanup,
    },
  });
  return { passed, failed, unknown, skipped, blocked, inconclusive, dryRun, total };
}

function appiumStatus(port) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/status', timeout: 1500 }, res => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function installAppOnLanes(lanes) {
  if (process.env.SPLIT_INSTALL_APP !== '1') {
    return;
  }

  const appPath = process.env.CONNECT_APP_PATH;
  if (!appPath) {
    throw new Error('SPLIT_INSTALL_APP=1 requires CONNECT_APP_PATH=/path/to/Connect iOS.app');
  }
  if (!fs.existsSync(appPath)) {
    throw new Error(`CONNECT_APP_PATH does not exist: ${appPath}`);
  }

  for (const lane of lanes) {
    if (!lane.udid) {
      throw new Error(`Cannot install app for ${lane.label}; lane has no simulator UDID`);
    }

    console.log(`[${lane.label}] installing app on ${lane.udid}`);
    const result = spawnSync('xcrun', ['simctl', 'install', lane.udid, appPath], {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      throw new Error(`[${lane.label}] app install failed: ${detail}`);
    }
  }
}

function assertAppInstalledOnLanes(lanes) {
  if (process.env.SPLIT_INSTALL_APP === '1' || process.env.SPLIT_SKIP_APP_INSTALL_CHECK === '1') {
    return;
  }

  for (const lane of lanes) {
    const result = spawnSync(
      'xcrun',
      ['simctl', 'get_app_container', lane.udid, BUNDLE_ID, 'app'],
      { encoding: 'utf8' }
    );
    if (result.status !== 0) {
      throw new Error(
        `[${lane.label}] ${BUNDLE_ID} is not installed on ${lane.deviceName} (${lane.udid}). ` +
          'Install Connect first, set SPLIT_INSTALL_APP=1 with CONNECT_APP_PATH, or run npm run doctor.'
      );
    }
  }
}

async function runLane(lane) {
  console.log(`[${lane.label}] starting on Appium port ${lane.appiumPort}`);
  const child = spawnNodeChild(path.join(__dirname, 'runParallel.js'), [], {
    cwd: path.resolve(__dirname, '..'),
    env: lane.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  prefixOutput(child.stdout, lane.label);
  prefixOutput(child.stderr, lane.label);

  try {
    const { code, signal } = await waitForChild(child);
    const exitCode = Number.isInteger(code) ? code : 1;
    console.log(
      `[${lane.label}] finished with exit code ${exitCode}${signal ? ` (signal ${signal})` : ''}`
    );
    return exitCode;
  } catch (error) {
    console.error(`[${lane.label}] failed to start: ${error.message}`);
    return 1;
  }
}

async function prepareLane(lane) {
  console.log(`[${lane.label}] checking login before tests`);
  const child = spawnNodeChild(
    path.resolve(__dirname, '..', 'scripts', 'prepareSimulatorLane.js'),
    [],
    {
      cwd: path.resolve(__dirname, '..'),
      env: lane.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  prefixOutput(child.stdout, lane.label);
  prefixOutput(child.stderr, lane.label);
  const { code } = await waitForChild(child);
  if (code === 0) {
    console.log(`[${lane.label}] login ready`);
    return;
  }
  throw new Error(`[${lane.label}] login preflight failed with exit code ${code}`);
}

async function runPostSuiteCleanup(lanes, combinedRunId) {
  const enabled = process.env.SPLIT_POST_RUN_CLEANUP === '1';
  const strict = process.env.SPLIT_POST_RUN_CLEANUP_STRICT === '1';
  if (!enabled) return { enabled: false, strict, status: 'DISABLED' };
  if (process.env.PARALLEL_DRY_RUN === '1') {
    return { enabled: true, strict, status: 'SKIPPED', reason: 'Dry run does not mutate rooms' };
  }

  const requestedLane = process.env.SPLIT_POST_RUN_CLEANUP_LANE || '';
  const sourceLane = lanes.find(lane => lane.label === requestedLane) || lanes[0];
  const cleanupLane = makeLane({
    label: sourceLane.label,
    runId: envValue('SPLIT_CLEANUP_RUN_ID', `${combinedRunId}-cleanup`),
    tests: 'removeAllrooms',
    deviceName: sourceLane.deviceName,
    udid: sourceLane.udid,
    appiumPort: sourceLane.appiumPort,
    wdaPort: sourceLane.wdaPort,
    derivedDataPath: sourceLane.derivedDataPath,
    logicalCategories: { removeAllrooms: 'Cleanup' },
  });
  cleanupLane.env.PARALLEL_SESSION_START_DELAY_MS = '0';

  console.log(`[split] product suite finished; starting generated-room cleanup on ${sourceLane.label}`);
  const code = await runLane(cleanupLane);
  const result = loadLaneResults(cleanupLane, code)[0];
  return {
    enabled: true,
    strict,
    status: code === 0 ? 'PASS' : 'FAIL',
    code,
    laneLabel: sourceLane.label,
    laneRunId: cleanupLane.runId,
    result,
    ...(code === 0 ? {} : { error: result?.error || `Cleanup exited with code ${code}` }),
  };
}

function shouldFailSplitCommand(productCodes, cleanup = {}) {
  return productCodes.some(code => code !== 0) || (cleanup.strict && cleanup.status === 'FAIL');
}

async function run() {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const useThirdLane = process.env.SPLIT_THIRD_ENABLED === '1' || process.env.SPLIT_LANE_COUNT === '3';
  const combinedRunId = envValue(
    'SPLIT_COMBINED_RUN_ID',
    defaultRunId(useThirdLane ? 'split3-combined' : 'split-combined')
  );
  const combinedRoot = ensureDir(path.resolve(__dirname, '..', 'reports', 'runs', combinedRunId));
  const combinedReportPath = path.join(combinedRoot, 'summary.md');
  const mainTestList = listCsv(
    envValue('SPLIT_MAIN_TESTS', useThirdLane ? THREE_LANE_MAIN_TESTS : MAIN_TESTS)
  );
  const standaloneTestList = listCsv(
    envValue(
      'SPLIT_STANDALONE_TESTS',
      useThirdLane ? THREE_LANE_CONVERSATION_LIST_TESTS : STANDALONE_TESTS
    )
  );
  const conversationViewTestList = listCsv(
    envValue('SPLIT_THIRD_TESTS', THREE_LANE_CONVERSATION_VIEW_TESTS)
  );
  const hasMainBalanceOverride = process.env.SPLIT_BALANCED_CONVERSATION_VIEW_TESTS != null;
  const hasListBalanceOverride =
    process.env.SPLIT_LIST_BALANCED_CONVERSATION_VIEW_TESTS != null;
  const hasBalanceOverrides = hasMainBalanceOverride || hasListBalanceOverride;
  const selectedBalancedTests = hasBalanceOverrides
    ? listCsv(
        hasMainBalanceOverride
          ? process.env.SPLIT_BALANCED_CONVERSATION_VIEW_TESTS
          : DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS
      )
    : undefined;
  const selectedListBalancedTests = hasBalanceOverrides
    ? listCsv(
        hasListBalanceOverride
          ? process.env.SPLIT_LIST_BALANCED_CONVERSATION_VIEW_TESTS
          : DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS
      )
    : undefined;
  const historicalDurationEstimates = loadHistoricalDurationEstimates();
  const schedule = useThirdLane
    ? buildSplitThreeSchedule({
        mainTests: mainTestList,
        conversationListTests: standaloneTestList,
        conversationViewTests: conversationViewTestList,
        selectedConversationViewTests: selectedBalancedTests,
        selectedConversationListTests: selectedListBalancedTests,
        balancingEnabled: process.env.SPLIT_BALANCE_CONVERSATION_VIEW !== '0',
        durationEstimates: historicalDurationEstimates,
      })
    : null;
  const mainAssignments = schedule || {
    main: mainTestList.map(name => assignment(name, 'Main')),
    conversationList: standaloneTestList.map(name => assignment(name, 'Standalone')),
  };
  let lanes = [
    makeLane({
      label: 'main-suite',
      runId: envValue('SPLIT_MAIN_RUN_ID', defaultRunId('main-suite')),
      tests: testNames(mainAssignments.main),
      deviceName: envValue('SPLIT_MAIN_DEVICE_NAME', 'iPhone 17 Pro'),
      udid: envValue('SPLIT_MAIN_UDID', ''),
      appiumPort: envValue('SPLIT_MAIN_APPIUM_PORT', '4723'),
      wdaPort: envValue('SPLIT_MAIN_WDA_PORT', '8100'),
      derivedDataPath: envValue('SPLIT_MAIN_WDA_DERIVED_DATA_PATH', '/tmp/wda-main'),
      logicalCategories: categoriesForAssignments(mainAssignments.main),
    }),
    makeLane({
      label: useThirdLane ? 'Conversation-List' : 'standalones',
      runId: envValue(
        'SPLIT_STANDALONE_RUN_ID',
        defaultRunId(useThirdLane ? 'Conversation-List' : 'standalones')
      ),
      tests: testNames(mainAssignments.conversationList),
      deviceName: envValue('SPLIT_STANDALONE_DEVICE_NAME', 'iPhone 17 Pro Max'),
      udid: envValue('SPLIT_STANDALONE_UDID', ''),
      appiumPort: envValue('SPLIT_STANDALONE_APPIUM_PORT', '4725'),
      wdaPort: envValue('SPLIT_STANDALONE_WDA_PORT', '8200'),
      derivedDataPath: envValue('SPLIT_STANDALONE_WDA_DERIVED_DATA_PATH', '/tmp/wda-standalones'),
      logicalCategories: categoriesForAssignments(mainAssignments.conversationList),
    }),
  ];

  if (useThirdLane) {
    lanes.push(
      makeLane({
        label: 'ConversationView',
        runId: envValue('SPLIT_THIRD_RUN_ID', defaultRunId('ConversationView')),
        tests: testNames(schedule.conversationView),
        deviceName: envValue('SPLIT_THIRD_DEVICE_NAME', 'iPhone 17'),
        udid: envValue('SPLIT_THIRD_UDID', ''),
        appiumPort: envValue('SPLIT_THIRD_APPIUM_PORT', '4727'),
        wdaPort: envValue('SPLIT_THIRD_WDA_PORT', '8300'),
        derivedDataPath: envValue('SPLIT_THIRD_WDA_DERIVED_DATA_PATH', '/tmp/wda-conversation-view'),
        logicalCategories: categoriesForAssignments(schedule.conversationView),
      })
    );
  }

  if (schedule?.movedToMain.length) {
    console.log(
      `[split] balanced ConversationView tests onto main-suite: ${schedule.movedToMain.join(', ')}`
    );
  }
  if (schedule?.movedToConversationList.length) {
    console.log(
      `[split] balanced ConversationView tests onto Conversation-List: ` +
        schedule.movedToConversationList.join(', ')
    );
  }
  if (schedule) {
    const estimates = schedule.estimatedLaneDurationMs;
    console.log(
      `[split] estimated lane durations: main-suite=${formatDurationMs(estimates.main)}, ` +
        `Conversation-List=${formatDurationMs(estimates.conversationList)}, ` +
        `ConversationView=${formatDurationMs(estimates.conversationView)}`
    );
  }

  const configuredSessionStaggerMs = Number.parseInt(process.env.SPLIT_SESSION_STAGGER_MS, 10);
  const sessionStaggerMs = Math.max(
    0,
    Number.isFinite(configuredSessionStaggerMs)
      ? configuredSessionStaggerMs
      : DEFAULT_SESSION_STAGGER_MS
  );
  lanes = lanes.map((lane, index) => ({
    ...lane,
    env: {
      ...lane.env,
      PARALLEL_SESSION_START_DELAY_MS:
        lane.env.PARALLEL_SESSION_START_DELAY_MS || String(sessionStaggerMs * index),
      WDIO_LOG_LEVEL: lane.env.WDIO_LOG_LEVEL || 'error',
    },
  }));

  if (process.env.PARALLEL_DRY_RUN !== '1') {
    lanes = resolveLaneUdids(lanes).map(withResolvedLaneEnvironment);
    lanes.forEach(lane => console.log(`[${lane.label}] using ${lane.deviceName} (${lane.udid})`));
  }

  const shouldCheckAppium = process.env.PARALLEL_DRY_RUN !== '1' && process.env.SPLIT_SKIP_APPIUM_CHECK !== '1';
  if (process.env.PARALLEL_DRY_RUN !== '1') {
    installAppOnLanes(lanes);
    assertAppInstalledOnLanes(lanes);
  }

  if (shouldCheckAppium) {
    for (const lane of lanes) {
      if (!(await appiumStatus(lane.appiumPort))) {
        throw new Error(`Appium is not responding on port ${lane.appiumPort}. Start it before running this script.`);
      }
    }
  }

  if (process.env.SPLIT_LOGIN_PREFLIGHT === '1' && process.env.PARALLEL_DRY_RUN !== '1') {
    await Promise.all(lanes.map(prepareLane));
  }

  const codes = await Promise.all(lanes.map(runLane));
  const reportLanes = [...lanes];

  // Conversation layout and sorting are account-wide settings. Run this coverage only
  // after the feature lanes finish so another simulator cannot have its list reordered
  // while it is searching for a room or conversation.
  if (process.env.SPLIT_EXCLUSIVE_SETTINGS !== '0') {
    const sourceLane = lanes[1] || lanes[0];
    const exclusiveLane = makeLane({
      label: sourceLane.label,
      runId: envValue('SPLIT_SETTINGS_RUN_ID', `${sourceLane.runId}-settings`),
      tests: envValue('SPLIT_SETTINGS_TESTS', EXCLUSIVE_SETTINGS_TESTS),
      deviceName: sourceLane.deviceName,
      udid: sourceLane.udid,
      appiumPort: sourceLane.appiumPort,
      wdaPort: sourceLane.wdaPort,
      derivedDataPath: sourceLane.derivedDataPath,
      logicalCategories: Object.fromEntries(
        listCsv(envValue('SPLIT_SETTINGS_TESTS', EXCLUSIVE_SETTINGS_TESTS)).map(name => [
          name,
          'Conversation-List',
        ])
      ),
    });
    console.log(`[split] feature lanes finished; starting exclusive account-settings coverage`);
    codes.push(await runLane(exclusiveLane));
    reportLanes.push(exclusiveLane);
  }


  const cleanup = await runPostSuiteCleanup(lanes, combinedRunId);

  const combined = writeCombinedReport({
    reportPath: combinedReportPath,
    runId: combinedRunId,
    lanes: reportLanes,
    laneCodes: codes,
    durationMs: Math.round(performance.now() - started),
    startedAt,
    cleanup,
  });
  const combinedStatus = combined.dryRun === combined.total
    ? `dry run (${combined.total} selected)`
    : `${combined.passed}/${combined.total - combined.dryRun} executed passed`;
  console.log(`[split] combined report ${combinedReportPath} (${combinedStatus})`);

  if (shouldFailSplitCommand(codes, cleanup)) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

module.exports = {
  buildSplitThreeSchedule,
  defaultRunId,
  loadHistoricalDurationEstimates,
  run,
  shouldFailSplitCommand,
};
