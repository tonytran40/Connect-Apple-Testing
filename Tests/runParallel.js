require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
const {
  buildTimingSummary,
  formatDurationMs,
  mergePhaseTimings,
  normalizePhaseTimings,
} = require('../utils/reportWriter');
const { readScreenshotMetrics, resetScreenshotMetrics } = require('../utils/screenshots');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { ensureRoomsSectionReady } = require('../utils/testSession');
const { resolveLaneUdids } = require('../utils/simulatorConfig');

const MAIN_SUITE_TESTS = [
  'CreateRoom',
  'PinnedMessageEditFlow',
  'Reactions',
  'ComposerTypeahead',
  'MessageActions',
  'RoomNotificationPreferences',
  'markdowns',
  'ConversationList',
  'newMessage',
];

const STANDALONE_TESTS = [
  ...MAIN_SUITE_TESTS,
  'attachments',
  'editRoom',
  'membersRoom',
  'favoriteRoom',
  'markAsRead',
  'removeRoom',
  //'notifications',
];
const ACCOUNT_SETTINGS_TESTS = new Set(['ConversationList']);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function logicalCategoriesFromEnv() {
  try {
    const categories = JSON.parse(process.env.PARALLEL_LOGICAL_CATEGORIES || '{}');
    return categories && typeof categories === 'object' ? categories : {};
  } catch (error) {
    throw new Error(`PARALLEL_LOGICAL_CATEGORIES must be valid JSON: ${error.message}`);
  }
}

function addPhaseTiming(timings, key, elapsedMs) {
  timings[key] = (timings[key] || 0) + Math.max(0, Math.round(elapsedMs));
}

async function measurePhase(timings, key, runPhase) {
  const started = performance.now();
  try {
    return await runPhase();
  } finally {
    addPhaseTiming(timings, key, performance.now() - started);
  }
}

