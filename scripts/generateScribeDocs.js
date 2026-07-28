require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const REPORTS_ROOT = path.join(REPO_ROOT, 'reports', 'runs');
const SCREENSHOTS_ROOT = path.join(REPO_ROOT, 'screenshots');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'docs', 'generated', 'scribe');

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsString(value) {
  return JSON.stringify(String(value ?? ''));
}

function slugify(value) {
  return String(value ?? 'test')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test';
}

function timestampSlug(value) {
  const date = new Date(value || Date.now());
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/\.\d{3}Z$/, 'Z').replace(/[:.]/g, '-');
}

function titleFromFileName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/^\d+[_-]?/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function relativeLink(fromFile, targetPath) {
  return path.relative(path.dirname(fromFile), targetPath).replace(/\\/g, '/');
}

function safePathPart(value) {
  return String(value ?? 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function copyScreenshotAsset({ outDir, laneRunId, testName, screenshot }) {
  const assetDir = ensureDir(path.join(outDir, 'assets', safePathPart(laneRunId), safePathPart(testName)));
  const target = path.join(assetDir, path.basename(screenshot));
  if (!fs.existsSync(target)) {
    fs.copyFileSync(screenshot, target);
  }
  return target;
}

function isWithinResultWindow(file, result) {
  const startedAt = Date.parse(result?.startedAt || '');
  const finishedAt = Date.parse(result?.finishedAt || '');
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return true;

  const stat = fs.statSync(file);
  const mtime = stat.mtimeMs;
  const toleranceMs = 120000;
  return mtime >= startedAt - toleranceMs && mtime <= finishedAt + toleranceMs;
}

function listScreenshots(runId, testName, result = {}) {
  const dir = path.join(SCREENSHOTS_ROOT, runId, testName);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
    .filter(file => result.status === 'FAIL' || !/^error\.(png|jpg|jpeg)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(file => path.join(dir, file));

  const inWindow = files.filter(file => isWithinResultWindow(file, result));
  return inWindow.length ? inWindow : files;
}

function parseLaneRunIdsFromCombinedSummary(runId) {
  const summaryPath = path.join(REPORTS_ROOT, runId, 'summary.md');
  const summary = readTextIfExists(summaryPath);
  const runIds = [];

  for (const line of summary.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const match = line.match(/\[summary\]\(\.\.\/([^)]+)\/summary\.md\)/);
    if (match) runIds.push(decodeURIComponent(match[1]));
  }

  return [...new Set(runIds)];
}

function loadRunSummary(runId) {
  const summaryJson = readJsonIfExists(path.join(REPORTS_ROOT, runId, 'summary.json'));
  if (summaryJson) {
    return {
      runId,
      source: 'summary.json',
      status: summaryJson.status || '',
      startedAt: summaryJson.startedAt || '',
      updatedAt: summaryJson.updatedAt || '',
      durationMs: summaryJson.durationMs,
      counts: summaryJson.counts || {},
      lanes: summaryJson.lanes || [],
      results: summaryJson.results || [],
    };
  }

  const laneRunIds = parseLaneRunIdsFromCombinedSummary(runId);
  if (!laneRunIds.length) {
    throw new Error(`No summary.json or lane summaries found for run "${runId}"`);
  }

  const laneSummaries = laneRunIds.map(loadRunSummary);
  const results = laneSummaries.flatMap(summary =>
    summary.results.map(result => ({
      ...result,
      laneRunId: summary.runId,
      laneLabel: summary.runId,
    }))
  );
  const failed = results.filter(result => result.status === 'FAIL').length;
  const passed = results.filter(result => result.status === 'PASS').length;
  return {
    runId,
    source: 'combined summary.md',
    status: failed ? 'FAIL' : 'PASS',
    startedAt: laneSummaries.map(summary => summary.startedAt).filter(Boolean).sort()[0] || '',
    updatedAt: new Date().toISOString(),
    counts: {
      total: results.length,
      passed,
      failed,
    },
    lanes: laneSummaries.map(summary => ({
      runId: summary.runId,
      label: summary.runId,
      tests: summary.results.map(result => result.name),
    })),
    results,
  };
}

function laneForResult(result, fallbackRunId) {
  return result.laneRunId || result.laneLabel || fallbackRunId;
}

function statusClass(status) {
  return String(status || 'UNKNOWN').toLowerCase();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function resultDurationMs(result) {
  if (Number.isFinite(result?.durationMs)) return result.durationMs;
  const started = Date.parse(result?.startedAt || '');
  const finished = Date.parse(result?.finishedAt || '');
  if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) {
    return finished - started;
  }
  return 0;
}

function shellQuote(value) {
  const text = String(value ?? '');
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function testFileForResult(result) {
  const explicit = {
    attachments: 'attachments.js',
    membersRoom: 'membersRoom.js',
    notifications: 'notifications.js',
    removeAllrooms: 'removeAllrooms.js',
  };
  return explicit[result.name] || `${result.name}.js`;
}

function rerunCommandForResult(result) {
  const env = [];
  if (result.appiumPort) env.push(`APPIUM_PORT=${shellQuote(result.appiumPort)}`);
  if (result.udid) env.push(`SIMULATOR_UDID=${shellQuote(result.udid)}`);
  if (result.deviceName) env.push(`DEVICE_NAME=${shellQuote(result.deviceName)}`);
  return [...env, 'node', `Tests/${testFileForResult(result)}`].join(' ');
}

function readLogSnippet(result, maxLines = 28) {
  const logPath = result?.logPath;
  if (!logPath) return '';
  const text = readTextIfExists(logPath);
  if (!text) return '';

  const lines = text
    .split(/\r?\n/)
    .filter(line => /error|fail|exception|stack|no such element|timeout/i.test(line));

  return (lines.length ? lines : text.split(/\r?\n/).slice(-maxLines)).slice(-maxLines).join('\n');
}

function failureSnippet(result) {
  return result?.error || readLogSnippet(result) || '';
}

function buildEnvironmentSummary(summary, results) {
  function gitValue(args) {
    try {
      return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  }

  const devices = [...new Set(results.map(result => result.deviceName).filter(Boolean))];
  const appiumPorts = [...new Set(results.map(result => result.appiumPort).filter(Boolean))];
  const wdaPorts = [...new Set(results.map(result => result.wdaLocalPort).filter(Boolean))];

  return {
    branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: gitValue(['rev-parse', '--short', 'HEAD']),
    node: process.version,
    bundleId: process.env.CONNECT_BUNDLE_ID || '',
    source: summary.source || '',
    devices,
    appiumPorts,
    wdaPorts,
  };
}

function buildLaneStats(results, runId) {
  const lanes = new Map();
  for (const result of results) {
    const lane = laneForResult(result, runId);
    if (!lanes.has(lane)) {
      lanes.set(lane, {
        lane,
        deviceName: result.deviceName || '',
        appiumPort: result.appiumPort || '',
        passed: 0,
        failed: 0,
        total: 0,
        durationMs: 0,
      });
    }

    const stats = lanes.get(lane);
    stats.deviceName ||= result.deviceName || '';
    stats.appiumPort ||= result.appiumPort || '';
    stats.total += 1;
    stats.durationMs += resultDurationMs(result);
    if (result.status === 'PASS') stats.passed += 1;
    if (result.status === 'FAIL') stats.failed += 1;
  }
  return [...lanes.values()];
}

function countsForSummary(summary) {
  const results = summary.results || [];
  const counts = summary.counts || {};
  const failed = counts.failed ?? results.filter(result => result.status === 'FAIL').length;
  const passed = counts.passed ?? results.filter(result => result.status === 'PASS').length;
  return {
    passed,
    failed,
    total: counts.total ?? results.length,
  };
}

function archiveRunId(runId, summary) {
  return `${timestampSlug(summary.startedAt || summary.updatedAt)}-${safePathPart(runId)}`;
}

function previewFailureSpec() {
  return argValue('preview-failures', process.env.SCRIBE_DOC_PREVIEW_FAILURES || '');
}

function cloneSummary(summary) {
  return JSON.parse(JSON.stringify(summary));
}

function withPreviewFailures(summary, spec) {
  if (!spec) return summary;

  const next = cloneSummary(summary);
  const results = next.results || [];
  const trimmed = String(spec).trim();
  const count = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : 0;
  const names = count
    ? results.filter(result => result.status === 'PASS').slice(0, count).map(result => result.name)
    : trimmed.split(',').map(name => name.trim()).filter(Boolean);
  const selected = new Set(names);

  next.results = results.map(result => {
    if (!selected.has(result.name)) return result;
    return {
      ...result,
      status: 'FAIL',
      error:
        result.error ||
        `Preview failure for ${result.name}. This is not a real test failure; it exists to verify failed-step highlighting in the generated report.`,
    };
  });

  const failed = next.results.filter(result => result.status === 'FAIL').length;
  const passed = next.results.filter(result => result.status === 'PASS').length;
  next.status = failed ? 'FAIL' : next.status;
  next.updatedAt = new Date().toISOString();
  next.counts = {
    ...(next.counts || {}),
    total: next.results.length,
    passed,
    failed,
  };
  return next;
}

function failedStepIndex(screenshots, result) {
  if (result.status !== 'FAIL' || !screenshots.length) return -1;
  const errorIndex = screenshots.findIndex(screenshot => /^error\.(png|jpe?g)$/i.test(path.basename(screenshot)));
  return errorIndex >= 0 ? errorIndex : screenshots.length - 1;
}

function writeTestDoc({ outDir, runId, result }) {
  const laneRunId = laneForResult(result, runId);
  const screenshots = listScreenshots(laneRunId, result.name, result);
  const screenshotAssets = screenshots.map(screenshot =>
    copyScreenshotAsset({ outDir, laneRunId, testName: result.name, screenshot })
  );
  const failedIndex = failedStepIndex(screenshotAssets, result);
  const file = path.join(outDir, `${result.name}.md`);
  const lines = [
    `# ${result.name}`,
    '',
    `- Status: ${result.status || 'UNKNOWN'}`,
    `- Duration: ${result.duration || ''}`,
    `- Lane: ${laneRunId}`,
    `- Device: ${result.deviceName || ''}`,
    `- Appium port: ${result.appiumPort || ''}`,
    `- Started: ${result.startedAt || ''}`,
    `- Finished: ${result.finishedAt || ''}`,
  ];

  if (result.error) {
    lines.push('', '## Failure', '', '```text', result.error, '```');
  }

  if (screenshots.length) {
    lines.push('', '## Steps');
    screenshotAssets.forEach((screenshot, index) => {
      const failedHere = index === failedIndex;
      lines.push(
        '',
        `### Step ${index + 1}: ${titleFromFileName(screenshot)}${failedHere ? ' - Failed here' : ''}`,
        '',
        `![${titleFromFileName(screenshot)}](${relativeLink(file, screenshot)})`
      );
      if (failedHere && result.error) {
        lines.push('', '**Failure at this step:**', '', '```text', result.error, '```');
      }
    });
  } else {
    lines.push('', '## Steps', '', '_No screenshots found for this test run._');
  }

  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

function writeIndex({ outDir, runId, summary, testDocs }) {
  const file = path.join(outDir, 'index.md');
  const counts = summary.counts || {};
  const failures = summary.results.filter(result => result.status === 'FAIL');
  const lines = [
    '# Scribe-Style Test Documentation',
    '',
    `- Run ID: ${runId}`,
    `- Source: ${summary.source}`,
    `- Status: ${summary.status || ''}`,
    `- Started: ${summary.startedAt || ''}`,
    `- Updated: ${summary.updatedAt || ''}`,
    `- Passed: ${counts.passed ?? summary.results.filter(result => result.status === 'PASS').length}`,
    `- Failed: ${counts.failed ?? failures.length}`,
    `- Total tests: ${counts.total ?? summary.results.length}`,
    '',
    '## Tests',
    '',
    '| Test | Lane | Status | Duration | Screenshots | Guide |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const result of summary.results) {
    const laneRunId = laneForResult(result, runId);
    const screenshots = listScreenshots(laneRunId, result.name, result);
    lines.push(
      `| ${escapeMd(result.name)} | ${escapeMd(laneRunId)} | ${escapeMd(result.status || '')} | ${escapeMd(result.duration || '')} | ${screenshots.length} | [guide](${relativeLink(file, testDocs[result.name])}) |`
    );
  }

  if (failures.length) {
    lines.push('', '## Failures', '');
    for (const failure of failures) {
      lines.push(`- **${failure.name}**: ${failure.error || 'Failed without error text'}`);
    }
  }

  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

function reportNavLabel(report) {
  const typeLabel = report.reportType === 'archive' ? 'Archived' : 'Latest';
  const dateLabel = formatDate(report.startedAt) || report.startedAt || 'No start time';
  const statusLabel = report.status || 'UNKNOWN';
  return `${typeLabel} - ${dateLabel} - ${statusLabel}`;
}

function buildReportNav(reports, currentFile) {
  const current = path.resolve(currentFile);
  return reports.map(report => {
    const reportFile = path.join(report.dir, 'index.html');
    return {
      href: relativeLink(currentFile, reportFile),
      label: reportNavLabel(report),
      selected: path.resolve(reportFile) === current,
    };
  });
}

function buildTestHistory(reports = []) {
  const byTest = new Map();
  const seen = new Set();

  for (const report of reports) {
    const key = `${report.runId || ''}|${report.startedAt || ''}|${report.reportType || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const result of report.results || []) {
      if (!byTest.has(result.name)) byTest.set(result.name, []);
      byTest.get(result.name).push({
        runId: report.runId || '',
        reportType: report.reportType || '',
        status: result.status || 'UNKNOWN',
        duration: result.duration || formatDurationMs(result.durationMs),
        durationMs: result.durationMs || 0,
        startedAt: report.startedAt || result.startedAt || '',
        href: report.href || '',
        dir: report.dir || '',
      });
    }
  }

  for (const entries of byTest.values()) {
    entries.sort((a, b) => Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0));
  }

  return byTest;
}

function flakeSummary(history = []) {
  const statuses = new Set(history.map(entry => entry.status).filter(Boolean));
  if (statuses.has('PASS') && statuses.has('FAIL')) return 'Flaky in recent runs';
  if (history.length < 2) return 'No history yet';
  if (statuses.has('FAIL')) return 'Failing recently';
  if (statuses.has('PASS')) return 'Stable recently';
  return 'No signal';
}

function writeHtmlReport({ outDir, runId, summary, testDocs, reportNav = [], allReports = [] }) {
  const file = path.join(outDir, 'index.html');
  const counts = summary.counts || {};
  const results = summary.results || [];
  const passed = counts.passed ?? results.filter(result => result.status === 'PASS').length;
  const failed = counts.failed ?? results.filter(result => result.status === 'FAIL').length;
  const total = counts.total ?? results.length;
  const failures = results.filter(result => result.status === 'FAIL');
  const lanes = [...new Set(results.map(result => laneForResult(result, runId)).filter(Boolean))];
  const status = summary.status || (failed ? 'FAIL' : 'PASS');
  const started = formatDate(summary.startedAt);
  const updated = formatDate(summary.updatedAt);
  const totalDurationMs = results.reduce((sum, result) => sum + resultDurationMs(result), 0);
  const averageDurationMs = results.length ? totalDurationMs / results.length : 0;
  const slowThresholdMs = averageDurationMs * 1.25;
  const slowResults = results
    .filter(result => resultDurationMs(result) > slowThresholdMs && resultDurationMs(result) > 0)
    .sort((a, b) => resultDurationMs(b) - resultDurationMs(a));
  const laneStats = buildLaneStats(results, runId);
  const environment = buildEnvironmentSummary(summary, results);
  const testHistory = buildTestHistory(allReports);
  const reportSwitcher = reportNav.length
    ? `
      <label class="report-switcher">
        <span>Previous runs</span>
        <select id="reportSwitcher" aria-label="Open another report run">
          ${reportNav
            .map(
              report => `<option value="${escapeHtml(report.href)}"${report.selected ? ' selected' : ''}>${escapeHtml(report.label)}</option>`
            )
            .join('\n')}
        </select>
      </label>`
    : '';

  const testCards = results
    .map(result => {
      const laneRunId = laneForResult(result, runId);
      const screenshots = listScreenshots(laneRunId, result.name, result);
      const testId = slugify(result.name);
      const durationMs = resultDurationMs(result);
      const isSlow = slowResults.includes(result);
      const history = testHistory.get(result.name) || [];
      const flake = flakeSummary(history);
      return `
        <a class="test-card ${statusClass(result.status)}${isSlow ? ' slow' : ''}" href="#${testId}" data-test-card data-name="${escapeHtml(result.name.toLowerCase())}" data-status="${escapeHtml(result.status || 'UNKNOWN')}" data-lane="${escapeHtml(laneRunId)}" data-slow="${isSlow ? '1' : '0'}" data-screenshots="${screenshots.length ? '1' : '0'}" data-flaky="${flake === 'Flaky in recent runs' ? '1' : '0'}">
          <div class="test-card-top">
            <span class="status-pill ${statusClass(result.status)}">${escapeHtml(result.status || 'UNKNOWN')}</span>
            <span class="duration">${escapeHtml(result.duration || formatDurationMs(durationMs))}</span>
          </div>
          <h3>${escapeHtml(result.name)}</h3>
          <p>${escapeHtml(laneRunId)}${result.deviceName ? ` / ${escapeHtml(result.deviceName)}` : ''}</p>
          <div class="card-tags">
            <span>${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'}</span>
            ${isSlow ? '<span>Slow</span>' : ''}
            ${flake === 'Flaky in recent runs' ? '<span>Flaky</span>' : ''}
          </div>
        </a>`;
    })
    .join('\n');

  const testSections = results
    .map(result => {
      const laneRunId = laneForResult(result, runId);
      const screenshots = listScreenshots(laneRunId, result.name, result);
      const testId = slugify(result.name);
      const screenshotCount = screenshots.length;
      const isFailure = result.status === 'FAIL';
      const durationMs = resultDurationMs(result);
      const isSlow = slowResults.includes(result);
      const screenshotAssets = screenshots.map(screenshot =>
        copyScreenshotAsset({ outDir, laneRunId, testName: result.name, screenshot })
      );
      const failedIndex = failedStepIndex(screenshotAssets, result);
      const failedAsset = failedIndex >= 0 ? screenshotAssets[failedIndex] : null;
      const beforeFailureAsset = failedIndex > 0 ? screenshotAssets[failedIndex - 1] : null;
      const afterFailureAsset = failedIndex >= 0 && failedIndex < screenshotAssets.length - 1 ? screenshotAssets[failedIndex + 1] : null;
      const snippet = failureSnippet(result);
      const rerunCommand = rerunCommandForResult(result);
      const history = (testHistory.get(result.name) || []).slice(0, 8);
      const flake = flakeSummary(history);
      const failure = snippet
        ? `<section class="failure-box"><h4>Error snippet</h4><pre>${escapeHtml(snippet)}</pre></section>`
        : '';
      const failureTimeline =
        isFailure && failedAsset
          ? `
            <section class="failure-timeline">
              <div>
                <h4>Failure timeline</h4>
                <p class="muted">The highlighted step is where the report believes the failure happened.</p>
              </div>
              <div class="timeline-strip">
                ${beforeFailureAsset ? `<a href="${escapeHtml(relativeLink(file, beforeFailureAsset))}"><span>Before</span><img src="${escapeHtml(relativeLink(file, beforeFailureAsset))}" alt="Step before failure" loading="lazy"></a>` : ''}
                <a class="timeline-failed" href="${escapeHtml(relativeLink(file, failedAsset))}"><span>Failed</span><img src="${escapeHtml(relativeLink(file, failedAsset))}" alt="Failed step" loading="lazy"></a>
                ${afterFailureAsset ? `<a href="${escapeHtml(relativeLink(file, afterFailureAsset))}"><span>After</span><img src="${escapeHtml(relativeLink(file, afterFailureAsset))}" alt="Step after failure" loading="lazy"></a>` : ''}
              </div>
            </section>`
          : '';
      const screenshotCompare =
        isFailure && failedAsset && beforeFailureAsset
          ? `
            <section class="compare-box">
              <h4>Screenshot compare</h4>
              <div class="compare-grid">
                <figure>
                  <img src="${escapeHtml(relativeLink(file, beforeFailureAsset))}" alt="Last screenshot before failure" loading="lazy">
                  <figcaption><span>Before failure</span>${escapeHtml(titleFromFileName(beforeFailureAsset))}</figcaption>
                </figure>
                <figure>
                  <img src="${escapeHtml(relativeLink(file, failedAsset))}" alt="Failed screenshot" loading="lazy">
                  <figcaption><span>Failed screenshot</span>${escapeHtml(titleFromFileName(failedAsset))}</figcaption>
                </figure>
              </div>
            </section>`
          : '';
      const historyList = history.length
        ? `
          <div class="history-list">
            ${history
              .map(
                item => `
                  <a href="${escapeHtml(item.dir ? relativeLink(file, path.join(item.dir, 'index.html')) : item.href || '#')}">
                    <span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span>
                    <strong>${escapeHtml(formatDate(item.startedAt) || item.runId || 'Run')}</strong>
                    <small>${escapeHtml(item.duration || '')}</small>
                  </a>`
              )
              .join('\n')}
          </div>`
        : '<p class="muted">No archived history for this test yet.</p>';
      const screenshotGrid = screenshotAssets.length
        ? screenshotAssets
            .map((screenshot, index) => {
              const title = titleFromFileName(screenshot);
              const failedHere = index === failedIndex;
              return `
                <figure class="step${failedHere ? ' failed-step' : ''}">
                  <a href="${escapeHtml(relativeLink(file, screenshot))}">
                    <img src="${escapeHtml(relativeLink(file, screenshot))}" alt="${escapeHtml(title)}" loading="lazy">
                  </a>
                  <figcaption>
                    <span>${failedHere ? 'Failed here' : `Step ${index + 1}`}</span>
                    ${escapeHtml(title)}
                    ${failedHere && result.error ? `<pre class="step-error">${escapeHtml(result.error)}</pre>` : ''}
                  </figcaption>
                </figure>`;
            })
            .join('\n')
        : '<p class="muted">No screenshots found for this test run.</p>';

      return `
        <details class="test-section" id="${testId}" data-test-section data-name="${escapeHtml(result.name.toLowerCase())}" data-status="${escapeHtml(result.status || 'UNKNOWN')}" data-lane="${escapeHtml(laneRunId)}" data-slow="${isSlow ? '1' : '0'}" data-screenshots="${screenshotCount ? '1' : '0'}" data-flaky="${flake === 'Flaky in recent runs' ? '1' : '0'}"${isFailure ? ' open' : ''}>
          <summary class="section-summary">
            <div>
              <span class="status-pill ${statusClass(result.status)}">${escapeHtml(result.status || 'UNKNOWN')}</span>
              ${isSlow ? '<span class="status-pill slow-pill">SLOW</span>' : ''}
              <h2>${escapeHtml(result.name)}</h2>
              <p>${escapeHtml(laneRunId)}${result.deviceName ? ` / ${escapeHtml(result.deviceName)}` : ''} · ${escapeHtml(flake)}</p>
            </div>
            <div class="summary-meta">
              <span>${escapeHtml(result.duration || formatDurationMs(durationMs))}</span>
              <span>${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}</span>
              <span class="collapse-label">Details</span>
            </div>
          </summary>
          <div class="test-section-body">
            <div class="test-actions">
              <a class="markdown-link" href="${escapeHtml(relativeLink(file, testDocs[result.name]))}">Markdown guide</a>
              <button type="button" data-copy="${escapeHtml(rerunCommand)}">Copy rerun command</button>
              <button type="button" data-copy-link="#${escapeHtml(testId)}">Copy section link</button>
            </div>
            <section class="command-box">
              <h4>Rerun this test</h4>
              <code>${escapeHtml(rerunCommand)}</code>
            </section>
            <dl class="meta-grid">
              <div><dt>Duration</dt><dd>${escapeHtml(result.duration || formatDurationMs(durationMs))}</dd></div>
              <div><dt>Lane</dt><dd>${escapeHtml(laneRunId)}</dd></div>
              <div><dt>Device</dt><dd>${escapeHtml(result.deviceName || '')}</dd></div>
              <div><dt>Appium port</dt><dd>${escapeHtml(result.appiumPort || '')}</dd></div>
              <div><dt>Started</dt><dd>${escapeHtml(formatDate(result.startedAt) || result.startedAt || '')}</dd></div>
              <div><dt>Finished</dt><dd>${escapeHtml(formatDate(result.finishedAt) || result.finishedAt || '')}</dd></div>
              <div><dt>History</dt><dd>${escapeHtml(flake)}</dd></div>
            </dl>
            ${failure}
            ${failureTimeline}
            ${screenshotCompare}
            <section class="history-box">
              <h4>Recent history for ${escapeHtml(result.name)}</h4>
              ${historyList}
            </section>
            <div class="steps-grid">${screenshotGrid}</div>
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
              <a href="#${slugify(failure.name)}">
                <strong>${escapeHtml(failure.name)}</strong>
                <span>${escapeHtml(failure.error || 'Failed without error text')}</span>
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
            <div><dt>Runtime</dt><dd>${escapeHtml(formatDurationMs(lane.durationMs))}</dd></div>
          </dl>
        </article>`
    )
    .join('\n');
  const slowCallouts = slowResults.length
    ? slowResults
        .slice(0, 5)
        .map(
          result => `
            <a href="#${slugify(result.name)}">
              <strong>${escapeHtml(result.name)}</strong>
              <span>${escapeHtml(result.duration || formatDurationMs(resultDurationMs(result)))} · ${escapeHtml(laneForResult(result, runId))}</span>
            </a>`
        )
        .join('\n')
    : '<p class="muted">No tests were more than 25% slower than the average.</p>';
  const environmentRows = [
    ['Branch', environment.branch],
    ['Commit', environment.commit],
    ['Node', environment.node],
    ['Bundle ID', environment.bundleId],
    ['Devices', environment.devices.join(', ')],
    ['Appium ports', environment.appiumPorts.join(', ')],
    ['WDA ports', environment.wdaPorts.join(', ')],
    ['Source', environment.source],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(runId)} test report</title>
  <style>
    :root {
      --ink: #162033;
      --muted: #6c7789;
      --line: #dfe6ef;
      --paper: #f7f9fc;
      --panel: #ffffff;
      --pass: #0f9f6e;
      --fail: #d93f3f;
      --unknown: #7c8798;
      --navy: #090222;
      --blue: #0e61d8;
      --shadow: 0 18px 60px rgba(22, 32, 51, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(14, 97, 216, 0.18), transparent 34rem),
        linear-gradient(180deg, #eef4fb 0%, var(--paper) 24rem);
      font: 16px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: inherit; }
    .hero {
      padding: 3rem clamp(1rem, 4vw, 4rem) 2rem;
      color: white;
      background:
        linear-gradient(135deg, rgba(9, 2, 34, 0.96), rgba(13, 45, 88, 0.94)),
        radial-gradient(circle at 70% 10%, rgba(255, 255, 255, 0.2), transparent 20rem);
    }
    .hero-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 25rem);
      gap: 1.5rem;
      align-items: start;
    }
    .hero h1 {
      margin: 0 0 0.5rem;
      font-size: clamp(2.2rem, 5vw, 4.7rem);
      letter-spacing: -0.06em;
      line-height: 0.95;
    }
    .hero p { margin: 0; color: rgba(255, 255, 255, 0.72); }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
    .hero-meta span {
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      padding: 0.45rem 0.75rem;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.86);
    }
    .report-switcher {
      display: grid;
      gap: 0.45rem;
      padding: 0.85rem;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.78);
      font-weight: 800;
    }
    .report-switcher span {
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .report-switcher select {
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.94);
    }
    main { padding: 2rem clamp(1rem, 4vw, 4rem) 4rem; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
      margin-top: -3.5rem;
    }
    .stat, .panel, .test-section {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(223, 230, 239, 0.85);
      border-radius: 1.3rem;
      box-shadow: var(--shadow);
    }
    .stat { padding: 1.2rem; }
    .stat span { display: block; color: var(--muted); font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .stat strong { display: block; margin-top: 0.35rem; font-size: 2rem; line-height: 1; }
    .sticky-summary {
      position: sticky;
      top: 0.75rem;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      align-items: center;
      margin: 1rem 0 1.5rem;
      padding: 0.7rem;
      border: 1px solid rgba(223, 230, 239, 0.92);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 12px 36px rgba(22, 32, 51, 0.1);
      backdrop-filter: blur(14px);
    }
    .sticky-summary strong,
    .sticky-summary span {
      border-radius: 999px;
      padding: 0.35rem 0.65rem;
      background: #f4f7fb;
      font-weight: 800;
    }
    button {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.55rem 0.8rem;
      background: #edf4ff;
      color: var(--blue);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .overview-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.8fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .overview-grid .panel {
      margin-bottom: 0;
    }
    .panel-heading {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: start;
      margin-bottom: 1rem;
    }
    .panel-heading h2,
    .panel h2 {
      margin: 0;
      letter-spacing: -0.04em;
    }
    .panel-heading p {
      margin: 0;
      color: var(--muted);
      font-weight: 700;
    }
    .lane-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.8rem;
    }
    .lane-card {
      border: 1px solid var(--line);
      border-radius: 1rem;
      padding: 0.9rem;
      background: #fbfdff;
    }
    .lane-card.fail {
      border-color: rgba(217, 63, 63, 0.42);
      background: #fff7f7;
    }
    .lane-card h3 {
      margin: 0.2rem 0 0.8rem;
      line-height: 1.1;
    }
    .lane-card dl,
    .run-environment dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.55rem;
      margin: 0;
    }
    .lane-card dl div {
      border: 1px solid var(--line);
      border-radius: 0.7rem;
      padding: 0.55rem;
      background: white;
    }
    .eyebrow {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .slow-list {
      display: grid;
      gap: 0.55rem;
    }
    .slow-list a {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      border: 1px solid var(--line);
      border-radius: 0.8rem;
      padding: 0.65rem;
      background: #fbfdff;
      text-decoration: none;
    }
    .slow-list span {
      color: var(--muted);
      font-weight: 700;
      text-align: right;
    }
    .compact {
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      margin-bottom: 0;
    }
    textarea {
      width: 100%;
      min-height: 9rem;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      padding: 0.85rem 1rem;
      background: white;
      color: var(--ink);
      font: inherit;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) 12rem 14rem repeat(3, max-content);
      gap: 0.75rem;
      margin: 1.5rem 0;
      align-items: center;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      padding: 0.85rem 1rem;
      background: white;
      color: var(--ink);
      font: inherit;
    }
    .check-filter {
      display: inline-flex;
      gap: 0.4rem;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.65rem 0.8rem;
      background: white;
      color: var(--muted);
      font-weight: 800;
      white-space: nowrap;
    }
    .check-filter input {
      width: auto;
    }
    .test-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .test-card {
      display: block;
      min-height: 11rem;
      padding: 1rem;
      text-decoration: none;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 1.2rem;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    }
    .test-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: rgba(14, 97, 216, 0.4); }
    .test-card.fail { border-color: rgba(217, 63, 63, 0.45); }
    .test-card.slow { border-color: rgba(245, 158, 11, 0.55); }
    .test-card-top {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.25rem 0.6rem;
      color: white;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .status-pill.pass { background: var(--pass); }
    .status-pill.fail { background: var(--fail); }
    .status-pill.unknown { background: var(--unknown); }
    .slow-pill { background: #d97706; margin-left: 0.35rem; }
    .duration, .muted, .test-card p, .screenshot-count { color: var(--muted); }
    .test-card h3 { margin: 1.1rem 0 0.35rem; font-size: 1.35rem; line-height: 1.1; }
    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 1rem;
      color: var(--muted);
      font-size: 0.9rem;
      font-weight: 800;
    }
    .card-tags span {
      border-radius: 999px;
      padding: 0.25rem 0.55rem;
      background: #f4f7fb;
    }
    .panel { padding: 1.25rem; margin-bottom: 1.5rem; }
    .failures a {
      display: grid;
      gap: 0.25rem;
      padding: 0.85rem 0;
      border-top: 1px solid var(--line);
      text-decoration: none;
    }
    .failures span {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .test-section {
      margin-top: 1.5rem;
      overflow: hidden;
    }
    .section-summary {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
      padding: clamp(1rem, 3vw, 1.6rem);
      cursor: pointer;
      list-style: none;
    }
    .section-summary::-webkit-details-marker { display: none; }
    .section-summary h2 {
      margin: 0.5rem 0 0;
      font-size: clamp(1.5rem, 3vw, 2.35rem);
      letter-spacing: -0.04em;
    }
    .section-summary p {
      margin: 0.35rem 0 0;
      color: var(--muted);
      font-weight: 700;
    }
    .summary-meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: end;
      gap: 0.55rem;
      color: var(--muted);
      font-weight: 800;
    }
    .summary-meta span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.35rem 0.65rem;
      background: #fbfdff;
    }
    .collapse-label {
      color: var(--blue);
    }
    .collapse-label::before {
      content: 'Open ';
    }
    .test-section[open] .collapse-label::before {
      content: 'Close ';
    }
    .test-section-body {
      padding: 0 clamp(1rem, 3vw, 1.6rem) clamp(1rem, 3vw, 1.6rem);
      border-top: 1px solid var(--line);
    }
    .test-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      margin: 1rem 0;
    }
    .markdown-link {
      display: inline-flex;
      border-radius: 999px;
      padding: 0.55rem 0.8rem;
      background: #edf4ff;
      color: var(--blue);
      font-weight: 700;
      text-decoration: none;
    }
    .command-box,
    .failure-timeline,
    .compare-box,
    .history-box {
      border: 1px solid var(--line);
      border-radius: 1rem;
      background: #fbfdff;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .command-box h4,
    .failure-timeline h4,
    .compare-box h4,
    .history-box h4 {
      margin: 0 0 0.5rem;
    }
    .command-box code {
      display: block;
      overflow-x: auto;
      border-radius: 0.75rem;
      padding: 0.8rem;
      background: #101828;
      color: #e9f1ff;
      white-space: nowrap;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 0.75rem;
      margin: 0 0 1.25rem;
    }
    .meta-grid div {
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      padding: 0.75rem;
      background: #fbfdff;
    }
    dt { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }
    dd { margin: 0.25rem 0 0; font-weight: 700; }
    .failure-box {
      border: 1px solid rgba(217, 63, 63, 0.28);
      border-radius: 1rem;
      background: #fff5f5;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .timeline-strip,
    .compare-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 0.8rem;
    }
    .timeline-strip a,
    .compare-grid figure {
      margin: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      background: white;
      text-decoration: none;
    }
    .timeline-strip span {
      display: block;
      padding: 0.5rem 0.65rem;
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .timeline-failed {
      border-color: rgba(217, 63, 63, 0.62) !important;
      box-shadow: 0 14px 36px rgba(217, 63, 63, 0.18);
    }
    .timeline-strip img,
    .compare-grid img {
      display: block;
      width: 100%;
      height: 18rem;
      object-fit: contain;
      background: #111827;
    }
    .history-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.65rem;
    }
    .history-list a {
      display: grid;
      gap: 0.35rem;
      border: 1px solid var(--line);
      border-radius: 0.85rem;
      padding: 0.75rem;
      background: white;
      text-decoration: none;
    }
    .history-list small {
      color: var(--muted);
      font-weight: 800;
    }
    pre {
      overflow: auto;
      white-space: pre-wrap;
      margin: 0;
      color: #7a2020;
      font-size: 0.9rem;
    }
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      gap: 1rem;
    }
    .step {
      margin: 0;
      border: 1px solid var(--line);
      border-radius: 1rem;
      overflow: hidden;
      background: white;
    }
    .failed-step {
      border: 3px solid var(--fail);
      box-shadow: 0 18px 50px rgba(217, 63, 63, 0.24);
      position: relative;
    }
    .failed-step::before {
      content: 'Failed here';
      position: absolute;
      z-index: 1;
      top: 0.8rem;
      left: 0.8rem;
      border-radius: 999px;
      padding: 0.35rem 0.7rem;
      background: var(--fail);
      color: white;
      font-size: 0.78rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow: 0 10px 28px rgba(217, 63, 63, 0.3);
    }
    .step img {
      display: block;
      width: 100%;
      height: min(34rem, 68vh);
      object-fit: contain;
      background: #111827;
    }
    figcaption {
      display: grid;
      gap: 0.2rem;
      padding: 0.85rem;
      color: var(--ink);
      font-weight: 700;
    }
    figcaption span {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .step-error {
      margin-top: 0.65rem;
      border-radius: 0.75rem;
      padding: 0.75rem;
      background: #fff5f5;
      color: #7a2020;
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
    }
    [hidden] { display: none !important; }
    @media (max-width: 780px) {
      .stats, .toolbar, .overview-grid { grid-template-columns: 1fr; }
      .sticky-summary { border-radius: 1rem; }
      .hero-layout { grid-template-columns: 1fr; }
      .hero { padding-top: 2rem; }
      .section-summary { display: block; }
      .summary-meta { justify-content: start; margin-top: 1rem; }
      .markdown-link { display: inline-block; margin-top: 1rem; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-layout">
      <div>
        <h1>Test Run Report</h1>
        <p>Scribe-style browser report generated from Appium screenshots and runner results.</p>
        <div class="hero-meta">
          <span>Run: ${escapeHtml(runId)}</span>
          <span>Source: ${escapeHtml(summary.source)}</span>
          <span>Started: ${escapeHtml(started || summary.startedAt || '')}</span>
          <span>Updated: ${escapeHtml(updated || summary.updatedAt || '')}</span>
        </div>
      </div>
      ${reportSwitcher}
    </div>
  </header>

  <main>
    <section class="stats" aria-label="Run summary">
      <div class="stat"><span>Status</span><strong>${escapeHtml(status)}</strong></div>
      <div class="stat"><span>Passed</span><strong>${escapeHtml(passed)}</strong></div>
      <div class="stat"><span>Failed</span><strong>${escapeHtml(failed)}</strong></div>
      <div class="stat"><span>Total</span><strong>${escapeHtml(total)}</strong></div>
    </section>

    <section class="sticky-summary" aria-label="Sticky run summary">
      <strong>${escapeHtml(status)}</strong>
      <span>${escapeHtml(passed)} passed</span>
      <span>${escapeHtml(failed)} failed</span>
      <span>${escapeHtml(formatDurationMs(totalDurationMs))} total test time</span>
      <button type="button" data-copy-link="">Copy report link</button>
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
      <div class="panel environment-panel">
        <div class="panel-heading">
          <h2>Environment</h2>
          <p>Run context</p>
        </div>
        <dl class="meta-grid compact">${environmentRows || '<div><dt>Environment</dt><dd>No extra details found</dd></div>'}</dl>
      </div>
      <div class="panel annotations-panel">
        <div class="panel-heading">
          <h2>Notes</h2>
          <p>Saved in this browser</p>
        </div>
        <textarea id="reportNotes" placeholder="Add triage notes, suspected app bugs, or follow-up items for this run."></textarea>
      </div>
    </section>

    <section class="toolbar" aria-label="Report filters">
      <input id="search" type="search" placeholder="Search tests">
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="PASS">Pass</option>
        <option value="FAIL">Fail</option>
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

    ${failureList}

    ${testSections}
  </main>

  <script>
    const search = document.querySelector('#search');
    const statusFilter = document.querySelector('#statusFilter');
    const laneFilter = document.querySelector('#laneFilter');
    const failedOnly = document.querySelector('#failedOnly');
    const slowOnly = document.querySelector('#slowOnly');
    const screenshotsOnly = document.querySelector('#screenshotsOnly');
    const reportNotes = document.querySelector('#reportNotes');
    const reportSwitcher = document.querySelector('#reportSwitcher');
    const cards = [...document.querySelectorAll('[data-test-card]')];
    const sections = [...document.querySelectorAll('[data-test-section]')];
    const notesKey = ${jsString(`connect-report-notes:${runId}:${summary.startedAt || ''}`)};

    function openSection(section) {
      if (!section) return;
      section.open = true;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function shouldShow(element) {
      const term = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const lane = laneFilter.value;
      const onlyFailures = failedOnly.checked;
      const onlySlow = slowOnly.checked;
      const onlyScreenshots = screenshotsOnly.checked;
      return (!term || element.dataset.name.includes(term)) &&
        (!status || element.dataset.status === status) &&
        (!lane || element.dataset.lane === lane) &&
        (!onlyFailures || element.dataset.status === 'FAIL') &&
        (!onlySlow || element.dataset.slow === '1') &&
        (!onlyScreenshots || element.dataset.screenshots === '1');
    }

    function applyFilters() {
      cards.forEach(card => { card.hidden = !shouldShow(card); });
      sections.forEach(section => { section.hidden = !shouldShow(section); });
    }

    async function copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }

      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    [search, statusFilter, laneFilter, failedOnly, slowOnly, screenshotsOnly].forEach(input => input.addEventListener('input', applyFilters));
    cards.forEach(card => {
      card.addEventListener('click', event => {
        const section = document.querySelector(card.getAttribute('href'));
        if (!section) return;
        event.preventDefault();
        openSection(section);
        history.replaceState(null, '', card.getAttribute('href'));
      });
    });
    window.addEventListener('hashchange', () => openSection(document.querySelector(window.location.hash)));
    if (window.location.hash) openSection(document.querySelector(window.location.hash));
    if (reportSwitcher) {
      reportSwitcher.addEventListener('change', () => {
        if (reportSwitcher.value) window.location.href = reportSwitcher.value;
      });
    }
    document.querySelectorAll('[data-copy]').forEach(button => {
      button.addEventListener('click', async () => {
        await copyText(button.dataset.copy || '');
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = original; }, 1200);
      });
    });
    document.querySelectorAll('[data-copy-link]').forEach(button => {
      button.addEventListener('click', async () => {
        const hash = button.dataset.copyLink || '';
        const url = new URL(window.location.href);
        url.hash = hash.replace(/^#/, '');
        await copyText(url.toString());
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = original; }, 1200);
      });
    });
    if (reportNotes) {
      reportNotes.value = localStorage.getItem(notesKey) || '';
      reportNotes.addEventListener('input', () => {
        localStorage.setItem(notesKey, reportNotes.value);
      });
    }
  </script>
</body>
</html>
`;

  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function writeReportMeta({ outDir, runId, summary, reportType }) {
  const counts = countsForSummary(summary);
  const results = summary.results || [];
  const meta = {
    runId,
    reportType,
    source: summary.source,
    status: summary.status || (counts.failed ? 'FAIL' : 'PASS'),
    startedAt: summary.startedAt || '',
    updatedAt: summary.updatedAt || '',
    passed: counts.passed,
    failed: counts.failed,
    total: counts.total,
    environment: buildEnvironmentSummary(summary, results),
    results: results.map(result => ({
      name: result.name,
      status: result.status || 'UNKNOWN',
      duration: result.duration || formatDurationMs(resultDurationMs(result)),
      durationMs: resultDurationMs(result),
      laneRunId: laneForResult(result, runId),
      deviceName: result.deviceName || '',
      appiumPort: result.appiumPort || '',
      startedAt: result.startedAt || '',
      finishedAt: result.finishedAt || '',
    })),
  };
  const file = path.join(outDir, '_report-meta.json');
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return file;
}

function generateReportAt({ outputRoot, outputRunId, sourceRunId, summary, reportType }) {
  const outDir = ensureDir(path.join(outputRoot, outputRunId));
  const testDocs = {};

  for (const result of summary.results) {
    testDocs[result.name] = writeTestDoc({ outDir, runId: sourceRunId, result });
  }

  const indexPath = writeIndex({ outDir, runId: sourceRunId, summary, testDocs });
  const htmlPath = writeHtmlReport({ outDir, runId: sourceRunId, summary, testDocs });
  const metaPath = writeReportMeta({ outDir, runId: sourceRunId, summary, reportType });
  return { outDir, indexPath, htmlPath, metaPath, testDocs };
}

function discoverReports(outputRoot) {
  if (!fs.existsSync(outputRoot)) return [];

  const reports = [];
  const stack = [outputRoot];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const metaPath = path.join(dir, '_report-meta.json');
    if (fs.existsSync(metaPath) && fs.existsSync(path.join(dir, 'index.html'))) {
      const meta = readJsonIfExists(metaPath) || {};
      reports.push({
        ...meta,
        dir,
        href: path.relative(outputRoot, path.join(dir, 'index.html')).replace(/\\/g, '/'),
      });
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'assets') {
        stack.push(path.join(dir, entry.name));
      }
    }
  }

  return reports.sort((a, b) => Date.parse(b.startedAt || b.updatedAt || 0) - Date.parse(a.startedAt || a.updatedAt || 0));
}

function reportArchiveCards(reports, linkPrefix = '') {
  if (!reports.length) {
    return '<p class="empty">No generated reports found yet. Run <code>npm run docs:scribe -- --run split3-combined</code>.</p>';
  }

  return reports
    .map(report => {
      const status = report.status || 'UNKNOWN';
      const typeLabel = report.reportType === 'archive' ? 'Archived run' : 'Latest report';
      return `
        <a class="run-card ${statusClass(status)}" href="${escapeHtml(linkPrefix + report.href)}">
          <div class="run-card-top">
            <span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>
            <span>${escapeHtml(typeLabel)}</span>
          </div>
          <h2>${escapeHtml(report.runId || 'Unknown run')}</h2>
          <p>${escapeHtml(formatDate(report.startedAt) || report.startedAt || 'No start time')}</p>
          <dl>
            <div><dt>Passed</dt><dd>${escapeHtml(report.passed ?? 0)}</dd></div>
            <div><dt>Failed</dt><dd>${escapeHtml(report.failed ?? 0)}</dd></div>
            <div><dt>Total</dt><dd>${escapeHtml(report.total ?? 0)}</dd></div>
          </dl>
        </a>`;
    })
    .join('\n');
}

function writeArchivePage({ file, reports, linkPrefix = '' }) {
  ensureDir(path.dirname(file));
  const latest = reports.filter(report => report.reportType !== 'archive').slice(0, 1);
  const archived = reports.filter(report => report.reportType === 'archive');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Apple Test Reports</title>
  <style>
    :root {
      --ink: #162033;
      --muted: #6c7789;
      --line: #dfe6ef;
      --paper: #f7f9fc;
      --panel: #ffffff;
      --pass: #0f9f6e;
      --fail: #d93f3f;
      --unknown: #7c8798;
      --navy: #090222;
      --blue: #0e61d8;
      --shadow: 0 18px 60px rgba(22, 32, 51, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(14, 97, 216, 0.16), transparent 32rem),
        linear-gradient(180deg, #eef4fb 0%, var(--paper) 24rem);
      font: 16px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .hero {
      padding: 3rem clamp(1rem, 4vw, 4rem) 4.5rem;
      color: white;
      background: linear-gradient(135deg, rgba(9, 2, 34, 0.96), rgba(13, 45, 88, 0.94));
    }
    .hero h1 {
      margin: 0 0 0.65rem;
      font-size: clamp(2.4rem, 5vw, 5rem);
      letter-spacing: -0.07em;
      line-height: 0.95;
    }
    .hero p { margin: 0; color: rgba(255, 255, 255, 0.74); max-width: 52rem; }
    main { padding: 0 clamp(1rem, 4vw, 4rem) 4rem; }
    .section {
      margin-top: 2rem;
    }
    .section:first-child {
      margin-top: -2.5rem;
    }
    .section-heading {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    h2 {
      margin: 0;
      font-size: clamp(1.4rem, 3vw, 2rem);
      letter-spacing: -0.04em;
    }
    .section-heading p { margin: 0; color: var(--muted); }
    .run-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      gap: 1rem;
    }
    .run-card {
      display: block;
      padding: 1.1rem;
      min-height: 13rem;
      color: inherit;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(223, 230, 239, 0.9);
      border-radius: 1.3rem;
      box-shadow: var(--shadow);
      transition: transform 160ms ease, border-color 160ms ease;
    }
    .run-card:hover {
      transform: translateY(-3px);
      border-color: rgba(14, 97, 216, 0.45);
    }
    .run-card.fail { border-color: rgba(217, 63, 63, 0.45); }
    .run-card-top {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      color: var(--muted);
      font-weight: 700;
    }
    .run-card h2 {
      margin-top: 1rem;
      overflow-wrap: anywhere;
    }
    .run-card p { color: var(--muted); }
    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.25rem 0.65rem;
      color: white;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .status-pill.pass { background: var(--pass); }
    .status-pill.fail { background: var(--fail); }
    .status-pill.unknown { background: var(--unknown); }
    dl {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.65rem;
      margin: 1rem 0 0;
    }
    dl div {
      border: 1px solid var(--line);
      border-radius: 0.8rem;
      padding: 0.65rem;
      background: #fbfdff;
    }
    dt { color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; }
    dd { margin: 0.15rem 0 0; font-size: 1.25rem; font-weight: 800; }
    .empty {
      padding: 1rem;
      border: 1px dashed var(--line);
      border-radius: 1rem;
      color: var(--muted);
      background: white;
    }
  </style>
</head>
<body>
  <header class="hero">
    <h1>Connect Apple Test Reports</h1>
    <p>Browse the latest generated Appium report, or jump back into older archived runs.</p>
  </header>
  <main>
    <section class="section">
      <div class="section-heading">
        <h2>Latest</h2>
        <p>Stable URL for the newest generated report</p>
      </div>
      <div class="run-grid">${reportArchiveCards(latest.length ? latest : reports.slice(0, 1), linkPrefix)}</div>
    </section>
    <section class="section">
      <div class="section-heading">
        <h2>History</h2>
        <p>${escapeHtml(archived.length)} archived run${archived.length === 1 ? '' : 's'}</p>
      </div>
      <div class="run-grid">${reportArchiveCards(archived, linkPrefix)}</div>
    </section>
  </main>
</body>
</html>
`;
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function writeRedirectPage({ file, targetHref }) {
  ensureDir(path.dirname(file));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(targetHref)}">
  <title>Connect Apple Test Report</title>
  <style>
    body {
      display: grid;
      min-height: 100vh;
      place-items: center;
      margin: 0;
      background: #f7f9fc;
      color: #162033;
      font: 16px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 42rem;
      padding: 2rem;
      text-align: center;
    }
    a {
      color: #0e61d8;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main>
    <h1>Connect Apple Test Report</h1>
    <p>Opening the latest generated report.</p>
    <p><a href="${escapeHtml(targetHref)}">Open the latest report</a></p>
  </main>
</body>
</html>
`;
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function writeArchivePages(outputRoot, reports = discoverReports(outputRoot)) {
  const isDefaultOutput = path.resolve(outputRoot) === path.resolve(DEFAULT_OUTPUT_ROOT);
  if (!isDefaultOutput) {
    const customIndex = path.join(outputRoot, 'index.html');
    const latest = reports.find(report => report.reportType !== 'archive') || reports[0];
    if (latest) {
      writeRedirectPage({
        file: customIndex,
        targetHref: latest.href,
      });
    } else {
      writeArchivePage({
        file: customIndex,
        reports,
        linkPrefix: '',
      });
    }
    return {
      repoRootIndex: customIndex,
      docsIndex: customIndex,
      scribeIndex: customIndex,
      reportCount: reports.length,
    };
  }

  const docsRoot = path.resolve(outputRoot, '..', '..');
  const repoRootIndex = path.join(REPO_ROOT, 'index.html');
  const docsIndex = path.join(docsRoot, 'index.html');
  const scribeIndex = path.join(outputRoot, 'index.html');
  const latest = reports.find(report => report.reportType !== 'archive') || reports[0];

  if (latest) {
    writeRedirectPage({
      file: repoRootIndex,
      targetHref: `docs/generated/scribe/${latest.href}`,
    });
    writeRedirectPage({
      file: docsIndex,
      targetHref: `generated/scribe/${latest.href}`,
    });
  } else {
    writeArchivePage({
      file: repoRootIndex,
      reports,
      linkPrefix: 'docs/generated/scribe/',
    });
    writeArchivePage({
      file: docsIndex,
      reports,
      linkPrefix: 'generated/scribe/',
    });
  }

  writeArchivePage({
    file: scribeIndex,
    reports,
    linkPrefix: '',
  });

  return { repoRootIndex, docsIndex, scribeIndex, reportCount: reports.length };
}

function generate() {
  const runId = argValue('run', process.env.SCRIBE_DOC_RUN_ID || 'split3-combined');
  const outputRoot = path.resolve(argValue('out', process.env.SCRIBE_DOC_OUTPUT_DIR || DEFAULT_OUTPUT_ROOT));
  const summary = withPreviewFailures(loadRunSummary(runId), previewFailureSpec());
  const archiveId = argValue('archive-id', process.env.SCRIBE_DOC_ARCHIVE_ID || archiveRunId(runId, summary));
  const latest = generateReportAt({
    outputRoot,
    outputRunId: runId,
    sourceRunId: runId,
    summary,
    reportType: 'latest',
  });
  const archive = generateReportAt({
    outputRoot,
    outputRunId: path.join('archive', archiveId),
    sourceRunId: runId,
    summary,
    reportType: 'archive',
  });
  const reports = discoverReports(outputRoot);
  writeHtmlReport({
    outDir: latest.outDir,
    runId,
    summary,
    testDocs: latest.testDocs,
    reportNav: buildReportNav(reports, latest.htmlPath),
    allReports: reports,
  });
  writeHtmlReport({
    outDir: archive.outDir,
    runId,
    summary,
    testDocs: archive.testDocs,
    reportNav: buildReportNav(reports, archive.htmlPath),
    allReports: reports,
  });
  const archivePages = writeArchivePages(outputRoot, reports);

  const indexPath = latest.indexPath;
  const htmlPath = latest.htmlPath;
  console.log(`Scribe-style Markdown written to ${indexPath}`);
  console.log(`Scribe-style web report written to ${htmlPath}`);
  console.log(`Archived copy written to ${archive.htmlPath}`);
  console.log(`Report archive page updated at ${archivePages.repoRootIndex} (${archivePages.reportCount} reports)`);
}

if (require.main === module) {
  try {
    generate();
  } catch (err) {
    console.error(err?.stack || err);
    process.exit(1);
  }
}

module.exports = { generate, loadRunSummary };
