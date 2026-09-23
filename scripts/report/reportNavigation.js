const path = require('path');
const { formatDate } = require('./reportAnalysis');
const { readTextIfExists, writeGeneratedFile } = require('./reportFiles');
const { escapeHtml, relativeLink } = require('./reportUtils');

function statusClass(status) {
  return String(status || 'UNKNOWN').toLowerCase();
}

function reportIdentity(report) {
  return `${report.runId || ''}|${report.startedAt || ''}`;
}

function reportFile(report) {
  return path.join(report.dir, 'index.html');
}

function immutableReportFor(report, reports) {
  if (report.reportType === 'archive') return report;
  return reports.find(candidate => candidate.reportType === 'archive' && reportIdentity(candidate) === reportIdentity(report)) || report;
}

function displayRunName(runId) {
  const names = {
    'split3-combined': 'Full Suite',
  };
  return names[runId] || runId || 'Unknown run';
}

function reportSwitcherStyles() {
  return `
    .report-switcher { position: relative; border: 1px solid rgba(255,255,255,.18); border-radius: 1rem; background: rgba(255,255,255,.08); color: white; box-shadow: 0 16px 36px rgba(0,0,0,.14); }
    .report-switcher summary { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: .75rem; align-items: center; padding: .85rem 1rem; cursor: pointer; list-style: none; }
    .report-switcher summary::-webkit-details-marker { display: none; }
    .report-switcher .report-switcher-copy, .report-switcher .report-run-copy { display: grid; min-width: 0; gap: .1rem; }
    .report-switcher .report-switcher-copy strong, .report-switcher .report-run-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .report-switcher .report-switcher-eyebrow, .report-switcher .report-menu-heading { font-size: .76rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
    .report-switcher .report-switcher-copy small { color: rgba(255,255,255,.7); font-size: .78rem; font-weight: 700; }
    .report-switcher .report-switcher-toggle { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; border-radius: 999px; background: rgba(255,255,255,.14); font-weight: 900; transition: transform 150ms ease; }
    .report-switcher[open] .report-switcher-toggle { transform: rotate(180deg); }
    .report-switcher .report-menu { position: absolute; z-index: 20; top: calc(100% + .65rem); right: 0; width: min(28rem, calc(100vw - 2rem)); padding: .85rem; border: 1px solid rgba(215,226,241,.95); border-radius: 1rem; background: rgba(255,255,255,.98); color: #17233a; box-shadow: 0 24px 60px rgba(8,22,47,.25); backdrop-filter: blur(16px); }
    .report-switcher .report-menu-heading { display: flex; justify-content: space-between; align-items: center; margin: .15rem 0 .45rem; color: #6b7a90; }
    .report-switcher .report-menu-heading span { border-radius: 999px; padding: .1rem .45rem; background: #edf3fb; color: #0e61d8; font-size: .72rem; }
    .report-switcher .viewing-heading { margin-top: .85rem; }
    .report-switcher .archived-heading { margin-top: .95rem; }
    .report-switcher .report-latest, .report-switcher .report-run { display: flex; justify-content: space-between; gap: .75rem; align-items: center; padding: .7rem .75rem; border: 1px solid #dce5ef; border-radius: .8rem; color: #17233a; text-decoration: none; transition: border-color 150ms ease, background 150ms ease, transform 150ms ease; }
    .report-switcher .report-latest { border-color: rgba(40,109,222,.5); background: linear-gradient(135deg,#e8f1ff,#f6faff); }
    .report-switcher .report-run-list { display: grid; gap: .4rem; max-height: min(23rem,52vh); overflow: auto; padding-right: .15rem; }
    .report-switcher .report-run { border-radius: .7rem; }
    .report-switcher .report-latest:hover, .report-switcher .report-run:hover { border-color: rgba(14,97,216,.55); background: #f3f8ff; transform: translateX(-2px); }
    .report-switcher .report-latest.is-viewing, .report-switcher .report-run.is-viewing { border-color: rgba(14,97,216,.75); box-shadow: inset 3px 0 0 #0e61d8; }
    .report-switcher .report-run-copy { flex: 1; }
    .report-switcher .report-run-copy small { color: #6b7a90; font-size: .78rem; font-weight: 700; }
    .report-switcher .status-pill { flex: 0 0 auto; }
    .report-switcher .report-menu-empty { margin: 0; padding: .75rem; color: #6b7a90; font-weight: 700; }
    @media (max-width: 780px) { .report-switcher .report-menu { right: auto; left: 0; } }
  `;
}

