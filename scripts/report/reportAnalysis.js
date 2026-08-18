const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readTextIfExists } = require('./reportFiles');

const REPO_ROOT = path.resolve(__dirname, '../..');

function laneForResult(result, fallbackRunId) {
  return result.laneRunId || result.laneLabel || fallbackRunId;
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
  if (!result?.logPath) return '';
  const text = readTextIfExists(result.logPath);
  if (!text) return '';
  const lines = text
    .split(/\r?\n/)
    .filter(line => /error|fail|exception|stack|no such element|timeout/i.test(line));
  return (lines.length ? lines : text.split(/\r?\n/).slice(-maxLines)).slice(-maxLines).join('\n');
}

function failureSnippet(result) {
  if (result?.status !== 'FAIL') return '';
  return result.error || readLogSnippet(result) || '';
}

function failureCategory(result) {
  if (result?.status !== 'FAIL') return '';
  const text = `${result?.name || ''}\n${failureSnippet(result)}`.toLowerCase();
  if (/login|auth|credential|nitro|server.*log/i.test(text)) return 'Login';
  if (/permission|allow|privacy|photo library|notification/i.test(text)) return 'Permission';
  if (/no such element|could not.*locate|selector|accessibility|stale element|not displayed/i.test(text)) return 'Selector';
  if (/timeout|timed out|waitfor|still not displayed/i.test(text)) return 'Timeout';
  if (/crash|terminated|springboard|not running|session deleted/i.test(text)) return 'App crash';
  if (/network|internet|connection|offline|lost connection/i.test(text)) return 'Network';
  if (/assert|expected|actual|mismatch|verify/i.test(text)) return 'Assertion';
  return 'Unknown';
}

function uniqueReportRuns(reports = []) {
  const seen = new Set();
  return reports
    .slice()
    .sort((a, b) => Date.parse(b.startedAt || b.updatedAt || 0) - Date.parse(a.startedAt || a.updatedAt || 0))
    .filter(report => {
      const key = [report.runId || '', report.startedAt || '', report.passed ?? '', report.failed ?? '', report.total ?? ''].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findPreviousComparableReport(reports, summary) {
  return uniqueReportRuns(reports).find(report => {
    if ((report.startedAt || '') === (summary.startedAt || '')) return false;
    return Array.isArray(report.results) && report.results.length > 0;
  });
}

function buildRunComparison(results, previousReport) {
  if (!previousReport) {
    return { hasPrevious: false, newlyFailed: [], newlyFixed: [], slower: [], faster: [] };
  }

  const previousByName = new Map((previousReport.results || []).map(result => [result.name, result]));
  const newlyFailed = [];
  const newlyFixed = [];
  const slower = [];
  const faster = [];

  for (const result of results) {
    const previous = previousByName.get(result.name);
    if (!previous) continue;
    if (previous.status !== 'FAIL' && result.status === 'FAIL') newlyFailed.push(result);
    if (previous.status === 'FAIL' && result.status === 'PASS') newlyFixed.push(result);

    const diffMs = resultDurationMs(result) - resultDurationMs(previous);
    if (Math.abs(diffMs) >= 5000) {
      const item = { result, previous, diffMs };
      if (diffMs > 0) slower.push(item);
      if (diffMs < 0) faster.push(item);
    }
  }

  slower.sort((a, b) => b.diffMs - a.diffMs);
  faster.sort((a, b) => a.diffMs - b.diffMs);
  return {
    hasPrevious: true,
    previousLabel: formatDate(previousReport.startedAt) || previousReport.runId || 'previous run',
    newlyFailed,
    newlyFixed,
    slower,
    faster,
  };
}

function commandValue(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function buildEnvironmentSummary(summary, results) {
  const devices = [...new Set(results.map(result => result.deviceName).filter(Boolean))];
  const appiumPorts = [...new Set(results.map(result => result.appiumPort).filter(Boolean))];
  const wdaPorts = [...new Set(results.map(result => result.wdaLocalPort).filter(Boolean))];
  const appPath = process.env.CONNECT_APP_PATH || '';
  const infoPlist = appPath ? path.join(appPath, 'Info.plist') : '';
  const plistValue = key =>
    infoPlist && fs.existsSync(infoPlist) ? commandValue('plutil', ['-extract', key, 'raw', infoPlist]) : '';
  const automationBranch = commandValue('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT });
  const automationCommit = commandValue('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT });
  const appBranch = process.env.TEST_REPORT_BRANCH || process.env.APP_BRANCH || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
  const appCommit = process.env.TEST_REPORT_COMMIT || process.env.APP_COMMIT || (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : '');

  return {
    branch: appBranch || automationBranch,
    commit: appCommit || automationCommit,
    automationBranch,
    automationCommit,
    appBranch,
    appCommit,
    node: process.version,
    bundleId: process.env.CONNECT_BUNDLE_ID || '',
    appVersion: process.env.CONNECT_APP_VERSION || plistValue('CFBundleShortVersionString'),
    appBuild: process.env.CONNECT_APP_BUILD || plistValue('CFBundleVersion'),
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
      lanes.set(lane, { lane, deviceName: result.deviceName || '', appiumPort: result.appiumPort || '', passed: 0, failed: 0, total: 0, durationMs: 0 });
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
  return { passed, failed, total: counts.total ?? results.length };
}

module.exports = {
  buildEnvironmentSummary,
  buildLaneStats,
  buildRunComparison,
  countsForSummary,
  failureCategory,
  failureSnippet,
  findPreviousComparableReport,
  formatDate,
  formatDurationMs,
  laneForResult,
  rerunCommandForResult,
  resultDurationMs,
  uniqueReportRuns,
};
