const path = require('path');

const {
  failureCategory,
  failureSnippet,
  formatDate,
  formatDurationMs,
  laneForResult,
  normalizeStatus,
  rerunCommandForResult,
  resultDurationMs,
} = require('./reportAnalysis');
const {
  copyScreenshotAsset,
  failedStepIndex,
  listScreenshots,
  testDetailFile,
} = require('./reportAssets');
const { flakeSummary, isFlakyHistory, phaseTimingEntries } = require('./reportModel');
const { reportSwitcherMarkup, statusClass } = require('./reportNavigation');
const { escapeHtml, relativeLink, titleFromFileName } = require('./reportUtils');

function buildOverviewComponents({ file, outDir, runId, summary, reportNav, model }) {
  const {
    results,
    environment,
    evidence,
    failures,
    lanes,
    slowResults,
    laneStats,
    testHistory,
    runComparison,
    durationDeltaByTest,
    categoryCounts,
  } = model;
  const { passed, failed, skipped, blocked, inconclusive, total } = evidence.counts;
  const reportSwitcher = reportSwitcherMarkup(reportNav);
  const phaseTimingCards = summary.timings?.unit
    ? phaseTimingEntries(summary.timings)
        .map(
          phase => `<div><dt>${escapeHtml(phase.label)}</dt><dd>${escapeHtml(formatDurationMs(phase.durationMs))}</dd></div>`
        )
        .join('\n')
    : '';
  const cleanupPanel = summary.cleanup?.enabled
    ? `<section class="panel cleanup-panel ${statusClass(summary.cleanup.status)}">
        <div class="panel-heading"><h2>Post-suite cleanup</h2><p>${escapeHtml(summary.cleanup.strict ? 'Strict' : 'Advisory')}</p></div>
        <p><strong>${escapeHtml(summary.cleanup.status)}</strong> on ${escapeHtml(summary.cleanup.laneLabel || 'configured lane')}${summary.cleanup.error ? `: ${escapeHtml(summary.cleanup.error)}` : ''}</p>
      </section>`
    : '';

  const statusPriority = { FAIL: 0, BLOCKED: 1, INCONCLUSIVE: 2, SKIPPED: 3, UNKNOWN: 4, PASS: 5 };
  const testCards = results
    .slice()
    .sort(
      (a, b) =>
        (statusPriority[normalizeStatus(a.status)] ?? 4) -
          (statusPriority[normalizeStatus(b.status)] ?? 4) || a.name.localeCompare(b.name)
    )
    .map((result, index) => {
      const resultStatus = normalizeStatus(result.status);
      const laneRunId = laneForResult(result, runId);
      const screenshots = listScreenshots(laneRunId, result.name, result);
      const screenshotAssets = screenshots.map(screenshot =>
        copyScreenshotAsset({ outDir, laneRunId, testName: result.name, screenshot })
      );
      const failedIndex = failedStepIndex(screenshotAssets, result);
      const failedAsset = failedIndex >= 0 ? screenshotAssets[failedIndex] : null;
      const beforeFailureAsset = failedIndex > 0 ? screenshotAssets[failedIndex - 1] : null;
      const durationMs = resultDurationMs(result);
      const isSlow = slowResults.includes(result);
      const history = testHistory.get(result.name) || [];
      const flake = flakeSummary(history);
      const isFlaky = isFlakyHistory(history);
      const failure = resultStatus === 'FAIL' ? failureSnippet(result) : '';
      const rerunCommand = rerunCommandForResult(result);
      const timingMarkup = result.timings
        ? `<section class="inline-evidence-section"><h4>Phase timing</h4><dl class="inline-evidence-meta">
            ${phaseTimingEntries(result.timings)
              .map(
                phase => `<div><dt>${escapeHtml(phase.label)}</dt><dd>${escapeHtml(formatDurationMs(phase.durationMs))}</dd></div>`
              )
              .join('\n')}
          </dl></section>`
        : '';
      const historyMarkup = history.length
        ? history
            .slice(0, 6)
            .map(item => {
              const href = item.dir ? relativeLink(file, path.join(item.dir, 'index.html')) : item.href || '#';
              return `<a href="${escapeHtml(href)}"><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span><strong>${escapeHtml(formatDate(item.startedAt) || item.runId || 'Run')}</strong><small>${escapeHtml(item.duration || '')}</small></a>`;
            })
            .join('\n')
        : '<p class="muted">No previous report history for this test yet.</p>';
      const screenshotGrid = screenshotAssets.length
        ? screenshotAssets
            .map((screenshot, screenshotIndex) => {
              const title = titleFromFileName(screenshot);
              const failedHere = screenshotIndex === failedIndex;
              return `<figure class="inline-step${failedHere ? ' failed-step' : ''}">
                <img src="${escapeHtml(relativeLink(file, screenshot))}" alt="${escapeHtml(title)}" loading="lazy">
                <figcaption><strong>${failedHere ? 'Failed here' : `Step ${screenshotIndex + 1}`}</strong><span>${escapeHtml(title)}</span></figcaption>
              </figure>`;
            })
            .join('\n')
        : '<p class="empty-evidence">No screenshots were captured for this test run.</p>';
      const failureFocus = failedAsset
        ? `<section class="inline-evidence-section failure-focus-inline"><h4>Failure focus</h4><div class="failure-compare-inline">
            ${beforeFailureAsset ? `<figure><img src="${escapeHtml(relativeLink(file, beforeFailureAsset))}" alt="Last screenshot before failure" loading="lazy"><figcaption>Before failure</figcaption></figure>` : ''}
            <figure class="failed-step"><img src="${escapeHtml(relativeLink(file, failedAsset))}" alt="Failed step" loading="lazy"><figcaption>Failed step</figcaption></figure>
          </div></section>`
        : '';
      return `
        <details class="test-card ${statusClass(resultStatus)}${isSlow ? ' slow' : ''}" data-test-card data-name="${escapeHtml(result.name.toLowerCase())}" data-status="${escapeHtml(resultStatus)}" data-lane="${escapeHtml(laneRunId)}" data-slow="${isSlow ? '1' : '0'}" data-screenshots="${screenshots.length ? '1' : '0'}" data-flaky="${isFlaky ? '1' : '0'}"${resultStatus === 'FAIL' && index === 0 ? ' open' : ''}>
          <summary class="test-card-summary">
            <span class="status-pill ${statusClass(resultStatus)}">${escapeHtml(resultStatus)}</span>
            <div class="test-card-copy">
              <h3>${escapeHtml(result.name)}</h3>
              <p>${escapeHtml(result.logicalCategory || 'Uncategorized')} · ${escapeHtml(laneRunId)}${result.deviceName ? ` · ${escapeHtml(result.deviceName)}` : ''}</p>
              <div class="card-tags">
                <span>${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'}</span>
                ${isSlow ? '<span>Slow</span>' : ''}
                ${isFlaky ? `<span>Flaky: ${escapeHtml(flake)}</span>` : ''}
              </div>
            </div>
            <div class="test-card-result">
              <span class="duration">${escapeHtml(result.duration || formatDurationMs(durationMs))}</span>
              <span class="open-details" aria-hidden="true">⌄</span>
            </div>
          </summary>
          <div class="test-card-evidence">
            ${failure ? `<p class="evidence-error">${escapeHtml(failure)}</p>` : `<p>${escapeHtml(resultStatus === 'PASS' ? 'Passing evidence is collapsed by default.' : result.error || result.reason || `Result: ${resultStatus}`)}</p>`}
            <code>${escapeHtml(rerunCommand)}</code>
            <details class="full-evidence">
              <summary><span class="show-evidence">Open full evidence</span><span class="hide-evidence">Close full evidence</span><span aria-hidden="true">⌄</span></summary>
              <div class="full-evidence-body">
                <section class="inline-evidence-section"><h4>Test details</h4><dl class="inline-evidence-meta">
                  <div><dt>Status</dt><dd>${escapeHtml(resultStatus)}</dd></div>
                  <div><dt>Lane</dt><dd>${escapeHtml(laneRunId)}</dd></div>
                  <div><dt>Category</dt><dd>${escapeHtml(result.logicalCategory || 'Not reported')}</dd></div>
                  <div><dt>Device</dt><dd>${escapeHtml(result.deviceName || 'Not reported')}</dd></div>
                  <div><dt>Appium port</dt><dd>${escapeHtml(result.appiumPort || 'Not reported')}</dd></div>
                  <div><dt>Finished</dt><dd>${escapeHtml(formatDate(result.finishedAt) || result.finishedAt || 'Not reported')}</dd></div>
                </dl></section>
                ${timingMarkup}
                ${failureFocus}
                <section class="inline-evidence-section"><h4>Recent history</h4><div class="inline-history">${historyMarkup}</div></section>
                <section class="inline-evidence-section"><div class="inline-evidence-heading"><h4>Test steps</h4><span>${screenshotAssets.length} screenshot${screenshotAssets.length === 1 ? '' : 's'}</span></div><div class="inline-steps">${screenshotGrid}</div></section>
              </div>
            </details>
          </div>
        </details>`;
    })
    .join('\n');

  const failureList = failures.length
    ? `
      <section class="panel failures">
        <h2>Failures</h2>
        ${failures
          .map(
            failure => `
              <a href="${escapeHtml(relativeLink(file, testDetailFile(outDir, failure)))}">
                <strong>${escapeHtml(failure.name)}</strong>
                <em>${escapeHtml(failureCategory(failure))}</em>
                <span>${escapeHtml(failureSnippet(failure) || 'Failed without error text')}</span>
              </a>`
          )
          .join('\n')}
      </section>`
    : '';

  const laneOptions = lanes.map(lane => `<option value="${escapeHtml(lane)}">${escapeHtml(lane)}</option>`).join('\n');
  const laneHealth = laneStats
    .map(
      lane => `
        <article class="lane-card ${lane.failed ? 'fail' : 'pass'}">
          <div>
            <span class="eyebrow">${escapeHtml(lane.lane)}</span>
            <h3>${escapeHtml(lane.deviceName || 'Unknown device')}</h3>
          </div>
          <dl>
            <div><dt>Port</dt><dd>${escapeHtml(lane.appiumPort || '')}</dd></div>
            <div><dt>Passed</dt><dd>${escapeHtml(lane.passed)}</dd></div>
            <div><dt>Failed</dt><dd>${escapeHtml(lane.failed)}</dd></div>
            <div><dt>Test time</dt><dd>${escapeHtml(formatDurationMs(lane.durationMs))}</dd></div>
          </dl>
        </article>`
    )
    .join('\n');
  const slowCallouts = slowResults.length
    ? slowResults
        .slice(0, 5)
        .map(
          result => `
            <a href="${escapeHtml(relativeLink(file, testDetailFile(outDir, result)))}">
              <strong>${escapeHtml(result.name)}</strong>
              <span>${escapeHtml(result.duration || formatDurationMs(resultDurationMs(result)))} · ${escapeHtml(laneForResult(result, runId))}${durationDeltaByTest.has(result.name) ? ` · ${escapeHtml(`${formatDurationMs(Math.abs(durationDeltaByTest.get(result.name)))} ${durationDeltaByTest.get(result.name) > 0 ? 'slower' : 'faster'} vs previous`)}` : ''}</span>
            </a>`
        )
        .join('\n')
    : '<p class="muted">No tests were more than 25% slower than the average.</p>';
  const comparisonList = runComparison.hasPrevious
    ? `
      <div class="comparison-grid">
        <div><dt>New failures</dt><dd>${escapeHtml(runComparison.newlyFailed.length)}</dd></div>
        <div><dt>New fixes</dt><dd>${escapeHtml(runComparison.newlyFixed.length)}</dd></div>
        <div><dt>Slower</dt><dd>${escapeHtml(runComparison.slower.length)}</dd></div>
        <div><dt>Faster</dt><dd>${escapeHtml(runComparison.faster.length)}</dd></div>
      </div>
      <div class="comparison-list">
        ${[
          ...runComparison.newlyFailed.slice(0, 4).map(result => ({
            href: relativeLink(file, testDetailFile(outDir, result)),
            label: result.name,
            meta: 'New failure',
            tone: 'fail',
          })),
          ...runComparison.newlyFixed.slice(0, 4).map(result => ({
            href: relativeLink(file, testDetailFile(outDir, result)),
            label: result.name,
            meta: 'Fixed since previous',
            tone: 'pass',
          })),
          ...runComparison.slower.slice(0, 4).map(item => ({
            href: relativeLink(file, testDetailFile(outDir, item.result)),
            label: item.result.name,
            meta: `${formatDurationMs(item.diffMs)} slower`,
            tone: 'slow',
          })),
          ...runComparison.faster.slice(0, 4).map(item => ({
            href: relativeLink(file, testDetailFile(outDir, item.result)),
            label: item.result.name,
            meta: `${formatDurationMs(Math.abs(item.diffMs))} faster`,
            tone: 'pass',
          })),
        ]
          .slice(0, 8)
          .map(
            item => `
              <a class="${escapeHtml(item.tone)}" href="${escapeHtml(item.href)}">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.meta)}</span>
              </a>`
          )
          .join('\n') || '<p class="muted">No major changes from the previous comparable run.</p>'}
      </div>`
    : '<p class="muted">No previous result-level report yet. This will populate after the next archived run.</p>';
  const categoryBars = Object.keys(categoryCounts).length
    ? Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([category, count]) => `
            <div class="category-row">
              <span>${escapeHtml(category)}</span>
              <div><i style="width: ${escapeHtml(Math.max(12, Math.round((count / failures.length) * 100)))}%"></i></div>
              <strong>${escapeHtml(count)}</strong>
            </div>`
        )
        .join('\n')
    : '<p class="muted">No failures to categorize.</p>';
  const environmentRows = [
    ['App branch', environment.appBranch],
    ['App commit', environment.appCommit],
    ['Connect version', environment.appVersion],
    ['Connect build', environment.appBuild],
    ['Bundle ID', environment.bundleId],
    ['Server environment', environment.serverEnvironment],
    ['Automation branch', environment.automationBranch],
    ['Automation commit', environment.automationCommit],
    ['Node', environment.node],
    ['Devices', environment.devices.join(', ')],
    ['Appium ports', environment.appiumPorts.join(', ')],
    ['WDA ports', environment.wdaPorts.join(', ')],
    ['Source', environment.source],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('\n');
  const evidenceTone = {
    READY: 'pass',
    NOT_READY: 'fail',
    STALE: 'warning',
    INCOMPLETE: 'warning',
    INCONCLUSIVE: 'unknown',
  }[evidence.decision] || 'unknown';
  const coverageRows = evidence.coverage.available
    ? evidence.coverage.rows
        .map(
          row => `
            <tr>
              <th scope="row">${escapeHtml(row.feature)}</th>
              <td><span class="coverage-class">${escapeHtml(row.classification)}</span></td>
              <td>${escapeHtml(row.scheduled)}/${escapeHtml(row.total)}</td>
              <td>${escapeHtml(row.completed)}/${escapeHtml(row.total)}</td>
              <td>${escapeHtml(row.passed)}</td>
              <td>${escapeHtml(row.failed + row.blocked + row.inconclusive)}</td>
            </tr>`
        )
        .join('\n')
    : '';
  const coveragePanel = evidence.coverage.available
    ? `<details class="panel disclosure coverage-panel">
        <summary class="section-summary">
          <span><strong>Automation coverage</strong><small>Required and optional tests by feature</small></span>
          <span class="summary-value">${escapeHtml(evidence.coverage.requiredCompleted)}/${escapeHtml(evidence.coverage.requiredTotal)} required</span>
        </summary>
        <div class="disclosure-body coverage-scroll"><table>
          <thead><tr><th>Feature</th><th>Class</th><th>Scheduled</th><th>Completed</th><th>Passed</th><th>Attention</th></tr></thead>
          <tbody>${coverageRows}</tbody>
        </table></div>
      </details>`
    : `<details class="panel disclosure coverage-panel coverage-fallback">
        <summary class="section-summary"><span><strong>Automation coverage</strong><small>No coverage contract attached</small></span><span class="summary-value">Not assessed</span></summary>
        <div class="disclosure-body"><p>No registry or coverage contract was attached to this run. Results are visible, but required-suite completeness cannot be claimed.</p></div>
      </details>`;
  const ccl = evidence.coverage.ccl;
  const cclRows = ccl?.available
    ? ccl.rows
        .map(
          row => `
            <tr>
              <th scope="row">${escapeHtml(row.id)}</th>
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.tests.join(', '))}</td>
              <td><span class="ccl-status ${escapeHtml(row.status.toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(row.status)}</span></td>
            </tr>`
        )
        .join('\n')
    : '';
  const cclCoveragePanel = ccl?.available
    ? `<details class="panel disclosure coverage-panel ccl-coverage-panel">
        <summary class="section-summary">
          <span><strong>CCL regression coverage</strong><small>Automated evidence mapped to release requirements</small></span>
          <span class="summary-value">${escapeHtml(ccl.passed)} passed · ${escapeHtml(ccl.attention)} attention</span>
        </summary>
        <div class="disclosure-body">
        <p class="coverage-note">${escapeHtml(ccl.passed)} passed · ${escapeHtml(ccl.partial)} partial · ${escapeHtml(ccl.attention)} attention · ${escapeHtml(ccl.notRun)} not run. Automation supplements the manual CCL checklist.</p>
        <div class="coverage-scroll"><table>
          <thead><tr><th>ID</th><th>Requirement</th><th>Automated by</th><th>Result</th></tr></thead>
          <tbody>${cclRows}</tbody>
        </table></div></div>
      </details>`
    : '';

  return {
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
    cclCoveragePanel,
  };
}

module.exports = { buildOverviewComponents };
