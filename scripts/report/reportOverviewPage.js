const path = require('path');
const { formatDurationMs } = require('./reportAnalysis');
const { REPORT_OVERVIEW_CLIENT_SCRIPT } = require('./reportOverviewClient');
const { buildOverviewComponents } = require('./reportOverviewComponents');
const { buildOverviewModel } = require('./reportOverviewModel');
const { REPORT_OVERVIEW_STYLES } = require('./reportOverviewStyles');
const { writeGeneratedFile } = require('./reportFiles');
const { escapeHtml } = require('./reportUtils');

function writeHtmlReport({ outDir, runId, summary, testDocs, reportNav = [], allReports = [] }) {
  const file = path.join(outDir, 'index.html');
  const model = buildOverviewModel({ runId, summary, allReports });
  const {
    environment,
    evidence,
    failures,
    status,
    started,
    updated,
    aggregateTestDurationMs,
    wallClockDurationMs,
    averageDurationMs,
    laneStats,
    runComparison,
    reportAge,
    staleReport,
  } = model;
  const {
    passed,
    failed,
    skipped,
    blocked,
    inconclusive,
    total,
    reportSwitcher,
    phaseTimingCards,
    cleanupPanel,
    testCards,
    laneOptions,
    laneHealth,
    slowCallouts,
    comparisonList,
    categoryBars,
    environmentRows,
    evidenceTone,
    coveragePanel,
    cclCoveragePanel,
  } = buildOverviewComponents({ file, outDir, runId, summary, reportNav, model });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(runId)} test report</title>
  <style>\n${REPORT_OVERVIEW_STYLES}\n  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-layout">
      <div class="hero-copy">
        <p class="hero-eyebrow">Connect iOS automation</p>
        <h1>${escapeHtml(runId)}</h1>
        <p>Regression results and release evidence.</p>
        <div class="hero-meta">
          ${environment.appBranch ? `<span>${escapeHtml(environment.appBranch)}</span>` : '<span>Branch not reported</span>'}
          ${environment.appBuild ? `<span>Build ${escapeHtml(environment.appBuild)}</span>` : '<span>Build not reported</span>'}
          ${environment.serverEnvironment ? `<span>Environment: ${escapeHtml(environment.serverEnvironment)}</span>` : ''}
          <span>${escapeHtml(started || summary.startedAt || '')}</span>
          ${reportAge ? `<span class="${staleReport ? 'stale-report' : ''}">${escapeHtml(reportAge)}</span>` : ''}
        </div>
      </div>
      ${reportSwitcher}
    </div>
  </header>

  <main>
    <section class="panel run-summary" aria-label="Run summary">
      <div class="release-summary">
        <div class="decision-badge ${escapeHtml(evidenceTone)}">${escapeHtml(evidence.decision.replace('_', ' '))}</div>
        <div class="decision-copy">
          <span class="section-label">Release evidence</span>
          <h2>${escapeHtml(status === 'PASS' ? 'Run completed successfully' : status === 'FAIL' ? 'Run needs attention' : `Run status: ${status}`)}</h2>
          <p>${escapeHtml(evidence.reasons.join(' · '))}</p>
          <div class="decision-facts">
            <span>${escapeHtml(evidence.freshness.fresh ? 'Fresh' : 'Stale or undated')}</span>
            <span>${escapeHtml(evidence.coverage.available ? `${evidence.coverage.requiredCompleted}/${evidence.coverage.requiredTotal} required completed` : 'Coverage not reported')}</span>
          </div>
        </div>
      </div>
      <dl class="summary-metrics">
        <div><dt>Passed</dt><dd>${escapeHtml(passed)}</dd></div>
        <div class="${failed ? 'metric-alert' : ''}"><dt>Failed</dt><dd>${escapeHtml(failed)}</dd></div>
        <div><dt>Other</dt><dd>${escapeHtml(skipped + blocked + inconclusive)}</dd></div>
        <div><dt>Total</dt><dd>${escapeHtml(total)}</dd></div>
        <div><dt>Elapsed</dt><dd>${escapeHtml(formatDurationMs(wallClockDurationMs))}</dd></div>
      </dl>
      <button class="copy-report" type="button" data-copy-link="">Copy report link</button>
    </section>

    <section class="results-section" aria-labelledby="results-title">
      <div class="results-heading">
        <div><span class="section-label">Results</span><h2 id="results-title">Test results</h2></div>
        <span>${escapeHtml(total)} test${total === 1 ? '' : 's'}</span>
      </div>
      <div class="toolbar" aria-label="Report filters">
        <input id="search" type="search" placeholder="Search tests">
        <select id="statusFilter" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="PASS">Pass</option>
          <option value="FAIL">Fail</option>
          <option value="SKIPPED">Skipped</option>
          <option value="BLOCKED">Blocked</option>
          <option value="INCONCLUSIVE">Inconclusive</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <select id="laneFilter" aria-label="Filter by lane">
          <option value="">All lanes</option>
          ${laneOptions}
        </select>
        <details class="filter-more">
          <summary>More filters</summary>
          <div>
            <label class="check-filter"><input id="failedOnly" type="checkbox"> Failed only</label>
            <label class="check-filter"><input id="slowOnly" type="checkbox"> Slow only</label>
            <label class="check-filter"><input id="screenshotsOnly" type="checkbox"> Has screenshots</label>
          </div>
        </details>
      </div>

      <div class="test-grid" aria-label="Tests">
        ${testCards}
      </div>
    </section>

    <section class="evidence-stack" aria-label="Additional report details">
      ${coveragePanel}
      ${cclCoveragePanel}

      <details class="panel disclosure execution-details">
        <summary class="section-summary">
          <span><strong>Execution details</strong><small>Timing, simulator lanes, and slow tests</small></span>
          <span class="summary-value">${escapeHtml(formatDurationMs(wallClockDurationMs))} elapsed</span>
        </summary>
        <div class="disclosure-body">
          ${phaseTimingCards ? `<section class="phase-panel"><div class="panel-heading"><h3>Phase timing</h3><p>${laneStats.length > 1 ? `${escapeHtml(formatDurationMs(aggregateTestDurationMs))} aggregate` : 'Workload timing'}</p></div><dl class="meta-grid compact">${phaseTimingCards}</dl></section>` : ''}
          ${cleanupPanel}
          <section class="overview-grid">
            <div class="lane-health">
              <div class="panel-heading"><h3>Lane health</h3><p>${escapeHtml(laneStats.length)} lane${laneStats.length === 1 ? '' : 's'}</p></div>
              <div class="lane-grid">${laneHealth}</div>
            </div>
            <div class="slow-panel">
              <div class="panel-heading"><h3>Slow tests</h3><p>Average ${escapeHtml(formatDurationMs(averageDurationMs))}</p></div>
              <div class="slow-list">${slowCallouts}</div>
            </div>
          </section>
        </div>
      </details>

      <details class="report-insights panel disclosure">
      <summary class="section-summary"><span><strong>Run context</strong><small>Comparison, failures, and environment metadata</small></span><span class="summary-value">${escapeHtml(updated || summary.updatedAt || '')}</span></summary>
      <div class="disclosure-body insight-grid">
        <div class="comparison-panel">
          <div class="panel-heading">
            <h3>Run comparison</h3>
            <p>${escapeHtml(runComparison.hasPrevious ? `Compared with ${runComparison.previousLabel}` : 'Needs another archived run')}</p>
          </div>
          ${comparisonList}
        </div>
        <div class="category-panel">
          <div class="panel-heading">
            <h3>Failure categories</h3>
            <p>${escapeHtml(failures.length)} failed test${failures.length === 1 ? '' : 's'}</p>
          </div>
          <div class="category-list">${categoryBars}</div>
        </div>
        <div class="environment-panel">
          <div class="panel-heading">
            <h3>Environment</h3>
            <p>Run context</p>
          </div>
          <dl class="meta-grid compact">${environmentRows || '<div><dt>Environment</dt><dd>No extra details found</dd></div>'}</dl>
        </div>
      </div>
      </details>
    </section>

  </main>

  <script>\n${REPORT_OVERVIEW_CLIENT_SCRIPT}\n  </script>
</body>
</html>
`;

  writeGeneratedFile(file, html);
  return file;
}

module.exports = { writeHtmlReport };
