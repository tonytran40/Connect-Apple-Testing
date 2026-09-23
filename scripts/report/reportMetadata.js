const path = require("path");
const {
  buildEvidenceDecision,
  buildEnvironmentSummary,
  countsForSummary,
  formatDurationMs,
  laneForResult,
  resultDurationMs,
  statusForSummary,
} = require("./reportAnalysis");
const { writeGeneratedFile } = require("./reportFiles");
const { reportFreshnessMs } = require("./reportModel");
function writeReportMeta({ outDir, runId, summary, reportType }) {
  const counts = countsForSummary(summary);
  const results = summary.results || [];
  const environment = buildEnvironmentSummary(summary, results);
  const evidence = buildEvidenceDecision(summary, {
    freshnessMs: reportFreshnessMs(),
    environment,
  });
  const meta = {
    runId,
    reportType,
    source: summary.source,
    status: statusForSummary(summary),
    evidenceDecision: evidence.decision,
    startedAt: summary.startedAt || '',
    updatedAt: summary.updatedAt || '',
    durationMs:
      Number(summary.durationMs || 0) ||
      results.reduce((sum, result) => sum + resultDurationMs(result), 0),
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    blocked: counts.blocked,
    inconclusive: counts.inconclusive,
    total: counts.total,
    app: {
      bundleId: environment.bundleId,
      version: environment.appVersion,
      build: environment.appBuild,
      branch: environment.appBranch,
      commit: environment.appCommit,
    },
    automation: {
      branch: environment.automationBranch,
      commit: environment.automationCommit,
      node: environment.node,
    },
    environment,
    coverage: evidence.coverage,
    freshness: evidence.freshness,
    timings: summary.timings || {},
    cleanup: summary.cleanup || null,
    results: results.map(result => ({
      name: result.name,
      status: result.status || 'UNKNOWN',
      duration: result.duration || formatDurationMs(resultDurationMs(result)),
      durationMs: resultDurationMs(result),
      laneRunId: laneForResult(result, runId),
      logicalCategory: result.logicalCategory || '',
      deviceName: result.deviceName || '',
      appiumPort: result.appiumPort || '',
      startedAt: result.startedAt || '',
      finishedAt: result.finishedAt || '',
      timings: result.timings || {},
    })),
  };
  const file = path.join(outDir, '_report-meta.json');
  writeGeneratedFile(file, `${JSON.stringify(meta, null, 2)}\n`);
  return file;
}

module.exports = { writeReportMeta };
