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

function buildMarkdown(results, startedAt) {
  const total = results.length;
  const passed = results.filter(result => result.status === 'PASS').length;
  const failed = results.filter(result => result.status === 'FAIL').length;
  const running = results.filter(result => result.status === 'RUNNING').length;

  const lines = [
    '# iOS Automation Suite Report',
    '',
    `- Started: ${startedAt.toISOString()}`,
    `- Last Updated: ${new Date().toISOString()}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    `- Running: ${running}`,
    '',
    '| Test | Coverage Area | Status | Notes |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${escapeCell(result.name)} | ${escapeCell(result.area)} | ${escapeCell(result.status)} | ${escapeCell(result.notes)} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

function createReportWriter(fileName = 'latest-suite-report.md') {
  const reportPath = path.join(ensureReportsDir(), fileName);
  const startedAt = new Date();

  function write(results) {
    fs.writeFileSync(reportPath, buildMarkdown(results, startedAt), 'utf8');
  }

  return {
    reportPath,
    write,
  };
}

module.exports = {
  createReportWriter,
};
