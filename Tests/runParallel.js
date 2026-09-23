require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const {
  formatDurationMs,
  mergePhaseTimings,
  normalizePhaseTimings,
} = require('../utils/reportWriter');
const {
  ensureDir,
  readJsonIfExists,
  writeJsonFile,
} = require('../utils/runnerArtifacts');
const {
  addPhaseTiming,
  measurePhase,
  resolveTestStatus,
  sleep,
  spawnNodeChild,
  waitForChild,
} = require('../utils/runnerLifecycle');
const { readScreenshotMetrics, resetScreenshotMetrics } = require('../utils/screenshots');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { ensureRoomsSectionReady } = require('../utils/testSession');
const { resolveLaneUdids } = require('../utils/simulatorConfig');
const {
  logicalCategoriesFromEnv,
  makeLanes,
  makeRunId,
  resolveTests: resolveConfiguredTests,
} = require('../utils/parallelConfig');
const { classifySessionHealth, probeReusableSession } = require('../utils/parallelSession');
const { writeAggregateReport } = require('./parallelReport');
const { manifestEntry, testsFor } = require('./testManifest');

const MAIN_SUITE_TESTS = testsFor('parallel').map(test => test.name);
const STANDALONE_TESTS = testsFor('parallelAll').map(test => test.name);
const ACCOUNT_SETTINGS_TESTS = new Set(
  testsFor('parallel').filter(test => test.exclusive).map(test => test.name)
);
function resolveTests() {
  return resolveConfiguredTests({
    mainSuiteTests: MAIN_SUITE_TESTS,
    standaloneTests: STANDALONE_TESTS,
  });
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

    const child = spawnNodeChild(__filename, ['--run-one-instrumented', testName], {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    waitForChild(child).then(({ code }) => {
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
    }).catch(error => {
      logStream.end();
      const durationMs = Math.round(performance.now() - started);
      resolve({
        name: testName,
        status: 'FAIL',
        durationMs,
        duration: formatDurationMs(durationMs),
        workerIndex: lane.index,
        logicalCategory,
        startedAt,
        finishedAt: new Date().toISOString(),
        logPath,
        timings: normalizePhaseTimings(),
        error: `Could not start test process: ${error.message}`,
      });
    });
  });
}

function testModule(testName) {
  if (!manifestEntry(testName)) {
    throw new Error(`Test "${testName}" is not classified in Tests/testManifest.js`);
  }
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
  writeJsonFile(path.join(resultDir, `${result.name}.json`), result);
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
  let ownedResult;

  resetScreenshotMetrics(testName, { resultDir });
  try {
    driver = await measurePhase(timings, 'sessionCreationMs', () => createDriver());
    if (!skipLoginCheck) {
      await measurePhase(timings, 'loginReadinessMs', () => ensureLoggedIn(driver));
    }
    await measurePhase(timings, 'loginReadinessMs', () => ensureRoomsSectionReady(driver));

    const bodyStarted = performance.now();
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
  const status = resolveTestStatus(error, ownedResult);
  const result = {
    name: testName,
    status,
    durationMs,
    duration: formatDurationMs(durationMs),
    logicalCategory,
    startedAt,
    finishedAt: new Date().toISOString(),
    timings: mergePhaseTimings(timings, { screenshotCaptureMs: screenshot.captureMs }),
    screenshotMetrics: screenshot,
    ...(ownedResult?.notes ? { notes: ownedResult.notes } : {}),
    ...(error ? { error: error?.message || String(error) } : {}),
  };
  writeResultFile(resultDir, result);
  if (error && status === 'FAIL') throw error;
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
  const status = resolveTestStatus(error, ownedResult);
  const result = {
    name: testName,
    status,
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
    ...(ownedResult?.notes ? { notes: ownedResult.notes } : {}),
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
            const health = await measurePhase(recoveryTimings, 'recoveryMs', () =>
              probeReusableSession(driver)
            );

            if (health.healthy) {
              console.log(
                `runParallel: worker #${lane.index} session healthy after ${testName} failure; ` +
                  'skipping recovery'
              );
            } else {
              console.warn(
                `runParallel: worker #${lane.index} session unhealthy after ${testName} failure: ` +
                  health.reason
              );
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

module.exports = { classifySessionHealth, probeReusableSession, run };
