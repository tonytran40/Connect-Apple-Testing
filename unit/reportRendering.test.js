const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const reportRendering = require('../scripts/report/reportRendering');
const { writeArchivePages } = require('../scripts/report/reportArchivePage');
const { writeReportMeta } = require('../scripts/report/reportMetadata');
const { REPORT_OVERVIEW_CLIENT_SCRIPT } = require('../scripts/report/reportOverviewClient');
const { buildOverviewModel } = require('../scripts/report/reportOverviewModel');
const { writeHtmlReport } = require('../scripts/report/reportOverviewPage');
const { REPORT_OVERVIEW_STYLES } = require('../scripts/report/reportOverviewStyles');
const { writeTestHtmlPages } = require('../scripts/report/reportTestPage');

test('report rendering facade preserves its public API', () => {
  assert.deepEqual(Object.keys(reportRendering).sort(), [
    'writeArchivePages',
    'writeHtmlReport',
    'writeReportMeta',
    'writeTestHtmlPages',
  ]);
  assert.equal(reportRendering.writeArchivePages, writeArchivePages);
  assert.equal(reportRendering.writeHtmlReport, writeHtmlReport);
  assert.equal(reportRendering.writeReportMeta, writeReportMeta);
  assert.equal(reportRendering.writeTestHtmlPages, writeTestHtmlPages);
});

test('overview model prepares duration, lane, and failure data without rendering', () => {
  const summary = {
    status: 'FAIL',
    startedAt: '2026-09-23T12:00:00.000Z',
    updatedAt: '2026-09-23T12:01:00.000Z',
    durationMs: 900,
    results: [
      { name: 'Fast A', status: 'PASS', durationMs: 100, laneRunId: 'lane-a' },
      { name: 'Fast B', status: 'PASS', durationMs: 100, laneRunId: 'lane-a' },
      { name: 'Slow failure', status: 'FAIL', durationMs: 500, laneRunId: 'lane-b', error: 'timed out' },
    ],
  };

  const model = buildOverviewModel({ runId: 'combined', summary });

  assert.equal(model.aggregateTestDurationMs, 700);
  assert.equal(model.wallClockDurationMs, 900);
  assert.deepEqual(model.lanes, ['lane-a', 'lane-b']);
  assert.deepEqual(model.slowResults.map(result => result.name), ['Slow failure']);
  assert.equal(model.failures.length, 1);
  assert.equal(model.categoryCounts.Timeout, 1);
});

test('overview page keeps extracted styles and client behavior inline', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-rendering-'));
  try {
    const file = writeHtmlReport({
      outDir,
      runId: 'render-contract',
      summary: {
        source: 'unit test',
        status: 'PASS',
        startedAt: '2026-09-23T12:00:00.000Z',
        updatedAt: '2026-09-23T12:01:00.000Z',
        results: [],
      },
      testDocs: [],
    });
    const html = fs.readFileSync(file, 'utf8');

    assert.ok(html.includes(`<style>\n${REPORT_OVERVIEW_STYLES}\n  </style>`));
    assert.ok(html.includes(`<script>\n${REPORT_OVERVIEW_CLIENT_SCRIPT}\n  </script>`));
    assert.equal(fs.existsSync(path.join(outDir, 'reportOverviewStyles.css')), false);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
