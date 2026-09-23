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
    failureList,
    laneOptions,
    laneHealth,
    slowCallouts,
    comparisonList,
    categoryBars,
    environmentRows,
    evidenceTone,
    coveragePanel,
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
      <div>
        <h1>Test Run Report</h1>
        <p>Scribe-style browser report generated from Appium screenshots and runner results.</p>
        <div class="hero-meta">
          <span>Run: ${escapeHtml(runId)}</span>
          ${environment.appBranch ? `<span>App branch: ${escapeHtml(environment.appBranch)}</span>` : '<span>App branch: not reported</span>'}
          ${environment.appCommit ? `<span>App commit: ${escapeHtml(environment.appCommit)}</span>` : '<span>App commit: not reported</span>'}
          ${environment.appBuild ? `<span>App build: ${escapeHtml(environment.appBuild)}</span>` : '<span>App build: not reported</span>'}
          ${environment.serverEnvironment ? `<span>Environment: ${escapeHtml(environment.serverEnvironment)}</span>` : ''}
          <span>Source: ${escapeHtml(summary.source)}</span>
          <span>Started: ${escapeHtml(started || summary.startedAt || '')}</span>
          <span>Updated: ${escapeHtml(updated || summary.updatedAt || '')}</span>
          ${reportAge ? `<span class="${staleReport ? 'stale-report' : ''}">Report age: ${escapeHtml(reportAge)}</span>` : ''}
        </div>
      </div>
      ${reportSwitcher}
    </div>
  </header>

  <main>
    <section class="panel evidence-decision" aria-label="Release evidence decision">
      <div class="decision-badge ${escapeHtml(evidenceTone)}">${escapeHtml(evidence.decision.replace('_', ' '))}</div>
      <div class="decision-copy">
        <h2>Release evidence</h2>
        <p>${escapeHtml(evidence.reasons.join(' · '))}</p>
        <div class="decision-facts">
          <span>${escapeHtml(evidence.freshness.fresh ? 'Fresh' : 'Stale or undated')}</span>
          <span>${escapeHtml(evidence.coverage.available ? `${evidence.coverage.requiredCompleted}/${evidence.coverage.requiredTotal} eligible required completed` : 'Coverage not reported')}</span>
          <span>${escapeHtml(status)} test result</span>
        </div>
      </div>
    </section>

    <section class="stats" aria-label="Run summary">
      <div class="stat"><span>Passed</span><strong>${escapeHtml(passed)}</strong></div>
      <div class="stat"><span>Failed</span><strong>${escapeHtml(failed)}</strong></div>
      <div class="stat"><span>Skipped</span><strong>${escapeHtml(skipped)}</strong></div>
      <div class="stat"><span>Blocked</span><strong>${escapeHtml(blocked)}</strong></div>
      <div class="stat"><span>Inconclusive</span><strong>${escapeHtml(inconclusive)}</strong></div>
      <div class="stat"><span>Total</span><strong>${escapeHtml(total)}</strong></div>
    </section>

    <section class="sticky-summary" aria-label="Sticky run summary">
      <strong>${escapeHtml(status)}</strong>
      <span>${escapeHtml(formatDurationMs(wallClockDurationMs))} elapsed</span>
      ${laneStats.length > 1 ? `<span>${escapeHtml(formatDurationMs(aggregateTestDurationMs))} aggregate test time</span>` : ''}
      <button type="button" data-copy-link="">Copy report link</button>
    </section>

    ${failureList}

    ${coveragePanel}

    ${phaseTimingCards ? `<section class="panel phase-panel"><div class="panel-heading"><h2>Phase timing</h2><p>Aggregate workload time</p></div><dl class="meta-grid compact">${phaseTimingCards}</dl></section>` : ''}
    ${cleanupPanel}

    <section class="toolbar" aria-label="Report filters">
      <input id="search" type="search" placeholder="Search tests">
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="PASS">Pass</option>
        <option value="FAIL">Fail</option>
        <option value="SKIPPED">Skipped</option>
        <option value="BLOCKED">Blocked</option>
        <option value="INCONCLUSIVE">Inconclusive</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
      <select id="laneFilter">
        <option value="">All lanes</option>
        ${laneOptions}
      </select>
      <label class="check-filter"><input id="failedOnly" type="checkbox"> Failed only</label>
      <label class="check-filter"><input id="slowOnly" type="checkbox"> Slow only</label>
      <label class="check-filter"><input id="screenshotsOnly" type="checkbox"> Has screenshots</label>
    </section>

    <section class="test-grid" aria-label="Tests">
      ${testCards}
    </section>

    <section class="overview-grid">
      <div class="panel lane-health">
        <div class="panel-heading">
          <h2>Lane Health</h2>
          <p>${escapeHtml(laneStats.length)} simulator lane${laneStats.length === 1 ? '' : 's'}</p>
        </div>
        <div class="lane-grid">${laneHealth}</div>
      </div>
      <div class="panel slow-panel">
        <div class="panel-heading">
          <h2>Slow Tests</h2>
          <p>Average: ${escapeHtml(formatDurationMs(averageDurationMs))}</p>
        </div>
        <div class="slow-list">${slowCallouts}</div>
      </div>
    </section>

    <details class="report-insights panel">
      <summary>Run context and analysis</summary>
      <div class="insight-grid">
        <div class="comparison-panel">
          <div class="panel-heading">
            <h2>Run Comparison</h2>
            <p>${escapeHtml(runComparison.hasPrevious ? `Compared with ${runComparison.previousLabel}` : 'Needs another archived run')}</p>
          </div>
          ${comparisonList}
        </div>
        <div class="category-panel">
          <div class="panel-heading">
            <h2>Failure Categories</h2>
            <p>${escapeHtml(failures.length)} failed test${failures.length === 1 ? '' : 's'}</p>
          </div>
          <div class="category-list">${categoryBars}</div>
        </div>
        <div class="environment-panel">
          <div class="panel-heading">
            <h2>Environment</h2>
            <p>Run context</p>
          </div>
          <dl class="meta-grid compact">${environmentRows || '<div><dt>Environment</dt><dd>No extra details found</dd></div>'}</dl>
        </div>
      </div>
    </details>

  </main>

  <script>\n${REPORT_OVERVIEW_CLIENT_SCRIPT}\n  </script>
</body>
</html>
`;

  writeGeneratedFile(file, html);
  return file;
}

module.exports = { writeHtmlReport };