function resolveTests() {
  const requested = listEnv('PARALLEL_TESTS');
  if (!requested.length) return MAIN_SUITE_TESTS;
  if (requested.length === 1 && requested[0].toLowerCase() === 'all') return STANDALONE_TESTS;
  return requested.map(test => test.replace(/^Tests\//, '').replace(/\.js$/, ''));
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return process.env.PARALLEL_RUN_ID || `parallel-${stamp}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeLanes() {
  const udids = listEnv('PARALLEL_UDIDS');
  const ports = listEnv('PARALLEL_APPIUM_PORTS');
  const deviceNames = listEnv('PARALLEL_DEVICE_NAMES');
  const workerRequested = Number.parseInt(process.env.PARALLEL_WORKERS, 10) || 1;
  const allowSharedDevice = process.env.PARALLEL_ALLOW_SHARED_DEVICE === '1';
  const baseAppiumPort = Number.parseInt(process.env.APPIUM_PORT, 10) || 4723;
  const baseWdaPort = Number.parseInt(process.env.WDA_LOCAL_PORT, 10) || 8100;
  const baseDerivedDataPath = process.env.WDA_DERIVED_DATA_PATH || path.join('/tmp', 'wda-connect-parallel');

  let count = Math.max(workerRequested, udids.length, ports.length, deviceNames.length, 1);
  if (!allowSharedDevice && udids.length === 0 && deviceNames.length === 0 && count > 1) {
    console.warn(
      'runParallel: no PARALLEL_UDIDS or PARALLEL_DEVICE_NAMES set; limiting to 1 worker to avoid simulator collisions.'
    );
    count = 1;
  }

  return Array.from({ length: count }, (_, i) => ({
    index: i,
    udid: udids[i] || '',
    deviceName: deviceNames[i] || process.env.DEVICE_NAME || process.env.IOS_DEVICE_NAME || '',
    appiumPort: Number.parseInt(ports[i], 10) || baseAppiumPort + i,
    wdaLocalPort: baseWdaPort + i,
    derivedDataPath: `${baseDerivedDataPath}-${i}`,
    timings: normalizePhaseTimings(),
  }));
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

function artifactLinks({ reportPath, runId, result }) {
  const repoRoot = path.resolve(__dirname, '..');
  const links = [];

  if (result.logPath) {
    links.push(relativeLink(reportPath, result.logPath, 'log'));
  }

  const resultPath = path.join(repoRoot, 'reports', 'runs', runId, 'results', `${result.name}.json`);
  if (fs.existsSync(resultPath)) {
    links.push(relativeLink(reportPath, resultPath, 'json'));
  }

  const screenshotDir = path.join(repoRoot, 'screenshots', runId, result.name);
  if (fs.existsSync(screenshotDir)) {
    links.push(relativeLink(reportPath, screenshotDir, 'screenshots'));
  }

  return links.join(' / ');
}

function formatPercent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function truncate(value, max = 180) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function phaseTimingRows(timings) {
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
    key,
    label,
    durationMs: timings?.phases?.[key] || 0,
  }));
}

function writeAggregateReport({ reportPath, runId, results, durationMs, lanes, startedAt, tests }) {
  const passed = results.filter(result => result.status === 'PASS').length;
  const failed = results.filter(result => result.status === 'FAIL').length;
  const dryRun = results.filter(result => result.status === 'DRY_RUN').length;
  const total = (tests || results).length;
  const completed = results.length;
  const executed = results.filter(result => result.status !== 'DRY_RUN');
  const failures = results.filter(result => result.status === 'FAIL');
  const slowest = [...results]
    .filter(result => result.status !== 'DRY_RUN' && Number.isFinite(result.durationMs))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);
  const finishedAt = new Date().toISOString();
  const rerunFailures = failures.length
    ? `PARALLEL_TESTS=${failures.map(result => result.name).join(',')} npm run test:parallel`
    : '';
  const overallStatus = failed
    ? `**Status: FAIL** (${failed} failing)`
    : dryRun === total
      ? '**Status: DRY RUN**'
      : completed < total
        ? `**Status: RUNNING** (${completed}/${total} finished)`
        : '**Status: PASS**';
  const resultSummary = dryRun === total
    ? `- Result: dry run only (${total} tests selected)`
    : `- Result: ${passed}/${executed.length} executed passed (${formatPercent(passed, executed.length)})`;
  const timings = buildTimingSummary({ lanes, results });

  const lines = [
    '# Parallel iOS Automation Report',
    '',
    overallStatus,
    '',
    `- Run ID: ${runId}`,
    `- Started: ${startedAt || ''}`,
    `- Last Updated: ${finishedAt}`,
    `- Total duration: ${formatDurationMs(durationMs)}`,
    resultSummary,
    `- Completed: ${completed}/${total}`,
    `- Workers: ${lanes.length}`,
    `- Tests: ${(tests || results.map(result => result.name)).join(', ')}`,
    '',
  ];

  if (rerunFailures) {
    lines.push('## Rerun Failures', '', '```bash', rerunFailures, '```', '');
  }

  if (failures.length) {
    lines.push(
      '## Failures',
      '',
      '| Test | Duration | Worker | Error | Artifacts |',
      '| --- | --- | --- | --- | --- |'
    );

    for (const result of failures) {
      const duration = result.duration || formatDurationMs(result.durationMs);
      const worker = result.workerIndex != null ? `#${result.workerIndex}` : '';
      const error = truncate(result.error || result.notes || 'Failed without an error message');
      const artifacts = artifactLinks({ reportPath, runId, result });
      lines.push(
        `| ${escapeCell(result.name)} | ${escapeCell(duration)} | ${escapeCell(worker)} | ${escapeCell(error)} | ${artifacts} |`
      );
    }

    lines.push('');
  }

  if (slowest.length) {
    lines.push('## Slowest Tests', '', '| Test | Duration | Status |', '| --- | --- | --- |');
    for (const result of slowest) {
      lines.push(
        `| ${escapeCell(result.name)} | ${escapeCell(result.duration || formatDurationMs(result.durationMs))} | ${escapeCell(result.status)} |`
      );
    }
    lines.push('');
  }

  lines.push('## Phase Timings', '', '| Phase | Aggregate Duration |', '| --- | --- |');
  for (const phase of phaseTimingRows(timings)) {
    lines.push(`| ${phase.label} | ${formatDurationMs(phase.durationMs)} |`);
  }
  lines.push('');

  lines.push(
    '## Workers',
    '',
    '| Worker | Device | Simulator UDID | Appium Port | WDA Port | WDA Derived Data |',
    '| --- | --- | --- | --- | --- | --- |'
  );
  for (const lane of lanes) {
    lines.push(
      `| #${lane.index} | ${escapeCell(lane.deviceName || '(default)')} | ${escapeCell(lane.udid || '(default/booted)')} | ${escapeCell(lane.appiumPort)} | ${escapeCell(lane.wdaLocalPort)} | ${escapeCell(lane.derivedDataPath)} |`
    );
  }

  lines.push(
    '',
    '## Full Results',
    '',
    '| Test | Status | Duration | Worker | Started | Finished | Artifacts | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  );

  for (const result of results) {
    const status = result.status || 'UNKNOWN';
    const duration = result.duration || formatDurationMs(result.durationMs);
    const worker = result.workerIndex != null ? `#${result.workerIndex}` : '';
    const notes = truncate(result.error || result.notes || '');
    const artifacts = artifactLinks({ reportPath, runId, result });
    lines.push(
      `| ${escapeCell(result.name)} | ${escapeCell(status)} | ${escapeCell(duration)} | ${escapeCell(worker)} | ${escapeCell(result.startedAt || '')} | ${escapeCell(result.finishedAt || '')} | ${artifacts} | ${escapeCell(notes)} |`
    );
  }

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(
    reportPath.replace(/\.md$/, '.json'),
    `${JSON.stringify({
      runId,
      status: failed ? 'FAIL' : dryRun === total ? 'DRY_RUN' : completed < total ? 'RUNNING' : 'PASS',
      startedAt,
      updatedAt: finishedAt,
      durationMs,
      counts: {
        total,
        completed,
        passed,
        failed,
        dryRun,
      },
      tests: tests || results.map(result => result.name),
      lanes,
      results,
      timings,
    }, null, 2)}\n`,
    'utf8'
  );
}

function runOneTest({
  testName,
  lane,
  runId,
  resultDir,
  logDir,
  logicalCategory,
  skipLoginCheck = false,
}) {
  return new Promise(resolve => {
    const testPath = path.resolve(__dirname, `${testName}.js`);
    const startedAt = new Date().toISOString();
    const started = performance.now();

    if (!fs.existsSync(testPath)) {
      resolve({
        name: testName,
        status: 'FAIL',
        durationMs: 0,
        duration: '0s',
        workerIndex: lane.index,
        logicalCategory,
        startedAt,
        finishedAt: new Date().toISOString(),
        timings: normalizePhaseTimings(),
        error: `Test file not found: ${testPath}`,
      });
      return;
    }

    const logPath = path.join(logDir, `${testName}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: 'w' });
    const staleResultFile = path.join(resultDir, `${testName}.json`);
    if (fs.existsSync(staleResultFile)) fs.unlinkSync(staleResultFile);
    resetScreenshotMetrics(testName, { resultDir });
    const env = {
      ...process.env,
      TEST_RUN_ID: runId,
      PARALLEL_RUN_ID: runId,
      TEST_RESULT_DIR: resultDir,
      TEST_WORKER_INDEX: String(lane.index),
      APPIUM_PORT: String(lane.appiumPort),
      WDA_LOCAL_PORT: String(lane.wdaLocalPort),
      WDA_DERIVED_DATA_PATH: lane.derivedDataPath,
      RUN_SINGLE_SKIP_LOGIN_CHECK: skipLoginCheck ? '1' : '0',
      WDIO_LOG_LEVEL: process.env.WDIO_LOG_LEVEL || 'error',
    };

    if (lane.deviceName) {
      env.DEVICE_NAME = lane.deviceName;
    }

    if (lane.udid) {
      env.SIMULATOR_UDID = lane.udid;
    }

    const child = spawn(process.execPath, [__filename, '--run-one-instrumented', testName], {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    let settled = false;
    child.on('error', error => {
      if (settled) return;
      settled = true;
      logStream.end();
      resolve({
        name: testName,
        status: 'FAIL',
        durationMs: Math.round(performance.now() - started),
        duration: formatDurationMs(Math.round(performance.now() - started)),
        workerIndex: lane.index,
        logicalCategory,
        startedAt,
        finishedAt: new Date().toISOString(),
        logPath,
        timings: normalizePhaseTimings(),
        error: `Could not start test process: ${error.message}`,
      });
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;
      logStream.end();
      const durationMs = Math.round(performance.now() - started);
      const resultFile = path.join(resultDir, `${testName}.json`);
      const timedResult = readJsonIfExists(resultFile);
      const screenshot = readScreenshotMetrics(testName, { resultDir });
      const measuredDurationMs = Math.round(performance.now() - started);
      const fallbackTimings = normalizePhaseTimings({
        testBodyMs: Math.max(0, measuredDurationMs - screenshot.captureMs),
        screenshotCaptureMs: screenshot.captureMs,
      });
      resolve({
        name: testName,
        status: code === 0 ? 'PASS' : 'FAIL',
        durationMs,
        duration: formatDurationMs(durationMs),
        workerIndex: lane.index,
        appiumPort: lane.appiumPort,
        udid: lane.udid,
        deviceName: lane.deviceName,
        wdaLocalPort: lane.wdaLocalPort,
        derivedDataPath: lane.derivedDataPath,
        loginCheckSkipped: skipLoginCheck,
        startedAt,
        finishedAt: new Date().toISOString(),
        logPath,
        ...(timedResult || {}),
        logicalCategory: timedResult?.logicalCategory || logicalCategory,
        timings: timedResult?.timings || fallbackTimings,
        screenshotMetrics: timedResult?.screenshotMetrics || screenshot,
        ...(code === 0 ? {} : { error: timedResult?.error || `Exited with code ${code}` }),
      });
    });
  });
}

function testModule(testName) {
  const testPath = path.resolve(__dirname, `${testName}.js`);
  if (!fs.existsSync(testPath)) {
    throw new Error(`Test file not found: ${testPath}`);
  }
  const loaded = require(testPath);
  if (typeof loaded.run !== 'function') {
    throw new Error(`Test "${testName}" does not export run()`);
  }
  return loaded;
}

function writeResultFile(resultDir, result) {
  fs.writeFileSync(
    path.join(resultDir, `${result.name}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8'
  );
}

async function runInstrumentedChild(testName) {
  const resultDir = ensureDir(process.env.TEST_RESULT_DIR || path.resolve(__dirname, '..', 'reports'));
  const logicalCategory = logicalCategoriesFromEnv()[testName] || '';
  const skipLoginCheck = process.env.RUN_SINGLE_SKIP_LOGIN_CHECK === '1';
  const timings = normalizePhaseTimings();
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let driver;
  let error;

  resetScreenshotMetrics(testName, { resultDir });
  try {
    driver = await measurePhase(timings, 'sessionCreationMs', () => createDriver());
    if (!skipLoginCheck) {
      await measurePhase(timings, 'loginReadinessMs', () => ensureLoggedIn(driver));
    }
    await measurePhase(timings, 'loginReadinessMs', () => ensureRoomsSectionReady(driver));

    const bodyStarted = performance.now();
    let ownedResult;
    try {
      ownedResult = await testModule(testName).run(driver, { skipLogin: true });
    } finally {
      const screenshot = readScreenshotMetrics(testName, { resultDir });
      addPhaseTiming(
        timings,
        'testBodyMs',
        Math.max(0, performance.now() - bodyStarted - screenshot.captureMs)
      );
      Object.assign(timings, mergePhaseTimings(timings, ownedResult?.timings));
    }
  } catch (caught) {
    error = caught;
  } finally {
    if (driver) await driver.deleteSession().catch(() => {});
  }

  const durationMs = Math.round(performance.now() - started);
  const screenshot = readScreenshotMetrics(testName, { resultDir });
  const result = {
    name: testName,
    status: error ? 'FAIL' : 'PASS',
    durationMs,
    duration: formatDurationMs(durationMs),
    logicalCategory,
    startedAt,
    finishedAt: new Date().toISOString(),
    timings: mergePhaseTimings(timings, { screenshotCaptureMs: screenshot.captureMs }),
    screenshotMetrics: screenshot,
    ...(error ? { error: error?.message || String(error) } : {}),
  };
  writeResultFile(resultDir, result);
  if (error) throw error;
}

async function runOneTestWithDriver({ testName, lane, driver, resultDir, logDir, logicalCategory }) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const logPath = path.join(logDir, `${testName}.log`);
  const timings = normalizePhaseTimings();
  let error;
  let ownedResult;

  fs.writeFileSync(logPath, `Starting ${testName} on ${lane.deviceName || lane.udid}\n`, 'utf8');
  resetScreenshotMetrics(testName, { resultDir });
  try {
    await measurePhase(timings, 'loginReadinessMs', () => ensureRoomsSectionReady(driver));
    const bodyStarted = performance.now();
    try {
      ownedResult = await testModule(testName).run(driver, { skipLogin: true });
    } finally {
      const screenshot = readScreenshotMetrics(testName);
      addPhaseTiming(
        timings,
        'testBodyMs',
        Math.max(0, performance.now() - bodyStarted - screenshot.captureMs)
      );
    }
  } catch (caught) {
    error = caught;
    fs.appendFileSync(logPath, `${caught?.stack || caught}\n`, 'utf8');
  }
  const screenshot = readScreenshotMetrics(testName);
  const mergedTimings = mergePhaseTimings(timings, ownedResult?.timings, {
    screenshotCaptureMs: screenshot.captureMs,
  });

  const durationMs = Math.round(performance.now() - started);
  const result = {
    name: testName,
    status: error ? 'FAIL' : 'PASS',
    durationMs,
    duration: formatDurationMs(durationMs),
    workerIndex: lane.index,
    logicalCategory,
    appiumPort: lane.appiumPort,
    udid: lane.udid,
    deviceName: lane.deviceName,
    wdaLocalPort: lane.wdaLocalPort,
    derivedDataPath: lane.derivedDataPath,
    loginCheckSkipped: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    logPath,
    timings: mergedTimings,
    screenshotMetrics: screenshot,
    ...(error ? { error: error?.message || String(error) } : {}),
  };
  writeResultFile(resultDir, result);
  return result;
}

async function run() {
  const runId = makeRunId();
  const rootDir = ensureDir(path.resolve(__dirname, '..', 'reports', 'runs', runId));
  const resultDir = ensureDir(path.join(rootDir, 'results'));
  const logDir = ensureDir(path.join(rootDir, 'logs'));
  const reportPath = path.join(rootDir, 'summary.md');
  const tests = resolveTests();
  const logicalCategories = logicalCategoriesFromEnv();
  let lanes = makeLanes();
  if (
    process.env.PARALLEL_DRY_RUN !== '1' &&
    process.env.PARALLEL_ALLOW_SHARED_DEVICE !== '1' &&
    (lanes.length > 1 || lanes.some(lane => lane.udid))
  ) {
    lanes = resolveLaneUdids(lanes);
  }
  const exclusiveTests =
    lanes.length > 1 ? tests.filter(testName => ACCOUNT_SETTINGS_TESTS.has(testName)) : [];
  const pending = tests.filter(testName => !exclusiveTests.includes(testName));
  const results = [];
  const started = performance.now();
  const startedAt = new Date().toISOString();

  console.log(`runParallel: runId=${runId}`);
  console.log(`runParallel: tests=${tests.join(', ')}`);
  console.log(`runParallel: workers=${lanes.length}`);

  if (process.env.PARALLEL_DRY_RUN === '1') {
    const dryResults = tests.map((testName, index) => ({
      name: testName,
      status: 'DRY_RUN',
      durationMs: 0,
      duration: '0s',
      workerIndex: lanes[index % lanes.length].index,
      logicalCategory: logicalCategories[testName] || '',
      timings: normalizePhaseTimings(),
      notes: 'Not executed',
    }));
    writeAggregateReport({ reportPath, runId, results: dryResults, durationMs: 0, lanes, startedAt, tests });
    console.log(`runParallel: dry run report ${reportPath}`);
    return;
  }

  async function worker(lane) {
    const loginOncePerWorker = process.env.PARALLEL_LOGIN_ONCE_PER_WORKER === '1';
    let hasCompletedLoginCheck = false;

    while (pending.length) {
      const testName = pending.shift();
      const skipLoginCheck = loginOncePerWorker && hasCompletedLoginCheck;
      console.log(
        `runParallel: worker #${lane.index} starting ${testName}${skipLoginCheck ? ' (login check skipped)' : ''}`
      );
      const result = await runOneTest({
        testName,
        lane,
        runId,
        resultDir,
        logDir,
        logicalCategory: logicalCategories[testName] || '',
        skipLoginCheck,
      });
      if (loginOncePerWorker && result.status === 'PASS' && !skipLoginCheck) {
        hasCompletedLoginCheck = true;
      }
      results.push(result);
      console.log(
        `runParallel: worker #${lane.index} ${result.status} ${testName} in ${formatDurationMs(result.durationMs)}`
      );
      writeAggregateReport({
        reportPath,
        runId,
        results: [...results].sort((a, b) => tests.indexOf(a.name) - tests.indexOf(b.name)),
        durationMs: Math.round(performance.now() - started),
        lanes,
        startedAt,
        tests,
      });
    }
  }

  async function persistentWorker(lane) {
    let driver;
    let setupError;
    try {
      const sessionStartDelayMs = Number.parseInt(process.env.PARALLEL_SESSION_START_DELAY_MS, 10) || 0;
      if (sessionStartDelayMs > 0) {
        console.log(
          `runParallel: worker #${lane.index} staggering Appium session start by ${sessionStartDelayMs}ms`
        );
        await sleep(sessionStartDelayMs);
      }
      console.log(`runParallel: worker #${lane.index} creating reusable Appium session`);
      driver = await measurePhase(lane.timings, 'sessionCreationMs', () => createDriver());
      await measurePhase(lane.timings, 'loginReadinessMs', () => ensureLoggedIn(driver));
    } catch (error) {
      setupError = error;
    }

    try {
      while (pending.length) {
        const testName = pending.shift();
        let result;
        if (setupError) {
          const now = new Date().toISOString();
          result = {
            name: testName,
            status: 'FAIL',
            durationMs: 0,
            duration: '0s',
            workerIndex: lane.index,
            appiumPort: lane.appiumPort,
            udid: lane.udid,
            deviceName: lane.deviceName,
            startedAt: now,
            finishedAt: now,
            logicalCategory: logicalCategories[testName] || '',
            timings: normalizePhaseTimings(),
            error: `Lane setup failed: ${setupError?.message || setupError}`,
          };
          writeResultFile(resultDir, result);
        } else {
          console.log(`runParallel: worker #${lane.index} starting ${testName} (reused session)`);
          result = await runOneTestWithDriver({
            testName,
            lane,
            driver,
            resultDir,
            logDir,
            logicalCategory: logicalCategories[testName] || '',
          });

          if (result.status === 'FAIL') {
            const recoveryTimings = normalizePhaseTimings();
            try {
              await measurePhase(recoveryTimings, 'recoveryMs', async () => {
                await ensureLoggedIn(driver);
                await ensureRoomsSectionReady(driver);
              });
            } catch (recoveryError) {
              console.warn(
                `runParallel: worker #${lane.index} session recovery failed; recreating session: ` +
                  `${recoveryError?.message || recoveryError}`
              );
              await driver.deleteSession().catch(() => {});
              driver = undefined;
              try {
                driver = await measurePhase(lane.timings, 'sessionCreationMs', () => createDriver());
                await measurePhase(lane.timings, 'loginReadinessMs', () => ensureLoggedIn(driver));
                setupError = undefined;
              } catch (replacementError) {
                setupError = replacementError;
              }
            }
            result.timings = mergePhaseTimings(result.timings, recoveryTimings);
            writeResultFile(resultDir, result);
          }
        }

        results.push(result);
        console.log(
          `runParallel: worker #${lane.index} ${result.status} ${testName} in ${formatDurationMs(result.durationMs)}`
        );
        writeAggregateReport({
          reportPath,
          runId,
          results: [...results].sort((a, b) => tests.indexOf(a.name) - tests.indexOf(b.name)),
          durationMs: Math.round(performance.now() - started),
          lanes,
          startedAt,
          tests,
        });
      }
    } finally {
      if (driver) await driver.deleteSession().catch(() => {});
    }
  }

  const reuseDriver = process.env.PARALLEL_REUSE_DRIVER !== '0' && lanes.length === 1;
  if (pending.length) {
    if (reuseDriver) {
      await persistentWorker(lanes[0]);
    } else {
      await Promise.all(lanes.map(lane => worker(lane)));
    }
  }

  for (const testName of exclusiveTests) {
    const lane = lanes[0];
    console.log(`runParallel: starting exclusive account-settings test ${testName}`);
    const result = await runOneTest({
      testName,
      lane,
      runId,
      resultDir,
      logDir,
      logicalCategory: logicalCategories[testName] || '',
    });
    results.push(result);
    writeAggregateReport({
      reportPath,
      runId,
      results: [...results].sort((a, b) => tests.indexOf(a.name) - tests.indexOf(b.name)),
      durationMs: Math.round(performance.now() - started),
      lanes,
      startedAt,
      tests,
    });
  }

  const durationMs = Math.round(performance.now() - started);
  const orderedResults = [...results].sort((a, b) => tests.indexOf(a.name) - tests.indexOf(b.name));
  writeAggregateReport({ reportPath, runId, results: orderedResults, durationMs, lanes, startedAt, tests });

  console.log(`runParallel: finished in ${formatDurationMs(durationMs)}`);
  console.log(`runParallel: report ${reportPath}`);

  if (orderedResults.some(result => result.status !== 'PASS')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  const instrumentedIndex = process.argv.indexOf('--run-one-instrumented');
  const command = instrumentedIndex >= 0
    ? runInstrumentedChild(process.argv[instrumentedIndex + 1])
    : run();
  command.catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
