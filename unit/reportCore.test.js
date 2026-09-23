const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { formatDurationMs } = require('../utils/reportWriter');
const { failedStepIndex } = require('../scripts/report/reportAssets');
const { generateReportAt } = require('../scripts/report/reportGenerator');
const {
  buildTestHistory,
  durationFromText,
  flakeSummary,
  formatReportAge,
  isFlakyHistory,
  loadRunSummary,
  phaseTimingEntries,
  reportFreshnessMs,
  withPreviewFailures,
} = require('../scripts/report/reportModel');
const reportEntryPoint = require('../scripts/generateScribeDocs');

function freshSummary(overrides = {}) {
  return {
    startedAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:05:00.000Z',
    results: [{ name: 'LocalTest', status: 'PASS' }],
    coverage: [{
      name: 'LocalTest',
      feature: 'Local feature',
      classification: 'required',
      environments: ['ANY'],
      scheduled: true,
    }],
    ...overrides,
  };
}

test('formatDurationMs formats short and minute-scale durations', () => {
  assert.equal(formatDurationMs(900), '1s');
  assert.equal(formatDurationMs(65000), '1m 5s');
});

test('report entry point preserves the public summary loader contract', () => {
  assert.equal(reportEntryPoint.loadRunSummary, loadRunSummary);
  assert.equal(typeof reportEntryPoint.generate, 'function');
});

test('report model normalizes timing rows and duration text', () => {
  assert.equal(durationFromText('2m 7s'), 127000);
  assert.equal(durationFromText('9s'), 9000);
  assert.equal(durationFromText('unknown'), 0);
  assert.deepEqual(
    phaseTimingEntries({ testBodyMs: 1500, roomCreationMs: 0 })
      .filter(phase => phase.durationMs > 0)
      .map(phase => [phase.key, phase.label, phase.durationMs]),
    [['testBodyMs', 'Test body', 1500]]
  );
});

test('report model builds deduplicated history and stable recency signals', () => {
  const reports = [
    { runId: 'sample', reportType: 'latest', startedAt: '2026-09-22T12:00:00.000Z', results: [{ name: 'Alpha', status: 'FAIL', durationMs: 2000 }] },
    { runId: 'sample', reportType: 'archive', startedAt: '2026-09-22T12:00:00.000Z', results: [{ name: 'Alpha', status: 'FAIL', durationMs: 2000 }] },
    { runId: 'older', reportType: 'archive', startedAt: '2026-09-21T12:00:00.000Z', results: [{ name: 'Alpha', status: 'PASS', duration: '1s', durationMs: 1000 }] },
  ];
  const history = buildTestHistory(reports).get('Alpha');
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(entry => entry.status), ['FAIL', 'PASS']);
  assert.equal(history[0].duration, '2s');
  assert.equal(flakeSummary(history), '1/2 failed in last 2 runs');
  assert.equal(isFlakyHistory(history), true);
  assert.equal(formatReportAge('2026-09-23T11:00:00.000Z', Date.parse('2026-09-23T12:00:00.000Z')), '1h ago');
  assert.equal(reportFreshnessMs('1.5'), 90 * 60 * 1000);
  assert.equal(reportFreshnessMs('invalid'), undefined);
});

test('preview failures clone the summary and update result counts', () => {
  const summary = {
    status: 'PASS',
    counts: { total: 2, passed: 2, failed: 0 },
    results: [{ name: 'Alpha', status: 'PASS' }, { name: 'Beta', status: 'PASS' }],
  };
  const preview = withPreviewFailures(summary, 'Alpha');
  assert.equal(summary.results[0].status, 'PASS');
  assert.equal(preview.status, 'FAIL');
  assert.deepEqual(preview.counts, { total: 2, passed: 1, failed: 1 });
});

test('failed screenshot selection prefers ERROR and otherwise uses the final step', () => {
  assert.equal(failedStepIndex(['/tmp/01-start.png', '/tmp/ERROR.png'], { status: 'FAIL' }), 1);
  assert.equal(failedStepIndex(['/tmp/01-start.png', '/tmp/02-end.png'], { status: 'FAIL' }), 1);
  assert.equal(failedStepIndex(['/tmp/ERROR.png'], { status: 'PASS' }), -1);
});

test('report generator writes the expected latest report contract', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-report-generator-'));
  const summary = freshSummary({
    source: 'summary.json',
    durationMs: 5000,
    counts: { total: 1, passed: 1, failed: 0 },
    results: [{ name: 'LocalTest', status: 'PASS', duration: '5s', durationMs: 5000 }],
  });
  const report = generateReportAt({ outputRoot, outputRunId: 'sample', sourceRunId: 'sample', summary, reportType: 'latest' });
  assert.equal(fs.existsSync(report.indexPath), true);
  assert.equal(fs.existsSync(report.htmlPath), true);
  assert.equal(fs.existsSync(report.metaPath), true);
  assert.equal(fs.existsSync(path.join(report.outDir, 'LocalTest.md')), true);
  assert.match(fs.readFileSync(report.htmlPath, 'utf8'), /LocalTest/);
  assert.equal(JSON.parse(fs.readFileSync(report.metaPath, 'utf8')).runId, 'sample');
  fs.rmSync(outputRoot, { recursive: true, force: true });
});
