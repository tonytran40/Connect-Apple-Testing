const { formatDurationMs } = require('./reportWriter');
const { phaseTimingRows } = require('./runnerArtifacts');

const COUNTED_STATUSES = {
  PASS: 'passed',
  FAIL: 'failed',
  UNKNOWN: 'unknown',
  SKIPPED: 'skipped',
  BLOCKED: 'blocked',
  INCONCLUSIVE: 'inconclusive',
  DRY_RUN: 'dryRun',
};

function summarizeResults(
  results,
  {
    total = results.length,
    failureStatuses = ['FAIL', 'BLOCKED', 'INCONCLUSIVE'],
    slowestLimit = 5,
    slowestExcludedStatuses = ['DRY_RUN'],
  } = {}
) {
  const counts = Object.fromEntries(
    Object.entries(COUNTED_STATUSES).map(([status, key]) => [
      key,
      results.filter(result => result.status === status).length,
    ])
  );
  const excluded = new Set(slowestExcludedStatuses);
  const failures = results.filter(result => failureStatuses.includes(result.status));
  const slowest = [...results]
    .filter(result => !excluded.has(result.status) && Number.isFinite(result.durationMs))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, slowestLimit);

  return {
    ...counts,
    total,
    completed: results.length,
    executed: results.filter(result => result.status !== 'DRY_RUN'),
    failures,
    slowest,
  };
}

function appendPhaseTimingSection(lines, timings) {
  lines.push('## Phase Timings', '', '| Phase | Aggregate Duration |', '| --- | --- |');
  for (const phase of phaseTimingRows(timings)) {
    lines.push(`| ${phase.label} | ${formatDurationMs(phase.durationMs)} |`);
  }
}

function formatPercent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function truncate(value, max = 180) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

module.exports = {
  appendPhaseTimingSection,
  formatPercent,
  summarizeResults,
  truncate,
};
