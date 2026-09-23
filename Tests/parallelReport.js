const path = require('path');
const { buildTimingSummary, formatDurationMs } = require('../utils/reportWriter');
const {
  buildArtifactLinks,
  escapeCell,
  writeReportArtifacts,
} = require('../utils/runnerArtifacts');
const {
  appendPhaseTimingSection,
  formatPercent,
  summarizeResults,
  truncate,
} = require('../utils/runnerReport');
const { coverageFor } = require('./testManifest');

function artifactLinks({ reportPath, runId, result }) {
  const repoRoot = path.resolve(__dirname, '..');
  const resultPath = path.join(repoRoot, 'reports', 'runs', runId, 'results', `${result.name}.json`);
  const screenshotDir = path.join(repoRoot, 'screenshots', runId, result.name);
  return buildArtifactLinks({
    reportPath,
    artifacts: [
      { label: 'log', path: result.logPath, requireExists: false },
      { label: 'json', path: resultPath },
      { label: 'screenshots', path: screenshotDir },
    ],
  });
}

function writeAggregateReport({ reportPath, runId, results, durationMs, lanes, startedAt, tests }) {
  const {
    passed,
    failed,
    skipped,
    blocked,
    inconclusive,
    dryRun,
    total,
    completed,
    executed,
    failures,
    slowest,
  } = summarizeResults(results, { total: (tests || results).length });
  const finishedAt = new Date().toISOString();
  const rerunFailures = failures.length
    ? `PARALLEL_TESTS=${failures.map(result => result.name).join(',')} npm run test:parallel`
    : '';
  const overallStatus = failed || blocked || inconclusive || skipped
    ? `**Status: NEEDS ATTENTION** (${failed} failed, ${blocked} blocked, ${inconclusive} inconclusive, ${skipped} skipped)`
    : dryRun === total
      ? '**Status: DRY RUN**'
      : completed < total
        ? `**Status: RUNNING** (${completed}/${total} finished)`
        : '**Status: PASS**';
  const resultSummary = dryRun === total
    ? `- Result: dry run only (${total} tests selected)`
    : `- Result: ${passed}/${executed.length} executed passed (${formatPercent(passed, executed.length)})`;
  const timings = buildTimingSummary({ lanes, results });
  const evidenceStatus = failed
    ? 'FAIL'
    : blocked || inconclusive || skipped
      ? 'INCOMPLETE'
      : dryRun === total
        ? 'DRY_RUN'
        : completed < total
          ? 'RUNNING'
          : 'PASS';

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
    `- Skipped: ${skipped}; blocked: ${blocked}; inconclusive: ${inconclusive}`,
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

  appendPhaseTimingSection(lines, timings);
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

  writeReportArtifacts({
    reportPath,
    lines,
    summary: {
      runId,
      status: evidenceStatus,
      startedAt,
      updatedAt: finishedAt,
      durationMs,
      counts: {
        total,
        completed,
        passed,
        failed,
        skipped,
        blocked,
        inconclusive,
        dryRun,
      },
      tests: tests || results.map(result => result.name),
      coverage: coverageFor(tests || results.map(result => result.name)),
      lanes,
      results,
      timings,
    },
  });
}

module.exports = { artifactLinks, writeAggregateReport };
