const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  return REPORTS_DIR;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${totalSec}s`;
}

function buildMarkdown(results, startedAt, meta = {}) {
  const { suiteDurationMs, loginSetupMs } = meta;
  const total = results.length;
  const passed = results.filter(result => result.status === 'PASS').length;
  const failed = results.filter(result => result.status === 'FAIL').length;
  const running = results.filter(result => result.status === 'RUNNING').length;
  const showDurationCol = results.some(result => result.durationMs != null);

  const lines = [
    '# iOS Automation Suite Report',
    '',
    `- Started: ${startedAt.toISOString()}`,
    `- Last Updated: ${new Date().toISOString()}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    `- Running: ${running}`,
  ];

  if (loginSetupMs != null) {
    lines.push(`- Login + driver setup: ${formatDurationMs(loginSetupMs)}`);
  }
  if (suiteDurationMs != null) {
    lines.push(`- **Total suite duration:** ${formatDurationMs(suiteDurationMs)}`);
  }

  lines.push(
    '',
    showDurationCol
      ? '| Test | Coverage Area | Status | Duration | Notes |'
      : '| Test | Coverage Area | Status | Notes |',
    showDurationCol
      ? '| --- | --- | --- | --- | --- |'
      : '| --- | --- | --- | --- |'
  );

  for (const result of results) {
    const dur = showDurationCol ? escapeCell(formatDurationMs(result.durationMs)) : null;
    if (showDurationCol) {
      lines.push(
        `| ${escapeCell(result.name)} | ${escapeCell(result.area)} | ${escapeCell(result.status)} | ${dur} | ${escapeCell(result.notes)} |`
      );
    } else {
      lines.push(
        `| ${escapeCell(result.name)} | ${escapeCell(result.area)} | ${escapeCell(result.status)} | ${escapeCell(result.notes)} |`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function createReportWriter(fileName = 'latest-suite-report.md') {
  const reportPath = path.join(ensureReportsDir(), fileName);
  const startedAt = new Date();

  function write(results, meta = {}) {
    fs.writeFileSync(reportPath, buildMarkdown(results, startedAt, meta), 'utf8');
  }

  return {
    reportPath,
    write,
  };
}

module.exports = {
  createReportWriter,
  formatDurationMs,
};
