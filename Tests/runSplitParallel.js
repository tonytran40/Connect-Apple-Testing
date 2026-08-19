require('dotenv').config();

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');
const {
  buildTimingSummary,
  formatDurationMs,
  mergePhaseTimings,
  normalizePhaseTimings,
} = require('../utils/reportWriter');
const { resolveLaneUdids } = require('../utils/simulatorConfig');

const MAIN_TESTS = 'CreateRoom,PinnedMessageEditFlow,markdowns,newMessage';
const STANDALONE_TESTS = 'attachments,editRoom,membersRoom,favoriteRoom,markAsRead,removeRoom,notifications,Reactions,ComposerTypeahead,MessageActions,RoomNotificationPreferences';
const THREE_LANE_MAIN_TESTS = 'CreateRoom,newMessage';
const THREE_LANE_CONVERSATION_LIST_TESTS = 'favoriteRoom,markAsRead,notifications,removeRoom';
const THREE_LANE_CONVERSATION_VIEW_TESTS = 'PinnedMessageEditFlow,Reactions,markdowns,attachments,editRoom,membersRoom,ComposerTypeahead,MessageActions,RoomNotificationPreferences';
const EXCLUSIVE_SETTINGS_TESTS = 'ConversationList';
const DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS = 'PinnedMessageEditFlow,Reactions';
const DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS = 'ComposerTypeahead,MessageActions,RoomNotificationPreferences';
const PHOTO_READY_TESTS = new Set(['attachments']);
const SAFE_CONVERSATION_VIEW_BALANCE_TESTS = new Set([
  'PinnedMessageEditFlow',
  'Reactions',
  'markdowns',
  'editRoom',
  'membersRoom',
  'ComposerTypeahead',
  'MessageActions',
  'RoomNotificationPreferences',
]);
const DEFAULT_SESSION_STAGGER_MS = 6000;
const BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';

function envValue(name, fallback) {
  return process.env[name] || fallback;
}

