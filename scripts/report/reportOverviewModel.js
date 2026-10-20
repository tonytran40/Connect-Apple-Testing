const {
  buildEvidenceDecision,
  buildEnvironmentSummary,
  buildLaneStats,
  buildRunComparison,
  failureCategory,
  failureClassification,
  findPreviousComparableReport,
  formatDate,
  laneForResult,
  normalizeStatus,
  resultDurationMs,
  statusForSummary,
} = require('./reportAnalysis');
const {
  buildTestHistory,
  formatReportAge,
  reportFreshnessMs,
} = require('./reportModel');

function buildOverviewModel({ runId, summary, allReports = [] }) {
  const results = summary.results || [];
  const environment = buildEnvironmentSummary(summary, results);
  const evidence = buildEvidenceDecision(summary, {
    freshnessMs: reportFreshnessMs(),
    environment,
  });
  const failures = results.filter(result => normalizeStatus(result.status) === 'FAIL');
  const lanes = [...new Set(results.map(result => laneForResult(result, runId)).filter(Boolean))];
  const aggregateTestDurationMs = results.reduce((sum, result) => sum + resultDurationMs(result), 0);
  const wallClockDurationMs = Number(summary.durationMs || 0) || aggregateTestDurationMs;
  const averageDurationMs = results.length ? aggregateTestDurationMs / results.length : 0;
  const slowThresholdMs = averageDurationMs * 1.25;
  const slowResults = results
    .filter(result => resultDurationMs(result) > slowThresholdMs && resultDurationMs(result) > 0)
    .sort((a, b) => resultDurationMs(b) - resultDurationMs(a));
  const laneStats = buildLaneStats(results, runId);
  const testHistory = buildTestHistory(allReports);
  const previousReport = findPreviousComparableReport(allReports, summary);
  const runComparison = buildRunComparison(results, previousReport);
  const durationDeltaByTest = new Map(
    [...runComparison.slower, ...runComparison.faster].map(item => [item.result.name, item.diffMs])
  );
  const categoryCounts = failures.reduce((countsByCategory, result) => {
    const category = failureCategory(result);
    countsByCategory[category] = (countsByCategory[category] || 0) + 1;
    return countsByCategory;
  }, {});
  const classificationCounts = failures.reduce((counts, result) => {
    const classification = failureClassification(result);
    counts[classification] = (counts[classification] || 0) + 1;
    return counts;
  }, {});

  return {
    results,
    environment,
    evidence,
    failures,
    lanes,
    status: statusForSummary(summary),
    started: formatDate(summary.startedAt),
    updated: formatDate(summary.updatedAt),
    aggregateTestDurationMs,
    wallClockDurationMs,
    averageDurationMs,
    slowResults,
    laneStats,
    testHistory,
    runComparison,
    durationDeltaByTest,
    reportAge: formatReportAge(summary.updatedAt || summary.startedAt),
    staleReport: !evidence.freshness.fresh,
    categoryCounts,
    classificationCounts,
  };
}

module.exports = { buildOverviewModel };
