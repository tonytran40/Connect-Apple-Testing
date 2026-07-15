require('dotenv').config();

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
const { formatDurationMs } = require('../utils/reportWriter');

const MAIN_TESTS = 'CreateRoom,PinnedMessageEditFlow,markdowns,ConversationList,newMessage';
const STANDALONE_TESTS = 'attachments,editRoom,membersRoom,favoriteRoom,markAsRead,removeRoom,notifications';

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
      WDA_LOCAL_PORT: wdaPort,
      WDA_DERIVED_DATA_PATH: derivedDataPath,
    },
    appiumPort,
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
      deviceName: lane.deviceName,
      udid: lane.udid,
      appiumPort: lane.appiumPort,
      wdaPort: lane.wdaPort,
      summaryPath,
      logPath: path.join(logDir, `${testName}.log`),
      resultPath,
      screenshotDir: path.join(repoRoot, 'screenshots', lane.runId, testName),
    };
  });
}

function writeCombinedReport({ reportPath, runId, lanes, laneCodes, durationMs, startedAt }) {
  const results = lanes.flatMap((lane, index) => loadLaneResults(lane, laneCodes[index]));
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
  const status = failed || unknown
    ? `**Status: FAIL** (${failed} failing, ${unknown} unknown)`
    : dryRun === total
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

  lines.push(
    '',
    '## Full Results',
    '',
    '| Test | Lane | Status | Duration | Device | Appium Port | Artifacts |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  );
  results.forEach(result => {
    lines.push(
      `| ${escapeCell(result.name)} | ${escapeCell(result.laneLabel)} | ${escapeCell(result.status)} | ${escapeCell(result.duration)} | ${escapeCell(result.deviceName)} | ${escapeCell(result.appiumPort)} | ${artifactLinks({ reportPath, result })} |`
    );
  });

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
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

    child.on('close', code => {
      console.log(`[${lane.label}] finished with exit code ${code}`);
      resolve(code || 0);
    });
  });
}

async function run() {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const combinedRunId = envValue('SPLIT_COMBINED_RUN_ID', 'split-combined');
  const combinedRoot = ensureDir(path.resolve(__dirname, '..', 'reports', 'runs', combinedRunId));
  const combinedReportPath = path.join(combinedRoot, 'summary.md');
  const lanes = [
    makeLane({
      label: 'main-suite',
      runId: envValue('SPLIT_MAIN_RUN_ID', 'main-suite'),
      tests: envValue('SPLIT_MAIN_TESTS', MAIN_TESTS),
      deviceName: envValue('SPLIT_MAIN_DEVICE_NAME', 'iPhone 17 Pro'),
      udid: envValue('SPLIT_MAIN_UDID', 'A848480F-1933-47A5-B063-DB070BB3AC66'),
      appiumPort: envValue('SPLIT_MAIN_APPIUM_PORT', '4723'),
      wdaPort: envValue('SPLIT_MAIN_WDA_PORT', '8100'),
      derivedDataPath: envValue('SPLIT_MAIN_WDA_DERIVED_DATA_PATH', '/tmp/wda-main'),
    }),
    makeLane({
      label: 'standalones',
      runId: envValue('SPLIT_STANDALONE_RUN_ID', 'standalones'),
      tests: envValue('SPLIT_STANDALONE_TESTS', STANDALONE_TESTS),
      deviceName: envValue('SPLIT_STANDALONE_DEVICE_NAME', 'iPhone 17 Pro Max'),
      udid: envValue('SPLIT_STANDALONE_UDID', 'B5A3CFF9-F618-411B-91FC-92C8FDD0D069'),
      appiumPort: envValue('SPLIT_STANDALONE_APPIUM_PORT', '4725'),
      wdaPort: envValue('SPLIT_STANDALONE_WDA_PORT', '8200'),
      derivedDataPath: envValue('SPLIT_STANDALONE_WDA_DERIVED_DATA_PATH', '/tmp/wda-standalones'),
    }),
  ];

  const shouldCheckAppium = process.env.PARALLEL_DRY_RUN !== '1' && process.env.SPLIT_SKIP_APPIUM_CHECK !== '1';
  if (shouldCheckAppium) {
    for (const lane of lanes) {
      if (!(await appiumStatus(lane.appiumPort))) {
        throw new Error(`Appium is not responding on port ${lane.appiumPort}. Start it before running this script.`);
      }
    }
  }

  const codes = await Promise.all(lanes.map(runLane));
  const combined = writeCombinedReport({
    reportPath: combinedReportPath,
    runId: combinedRunId,
    lanes,
    laneCodes: codes,
    durationMs: Math.round(performance.now() - started),
    startedAt,
  });
  const combinedStatus = combined.dryRun === combined.total
    ? `dry run (${combined.total} selected)`
    : `${combined.passed}/${combined.total - combined.dryRun} executed passed`;
  console.log(`[split] combined report ${combinedReportPath} (${combinedStatus})`);

  if (codes.some(code => code !== 0)) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

module.exports = { run };
