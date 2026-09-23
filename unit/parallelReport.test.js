const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { writeAggregateReport } = require('../Tests/parallelReport');

test('parallel report writer preserves Markdown and JSON aggregate artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-parallel-report-'));
  const reportPath = path.join(root, 'summary.md');
  writeAggregateReport({
    reportPath,
    runId: 'sample',
    results: [{ name: 'Reactions', status: 'DRY_RUN', durationMs: 0 }],
    durationMs: 0,
    lanes: [{ index: 0, deviceName: 'iPhone', udid: 'SIM', appiumPort: 4723, wdaLocalPort: 8100, derivedDataPath: '/tmp/wda' }],
    startedAt: '2026-09-23T12:00:00.000Z',
    tests: ['Reactions'],
  });
  assert.match(fs.readFileSync(reportPath, 'utf8'), /Parallel iOS Automation Report/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'summary.json'), 'utf8')).runId, 'sample');
  fs.rmSync(root, { recursive: true, force: true });
});