function buildReportNav(reports, currentFile) {
  const current = path.resolve(currentFile);
  const currentReport = reports.find(report => path.resolve(reportFile(report)) === current);
  const latestReport = reports.find(report => report.reportType !== 'archive') || currentReport || reports[0];
  const seenFiles = new Set();
  const navigation = [];

  function addReport(report, { selected = false, latest = false } = {}) {
    if (!report) return;
    const targetFile = reportFile(report);
    const targetPath = path.resolve(targetFile);
    if (seenFiles.has(targetPath)) return;
    seenFiles.add(targetPath);

    navigation.push({
      href: relativeLink(currentFile, targetFile),
      runId: displayRunName(report.runId),
      date: formatDate(report.startedAt) || report.startedAt || 'No start time',
      status: report.status || 'UNKNOWN',
      selected,
      latest,
    });
  }

  addReport(latestReport, {
    latest: true,
    selected: path.resolve(reportFile(latestReport)) === current,
  });
  addReport(currentReport, { selected: true });

  for (const report of reports) {
    const isCurrent = path.resolve(reportFile(report)) === current;
    addReport(isCurrent ? report : immutableReportFor(report, reports), { selected: isCurrent });
  }

  return navigation;
}

function reportSwitcherMarkup(reportNav) {
  if (!reportNav.length) return '';
  const latest = reportNav.find(report => report.latest) || reportNav[0];
  const selected = reportNav.find(report => report.selected) || latest;
  const archived = reportNav.filter(report => !report.latest && !report.selected);

  function reportLink(report, className = 'report-run') {
    return `<a class="${className}${report.selected ? ' is-viewing' : ''}" href="${escapeHtml(report.href)}">
              <span class="report-run-copy">
                <strong>${escapeHtml(report.runId)}</strong>
                <small>${escapeHtml(report.date)}</small>
              </span>
              <span class="status-pill ${statusClass(report.status)}">${escapeHtml(report.status)}</span>
            </a>`;
  }

  return `
      <style id="report-switcher-styles">${reportSwitcherStyles()}</style>
      <details class="report-switcher">
        <summary aria-label="Browse test report history">
          <span class="report-switcher-copy">
            <span class="report-switcher-eyebrow">Viewing now</span>
            <strong>${escapeHtml(selected.runId)}</strong>
            <small>${escapeHtml(selected.date)}</small>
          </span>
          <span class="status-pill ${statusClass(selected.status)}">${escapeHtml(selected.status)}</span>
          <span class="report-switcher-toggle" aria-hidden="true">v</span>
        </summary>
        <div class="report-menu">
          <div class="report-menu-heading">Latest report</div>
          ${reportLink(latest, 'report-latest')}
          ${!latest.selected ? `<div class="report-menu-heading viewing-heading">Viewing</div>${reportLink(selected)}` : ''}
          <div class="report-menu-heading archived-heading">Saved runs <span>${archived.length}</span></div>
          <div class="report-run-list">
            ${archived.map(report => reportLink(report)).join('\n') || '<p class="report-menu-empty">No older saved runs yet.</p>'}
          </div>
        </div>
      </details>`;
}

function refreshReportNavigation(reports) {
  for (const report of reports) {
    if (report.reportType === 'archive') continue;
    const file = reportFile(report);
    const html = readTextIfExists(file);
    if (!html) continue;

    const reportSwitcher = reportSwitcherMarkup(buildReportNav(reports, file));
    const updated = html.replace(
      /(?:<style id="report-switcher-styles">[\s\S]*?<\/style>\s*)?(?:<label class="report-switcher">[\s\S]*?<\/label>|<details class="report-switcher">[\s\S]*?<\/details>)/,
      reportSwitcher.trim()
    );
    if (updated !== html) writeGeneratedFile(file, updated);
  }
}

module.exports = {
  buildReportNav,
  displayRunName,
  immutableReportFor,
  refreshReportNavigation,
  reportFile,
  reportIdentity,
  reportSwitcherMarkup,
  reportSwitcherStyles,
  statusClass,
};