function defaultRunId(runId, env = process.env) {
  return env.PARALLEL_DRY_RUN === '1' ? `${runId}-dry-run` : runId;
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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

function assertUniqueTests(groups) {
  const seen = new Map();
  for (const [group, tests] of Object.entries(groups)) {
    for (const name of tests) {
      if (seen.has(name)) {
        throw new Error(`Split test "${name}" is assigned to both ${seen.get(name)} and ${group}`);
      }
      seen.set(name, group);
    }
  }
}

function buildSplitThreeSchedule({
  mainTests,
  conversationListTests,
  conversationViewTests,
  selectedConversationViewTests = listCsv(DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS),
  selectedConversationListTests = listCsv(DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS),
  balancingEnabled = true,
}) {
  const groups = {
    main: [...mainTests],
    conversationList: [...conversationListTests],
    conversationView: [...conversationViewTests],
  };
  assertUniqueTests(groups);

  for (const photoTest of PHOTO_READY_TESTS) {
    const source = Object.keys(groups).find(group => groups[group].includes(photoTest));
    if (source && source !== 'conversationView') {
      groups[source] = groups[source].filter(name => name !== photoTest);
      groups.conversationView.push(photoTest);
    }
  }

  const selectedMain = new Set(selectedConversationViewTests);
  const selectedList = new Set(selectedConversationListTests);
  const overlappingSelections = [...selectedMain].filter(name => selectedList.has(name));
  if (overlappingSelections.length) {
    throw new Error(
      `ConversationView balance targets overlap: ${overlappingSelections.join(', ')}`
    );
  }

  const movedToMain = balancingEnabled
    ? groups.conversationView.filter(
        name => selectedMain.has(name) && SAFE_CONVERSATION_VIEW_BALANCE_TESTS.has(name)
      )
    : [];
  const movedToConversationList = balancingEnabled
    ? groups.conversationView.filter(
        name => selectedList.has(name) && SAFE_CONVERSATION_VIEW_BALANCE_TESTS.has(name)
      )
    : [];
  const moved = new Set([...movedToMain, ...movedToConversationList]);
  const mainAssignments = [
    ...groups.main.map(name => assignment(name, 'main-suite')),
    ...movedToMain.map(name => assignment(name, 'ConversationView')),
  ];

  return {
    main: [
      ...mainAssignments.filter(item => item.name !== 'newMessage'),
      ...mainAssignments.filter(item => item.name === 'newMessage'),
    ],
    conversationList: [
      ...groups.conversationList.map(name => assignment(name, 'Conversation-List')),
      ...movedToConversationList.map(name => assignment(name, 'ConversationView')),
    ],
    conversationView: groups.conversationView
      .filter(name => !moved.has(name))
      .map(name => assignment(name, 'ConversationView')),
    movedTests: [...movedToMain, ...movedToConversationList],
    movedToMain,
    movedToConversationList,
  };
}

function categoriesForAssignments(assignments) {
  return Object.fromEntries(assignments.map(item => [item.name, item.logicalCategory]));
}

function testNames(assignments) {
  return assignments.map(item => item.name).join(',');
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function relativeLink(fromFile, targetPath, label) {
  const rel = path.relative(path.dirname(fromFile), targetPath).replace(/\\/g, '/');
  return `[${label}](${encodeURI(rel)})`;
}

function artifactLinks({ reportPath, result }) {
  const links = [];
  if (result.summaryPath && fs.existsSync(result.summaryPath)) {
    links.push(relativeLink(reportPath, result.summaryPath, 'summary'));
  }
  if (result.status === 'DRY_RUN') {
    return links.join(' / ');
  }
  if (result.logPath && fs.existsSync(result.logPath)) {
    links.push(relativeLink(reportPath, result.logPath, 'log'));
  }
  if (result.resultPath && fs.existsSync(result.resultPath)) {
    links.push(relativeLink(reportPath, result.resultPath, 'json'));
  }
  if (result.screenshotDir && fs.existsSync(result.screenshotDir)) {
    links.push(relativeLink(reportPath, result.screenshotDir, 'screenshots'));
  }
  return links.join(' / ');
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

function timingRows(timings) {
  const labels = {
    sessionCreationMs: 'Session creation',
    loginReadinessMs: 'Login/readiness',
    testBodyMs: 'Test body',
    screenshotCaptureMs: 'Screenshot capture',
    recoveryMs: 'Recovery',
    reportGenerationMs: 'Report generation',
    roomCreationMs: 'Room creation (test-owned)',
  };
  return Object.entries(labels).map(([key, label]) => ({
    label,
    durationMs: timings?.phases?.[key] || 0,
  }));
}

function writeCombinedReport({ reportPath, runId, lanes, laneCodes, durationMs, startedAt, cleanup }) {
  const results = lanes.flatMap((lane, index) => loadLaneResults(lane, laneCodes[index]));
  const reportedLanes = lanes.map(laneWithReportedTimings);
  const passed = results.filter(result => result.status === 'PASS').length;
  const failed = results.filter(result => result.status === 'FAIL').length;
  const unknown = results.filter(result => result.status === 'UNKNOWN').length;
  const dryRun = results.filter(result => result.status === 'DRY_RUN').length;
  const total = results.length;
  const executed = results.filter(result => result.status !== 'DRY_RUN');
  const failures = results.filter(result => result.status === 'FAIL' || result.status === 'UNKNOWN');
  const slowest = [...results]
    .filter(result => Number.isFinite(result.durationMs))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 8);
  const finishedAt = new Date().toISOString();
  const productStatus = failed || unknown ? 'FAIL' : dryRun === total ? 'DRY_RUN' : 'PASS';
  const cleanupFailedStrictly = cleanup?.strict && cleanup.status === 'FAIL';
  const statusCode = cleanupFailedStrictly ? 'FAIL' : productStatus;
  const status = statusCode === 'FAIL'
    ? cleanupFailedStrictly && productStatus !== 'FAIL'
      ? '**Status: FAIL** (strict post-suite cleanup failed; product tests passed)'
      : `**Status: FAIL** (${failed} failing, ${unknown} unknown)`
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
  lines.push('', '## Phase Timings', '', '| Phase | Aggregate Duration |', '| --- | --- |');
  timingRows(timings).forEach(phase => {
    lines.push(`| ${phase.label} | ${formatDurationMs(phase.durationMs)} |`);
  });

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

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(
    reportPath.replace(/\.md$/, '.json'),
    `${JSON.stringify({
      runId,
      status: statusCode,
      productStatus,
      startedAt,
      updatedAt: finishedAt,
      durationMs,
      counts: { total, passed, failed, unknown, dryRun },
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
      timings,
      cleanup,
    }, null, 2)}\n`,
    'utf8'
  );
  return { passed, failed, unknown, dryRun, total };
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

function prefixOutput(stream, label) {
  let pending = '';
  stream.on('data', chunk => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      if (line) console.log(`[${label}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (pending) console.log(`[${label}] ${pending}`);
  });
}

async function runLane(lane) {
  return new Promise(resolve => {
    console.log(`[${lane.label}] starting on Appium port ${lane.appiumPort}`);
    const child = spawn(process.execPath, [path.join(__dirname, 'runParallel.js')], {
      cwd: path.resolve(__dirname, '..'),
      env: lane.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    prefixOutput(child.stdout, lane.label);
    prefixOutput(child.stderr, lane.label);

    child.on('close', (code, signal) => {
      const exitCode = Number.isInteger(code) ? code : 1;
      console.log(
        `[${lane.label}] finished with exit code ${exitCode}${signal ? ` (signal ${signal})` : ''}`
      );
      resolve(exitCode);
    });
  });
}

async function prepareLane(lane) {
  return new Promise((resolve, reject) => {
    console.log(`[${lane.label}] checking login before tests`);
    const child = spawn(process.execPath, [path.resolve(__dirname, '..', 'scripts', 'prepareSimulatorLane.js')], {
      cwd: path.resolve(__dirname, '..'),
      env: lane.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    prefixOutput(child.stdout, lane.label);
    prefixOutput(child.stderr, lane.label);
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        console.log(`[${lane.label}] login ready`);
        resolve();
        return;
      }
      reject(new Error(`[${lane.label}] login preflight failed with exit code ${code}`));
    });
  });
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
  const selectedBalancedTests = process.env.SPLIT_BALANCED_CONVERSATION_VIEW_TESTS == null
    ? listCsv(DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS)
    : listCsv(process.env.SPLIT_BALANCED_CONVERSATION_VIEW_TESTS);
  const selectedListBalancedTests = process.env.SPLIT_LIST_BALANCED_CONVERSATION_VIEW_TESTS == null
    ? listCsv(DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS)
    : listCsv(process.env.SPLIT_LIST_BALANCED_CONVERSATION_VIEW_TESTS);
  const schedule = useThirdLane
    ? buildSplitThreeSchedule({
        mainTests: mainTestList,
        conversationListTests: standaloneTestList,
        conversationViewTests: conversationViewTestList,
        selectedConversationViewTests: selectedBalancedTests,
        selectedConversationListTests: selectedListBalancedTests,
        balancingEnabled: process.env.SPLIT_BALANCE_CONVERSATION_VIEW !== '0',
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

module.exports = { buildSplitThreeSchedule, defaultRunId, run, shouldFailSplitCommand };
