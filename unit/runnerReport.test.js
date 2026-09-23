const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendPhaseTimingSection,
  formatPercent,
  summarizeResults,
  truncate,
} = require('../utils/runnerReport');

test('summarizeResults provides stable counts, failures, execution, and slowest tests', () => {
  const results = [
    { name: 'pass', status: 'PASS', durationMs: 20 },
    { name: 'fail', status: 'FAIL', durationMs: 40 },
    { name: 'blocked', status: 'BLOCKED', durationMs: 30 },
    { name: 'dry', status: 'DRY_RUN', durationMs: 100 },
  ];
  const summary = summarizeResults(results, { total: 6, slowestLimit: 2 });

  assert.equal(summary.total, 6);
  assert.equal(summary.completed, 4);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.dryRun, 1);
  assert.deepEqual(summary.executed.map(result => result.name), ['pass', 'fail', 'blocked']);
  assert.deepEqual(summary.failures.map(result => result.name), ['fail', 'blocked']);
  assert.deepEqual(summary.slowest.map(result => result.name), ['fail', 'blocked']);
});

test('summarizeResults supports split-runner failure and dry-run policies', () => {
  const results = [
    { name: 'unknown', status: 'UNKNOWN', durationMs: 10 },
    { name: 'dry', status: 'DRY_RUN', durationMs: 50 },
  ];
  const summary = summarizeResults(results, {
    failureStatuses: ['FAIL', 'UNKNOWN', 'BLOCKED', 'INCONCLUSIVE'],
    slowestExcludedStatuses: [],
  });

  assert.deepEqual(summary.failures.map(result => result.name), ['unknown']);
  assert.deepEqual(summary.slowest.map(result => result.name), ['dry', 'unknown']);
});

test('shared report formatting preserves percentage, truncation, and phase table output', () => {
  assert.equal(formatPercent(2, 3), '67%');
  assert.equal(formatPercent(0, 0), '0%');
  assert.equal(truncate(' one\n two ', 20), 'one two');
  assert.equal(truncate('abcdefgh', 5), 'abcd…');

  const lines = [];
  appendPhaseTimingSection(lines, { phases: { sessionCreationMs: 1000 } });
  assert.deepEqual(lines.slice(0, 4), [
    '## Phase Timings',
    '',
    '| Phase | Aggregate Duration |',
    '| --- | --- |',
  ]);
  assert.equal(lines[4], '| Session creation | 1s |');
});
