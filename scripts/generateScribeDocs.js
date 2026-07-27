require('dotenv').config();

const fs = require('fs');
const path = require('path');

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

function slugify(value) {
  return String(value ?? 'test')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'test';
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

function writeTestDoc({ outDir, runId, result }) {
  const laneRunId = laneForResult(result, runId);
  const screenshots = listScreenshots(laneRunId, result.name, result);
  const screenshotAssets = screenshots.map(screenshot =>
    copyScreenshotAsset({ outDir, laneRunId, testName: result.name, screenshot })
  );
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
      lines.push(
        '',
        `### Step ${index + 1}: ${titleFromFileName(screenshot)}`,
        '',
        `![${titleFromFileName(screenshot)}](${relativeLink(file, screenshot)})`
      );
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

function writeHtmlReport({ outDir, runId, summary, testDocs }) {
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

  const testCards = results
    .map(result => {
      const laneRunId = laneForResult(result, runId);
      const screenshots = listScreenshots(laneRunId, result.name, result);
      const testId = slugify(result.name);
      return `
        <a class="test-card ${statusClass(result.status)}" href="#${testId}" data-test-card data-name="${escapeHtml(result.name.toLowerCase())}" data-status="${escapeHtml(result.status || 'UNKNOWN')}" data-lane="${escapeHtml(laneRunId)}">
          <div class="test-card-top">
            <span class="status-pill ${statusClass(result.status)}">${escapeHtml(result.status || 'UNKNOWN')}</span>
            <span class="duration">${escapeHtml(result.duration || '')}</span>
          </div>
          <h3>${escapeHtml(result.name)}</h3>
          <p>${escapeHtml(laneRunId)}${result.deviceName ? ` / ${escapeHtml(result.deviceName)}` : ''}</p>
          <div class="screenshot-count">${screenshots.length} screenshots</div>
        </a>`;
    })
    .join('\n');

  const testSections = results
    .map(result => {
      const laneRunId = laneForResult(result, runId);
      const screenshots = listScreenshots(laneRunId, result.name, result);
      const testId = slugify(result.name);
      const failure = result.error
        ? `<section class="failure-box"><h4>Failure</h4><pre>${escapeHtml(result.error)}</pre></section>`
        : '';
      const screenshotGrid = screenshots.length
        ? screenshots
            .map(screenshot =>
              copyScreenshotAsset({ outDir, laneRunId, testName: result.name, screenshot })
            )
            .map((screenshot, index) => {
              const title = titleFromFileName(screenshot);
              return `
                <figure class="step">
                  <a href="${escapeHtml(relativeLink(file, screenshot))}">
                    <img src="${escapeHtml(relativeLink(file, screenshot))}" alt="${escapeHtml(title)}" loading="lazy">
                  </a>
                  <figcaption><span>Step ${index + 1}</span>${escapeHtml(title)}</figcaption>
                </figure>`;
            })
            .join('\n')
        : '<p class="muted">No screenshots found for this test run.</p>';

      return `
        <section class="test-section" id="${testId}" data-test-section data-name="${escapeHtml(result.name.toLowerCase())}" data-status="${escapeHtml(result.status || 'UNKNOWN')}" data-lane="${escapeHtml(laneRunId)}">
          <div class="section-heading">
            <div>
              <span class="status-pill ${statusClass(result.status)}">${escapeHtml(result.status || 'UNKNOWN')}</span>
              <h2>${escapeHtml(result.name)}</h2>
            </div>
            <a class="markdown-link" href="${escapeHtml(relativeLink(file, testDocs[result.name]))}">Markdown guide</a>
          </div>
          <dl class="meta-grid">
            <div><dt>Duration</dt><dd>${escapeHtml(result.duration || '')}</dd></div>
            <div><dt>Lane</dt><dd>${escapeHtml(laneRunId)}</dd></div>
            <div><dt>Device</dt><dd>${escapeHtml(result.deviceName || '')}</dd></div>
            <div><dt>Appium port</dt><dd>${escapeHtml(result.appiumPort || '')}</dd></div>
            <div><dt>Started</dt><dd>${escapeHtml(formatDate(result.startedAt) || result.startedAt || '')}</dd></div>
            <div><dt>Finished</dt><dd>${escapeHtml(formatDate(result.finishedAt) || result.finishedAt || '')}</dd></div>
          </dl>
          ${failure}
          <div class="steps-grid">${screenshotGrid}</div>
        </section>`;
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
    .toolbar {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) 12rem 14rem;
      gap: 0.75rem;
      margin: 1.5rem 0;
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
    .duration, .muted, .test-card p, .screenshot-count { color: var(--muted); }
    .test-card h3 { margin: 1.1rem 0 0.35rem; font-size: 1.35rem; line-height: 1.1; }
    .screenshot-count { margin-top: 1rem; font-size: 0.9rem; }
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
      padding: clamp(1rem, 3vw, 1.6rem);
      margin-top: 1.5rem;
    }
    .section-heading {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .section-heading h2 { margin: 0.5rem 0 0; font-size: clamp(1.7rem, 3vw, 2.6rem); letter-spacing: -0.04em; }
    .markdown-link {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 0.55rem 0.8rem;
      background: #edf4ff;
      color: var(--blue);
      font-weight: 700;
      text-decoration: none;
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
    [hidden] { display: none !important; }
    @media (max-width: 780px) {
      .stats, .toolbar { grid-template-columns: 1fr; }
      .hero { padding-top: 2rem; }
      .section-heading { display: block; }
      .markdown-link { display: inline-block; margin-top: 1rem; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <h1>Test Run Report</h1>
    <p>Scribe-style browser report generated from Appium screenshots and runner results.</p>
    <div class="hero-meta">
      <span>Run: ${escapeHtml(runId)}</span>
      <span>Source: ${escapeHtml(summary.source)}</span>
      <span>Started: ${escapeHtml(started || summary.startedAt || '')}</span>
      <span>Updated: ${escapeHtml(updated || summary.updatedAt || '')}</span>
    </div>
  </header>

  <main>
    <section class="stats" aria-label="Run summary">
      <div class="stat"><span>Status</span><strong>${escapeHtml(status)}</strong></div>
      <div class="stat"><span>Passed</span><strong>${escapeHtml(passed)}</strong></div>
      <div class="stat"><span>Failed</span><strong>${escapeHtml(failed)}</strong></div>
      <div class="stat"><span>Total</span><strong>${escapeHtml(total)}</strong></div>
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
    const cards = [...document.querySelectorAll('[data-test-card]')];
    const sections = [...document.querySelectorAll('[data-test-section]')];

    function shouldShow(element) {
      const term = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const lane = laneFilter.value;
      return (!term || element.dataset.name.includes(term)) &&
        (!status || element.dataset.status === status) &&
        (!lane || element.dataset.lane === lane);
    }

    function applyFilters() {
      cards.forEach(card => { card.hidden = !shouldShow(card); });
      sections.forEach(section => { section.hidden = !shouldShow(section); });
    }

    [search, statusFilter, laneFilter].forEach(input => input.addEventListener('input', applyFilters));
  </script>
</body>
</html>
`;

  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function generate() {
  const runId = argValue('run', process.env.SCRIBE_DOC_RUN_ID || 'split3-combined');
  const outputRoot = path.resolve(argValue('out', process.env.SCRIBE_DOC_OUTPUT_DIR || DEFAULT_OUTPUT_ROOT));
  const summary = loadRunSummary(runId);
  const outDir = ensureDir(path.join(outputRoot, runId));
  const testDocs = {};

  for (const result of summary.results) {
    testDocs[result.name] = writeTestDoc({ outDir, runId, result });
  }

  const indexPath = writeIndex({ outDir, runId, summary, testDocs });
  const htmlPath = writeHtmlReport({ outDir, runId, summary, testDocs });
  console.log(`Scribe-style Markdown written to ${indexPath}`);
  console.log(`Scribe-style web report written to ${htmlPath}`);
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
