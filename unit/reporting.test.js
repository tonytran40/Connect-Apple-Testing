const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { formatDurationMs } = require('../utils/reportWriter');
const { hasFreshCombinedSummary, validateRunId } = require('../scripts/runSplit3AndPublishReport');
const {
  failureCategory,
  rerunCommandForResult,
  uniqueReportRuns,
} = require('../scripts/report/reportAnalysis');

test('formatDurationMs formats short and minute-scale durations', () => {
  assert.equal(formatDurationMs(900), '1s');
  assert.equal(formatDurationMs(65000), '1m 5s');
});

test('publisher only accepts a summary written by the current run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-report-test-'));
  const runRoot = path.join(root, 'reports', 'runs', 'sample');
  fs.mkdirSync(runRoot, { recursive: true });
  const summary = path.join(runRoot, 'summary.json');
  fs.writeFileSync(summary, '{}');

  const startedAt = Date.now();
  const old = new Date(startedAt - 10000);
  fs.utimesSync(summary, old, old);
  assert.equal(hasFreshCombinedSummary(startedAt, root, 'sample'), false);

  fs.writeFileSync(summary, '{"status":"PASS"}');
  assert.equal(hasFreshCombinedSummary(startedAt, root, 'sample'), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('publisher accepts path-safe run IDs and rejects traversal', () => {
  assert.equal(validateRunId('split3-combined_2026.08'), 'split3-combined_2026.08');
  assert.throws(() => validateRunId('../outside'), /Unsafe report run ID/);
  assert.throws(() => validateRunId('run/child'), /Unsafe report run ID/);
  assert.throws(() => validateRunId(''), /Unsafe report run ID/);
});

test('failure analysis classifies common Appium failures', () => {
  assert.equal(
    failureCategory({ status: 'FAIL', error: 'NoSuchElementError: accessibility selector not displayed' }),
    'Selector'
  );
  assert.equal(
    failureCategory({ status: 'FAIL', error: 'Lost connection. Check your internet connectivity.' }),
    'Network'
  );
  assert.equal(failureCategory({ status: 'FAIL', error: 'Login credentials rejected' }), 'Login');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Photo permission was denied' }), 'Permission');
  assert.equal(failureCategory({ status: 'FAIL', error: 'waitFor timed out' }), 'Timeout');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Application terminated unexpectedly' }), 'App crash');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Expected true but received false' }), 'Assertion');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Unclassified problem' }), 'Unknown');
  assert.equal(failureCategory({ status: 'PASS', error: 'timeout text is irrelevant' }), '');
});

test('rerun command preserves lane targeting', () => {
  const command = rerunCommandForResult({
    name: 'Reactions',
    appiumPort: 4727,
    udid: 'simulator id',
    deviceName: 'iPhone 17',
  });
  assert.equal(
    command,
    "APPIUM_PORT=4727 SIMULATOR_UDID='simulator id' DEVICE_NAME='iPhone 17' node Tests/Reactions.js"
  );
});

test('report history removes exact duplicate run metadata', () => {
  const reports = [
    { runId: 'run', startedAt: '2026-01-01T10:00:00Z', passed: 2, failed: 0, total: 2 },
    { runId: 'run', startedAt: '2026-01-01T10:00:00Z', passed: 2, failed: 0, total: 2 },
    { runId: 'run', startedAt: '2026-01-02T10:00:00Z', passed: 1, failed: 1, total: 2 },
  ];
  assert.deepEqual(
    uniqueReportRuns(reports).map(report => report.startedAt),
    ['2026-01-02T10:00:00Z', '2026-01-01T10:00:00Z']
  );
});
