const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readTextIfExists } = require('./reportFiles');

const REPO_ROOT = path.resolve(__dirname, '../..');
const RESULT_STATUSES = ['PASS', 'FAIL', 'SKIPPED', 'BLOCKED', 'INCONCLUSIVE'];
const DEFAULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONNECT_BUNDLE_ID = 'com.powerhrg.connect.v3.debug';
const appDiscoveryCache = new Map();

function normalizeStatus(value) {
  const status = String(value || 'UNKNOWN').trim().toUpperCase();
  return RESULT_STATUSES.includes(status) ? status : 'UNKNOWN';
}

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

function firstValue(values) {
  return values.find(value => String(value || '').trim()) || '';
}

function discoverInstalledApp(summary, results, options = {}) {
  const runCommand = options.runCommand || commandValue;
  const reportedEnvironment =
    summary.environment && typeof summary.environment === 'object' ? summary.environment : {};
  const reportedApp = summary.app && typeof summary.app === 'object' ? summary.app : {};
  const bundleCandidates = [
    process.env.CONNECT_BUNDLE_ID,
    reportedEnvironment.bundleId,
    reportedApp.bundleId,
    ...results.map(result => result.bundleId),
    DEFAULT_CONNECT_BUNDLE_ID,
  ].filter(Boolean);
  const udids = [...new Set(results.map(result => result.udid).filter(Boolean))];
  const explicitPath = firstValue([
    process.env.CONNECT_APP_PATH,
    reportedEnvironment.appPath,
    reportedApp.path,
    ...results.map(result => result.appPath),
  ]);
  const cacheKey = JSON.stringify({ explicitPath, bundleCandidates, udids });

  if (!options.runCommand && appDiscoveryCache.has(cacheKey)) {
    return appDiscoveryCache.get(cacheKey);
  }

  let appPath = explicitPath;
  let bundleId = firstValue(bundleCandidates);
  if (!appPath) {
    outer: for (const udid of udids) {
      for (const candidate of bundleCandidates) {
        const discoveredPath = runCommand('xcrun', [
          'simctl',
          'get_app_container',
          udid,
          candidate,
          'app',
        ]);
        if (discoveredPath) {
          appPath = discoveredPath;
          bundleId = candidate;
          break outer;
        }
      }
    }
  }

  const infoPlist = appPath ? path.join(appPath, 'Info.plist') : '';
  const plistValue = key =>
    infoPlist && fs.existsSync(infoPlist)
      ? runCommand('plutil', ['-extract', key, 'raw', infoPlist])
      : '';
  const discovered = {
    appPath,
    bundleId: plistValue('CFBundleIdentifier') || bundleId,
    appVersion: plistValue('CFBundleShortVersionString'),
    appBuild: plistValue('CFBundleVersion'),
  };
  if (!options.runCommand) appDiscoveryCache.set(cacheKey, discovered);
  return discovered;
}

function discoverAppSourceIdentity(summary, options = {}) {
  const runCommand = options.runCommand || commandValue;
  const reportedEnvironment =
    summary.environment && typeof summary.environment === 'object' ? summary.environment : {};
  const reportedApp = summary.app && typeof summary.app === 'object' ? summary.app : {};
  const sourcePath = path.resolve(
    firstValue([
      process.env.CONNECT_APP_SOURCE,
      reportedEnvironment.appSource,
      reportedApp.sourcePath,
      path.resolve(REPO_ROOT, '../connect-apple'),
    ])
  );
  if (!fs.existsSync(sourcePath)) return { sourcePath: '', branch: '', commit: '' };

  const branch = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: sourcePath });
  const commit = runCommand('git', ['rev-parse', '--short', 'HEAD'], { cwd: sourcePath });
  return {
    sourcePath,
    branch: branch === 'HEAD' ? '' : branch,
    commit,
  };
}

function buildEnvironmentSummary(summary, results, options = {}) {
  const devices = [...new Set(results.map(result => result.deviceName).filter(Boolean))];
  const appiumPorts = [...new Set(results.map(result => result.appiumPort).filter(Boolean))];
  const wdaPorts = [...new Set(results.map(result => result.wdaLocalPort).filter(Boolean))];
  const reportedEnvironment =
    summary.environment && typeof summary.environment === 'object' ? summary.environment : {};
  const reportedApp = summary.app && typeof summary.app === 'object' ? summary.app : {};
  const reportedAutomation =
    summary.automation && typeof summary.automation === 'object' ? summary.automation : {};
  const automationBranch =
    reportedEnvironment.automationBranch ||
    reportedAutomation.branch ||
    process.env.AUTOMATION_BRANCH ||
    commandValue('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT });
  const automationCommit =
    reportedEnvironment.automationCommit ||
    reportedAutomation.commit ||
    process.env.AUTOMATION_COMMIT ||
    commandValue('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT });
  const appSource = discoverAppSourceIdentity(summary, options);
  const appBranch =
    process.env.TEST_REPORT_BRANCH ||
    process.env.APP_BRANCH ||
    reportedEnvironment.appBranch ||
    reportedApp.branch ||
    summary.appBranch ||
    appSource.branch;
  const appCommit =
    process.env.TEST_REPORT_COMMIT ||
    process.env.APP_COMMIT ||
    reportedEnvironment.appCommit ||
    reportedApp.commit ||
    summary.appCommit ||
    appSource.commit;
  const installedApp = discoverInstalledApp(summary, results, options);

  return {
    // Keep these aliases app-only for older renderers. Automation identity must
    // never be presented as the identity of the app under test.
    branch: appBranch,
    commit: appCommit,
    automationBranch,
    automationCommit,
    appBranch,
    appCommit,
    node: process.version,
    bundleId:
      process.env.CONNECT_BUNDLE_ID ||
      reportedEnvironment.bundleId ||
      reportedApp.bundleId ||
      installedApp.bundleId ||
      '',
    appVersion:
      process.env.CONNECT_APP_VERSION ||
      reportedEnvironment.appVersion ||
      reportedApp.version ||
      installedApp.appVersion,
    appBuild:
      process.env.CONNECT_APP_BUILD ||
      reportedEnvironment.appBuild ||
      reportedApp.build ||
      installedApp.appBuild,
    appInstalled: Boolean(installedApp.appPath),
    serverEnvironment:
      process.env.TEST_REPORT_ENVIRONMENT ||
      process.env.CONNECT_SERVER_NAME ||
      process.env.CONNECT_ENVIRONMENT ||
      reportedEnvironment.serverEnvironment ||
      reportedEnvironment.name ||
      reportedApp.environment ||
      (typeof summary.environment === 'string' ? summary.environment : '') ||
      '',
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
        skipped: 0,
        blocked: 0,
        inconclusive: 0,
        total: 0,
        durationMs: 0,
      });
    }
    const stats = lanes.get(lane);
    stats.deviceName ||= result.deviceName || '';
    stats.appiumPort ||= result.appiumPort || '';
    stats.total += 1;
    stats.durationMs += resultDurationMs(result);
    const status = normalizeStatus(result.status);
    if (status === 'PASS') stats.passed += 1;
    if (status === 'FAIL') stats.failed += 1;
    if (status === 'SKIPPED') stats.skipped += 1;
    if (status === 'BLOCKED') stats.blocked += 1;
    if (status === 'INCONCLUSIVE') stats.inconclusive += 1;
  }
  return [...lanes.values()];
}

function countsForSummary(summary) {
  const results = summary.results || [];
  const counts = summary.counts || {};
  const derived = results.reduce(
    (totals, result) => {
      const key = {
        PASS: 'passed',
        FAIL: 'failed',
        SKIPPED: 'skipped',
        BLOCKED: 'blocked',
        INCONCLUSIVE: 'inconclusive',
        UNKNOWN: 'unknown',
      }[normalizeStatus(result.status)];
      totals[key] += 1;
      return totals;
    },
    { passed: 0, failed: 0, skipped: 0, blocked: 0, inconclusive: 0, unknown: 0 }
  );
  const normalized = {
    passed: counts.passed ?? derived.passed,
    failed: counts.failed ?? derived.failed,
    skipped: counts.skipped ?? derived.skipped,
    blocked: counts.blocked ?? derived.blocked,
    inconclusive: counts.inconclusive ?? derived.inconclusive,
    unknown: counts.unknown ?? derived.unknown,
    total: counts.total ?? results.length,
  };
  return normalized;
}

function statusForSummary(summary) {
  const counts = countsForSummary(summary);
  if (counts.failed) return 'FAIL';
  if (counts.blocked) return 'BLOCKED';
  if (counts.inconclusive) return 'INCONCLUSIVE';
  if (counts.unknown) return 'INCONCLUSIVE';
  if (counts.passed && counts.passed + counts.skipped === counts.total) return 'PASS';
  if (counts.skipped && counts.skipped === counts.total) return 'SKIPPED';
  return normalizeStatus(summary.status);
}

function coverageItems(summary) {
  if (Array.isArray(summary.coverage)) return summary.coverage;
  if (Array.isArray(summary.coverage?.features)) return summary.coverage.features;
  if (Array.isArray(summary.registry)) return summary.registry;
  if (Array.isArray(summary.registry?.tests)) return summary.registry.tests;
  if (Array.isArray(summary.testRegistry)) return summary.testRegistry;
  return [];
}

function normalizedEnvironment(value) {
  const environment = String(value || '').trim().toUpperCase();
  if (!environment) return 'UNSPECIFIED';
  if (environment.includes('QA')) return 'QA';
  if (environment.includes('LOCAL')) return 'LOCAL';
  if (environment.includes('STAG')) return 'STAGING';
  if (environment.includes('PROD')) return 'PRODUCTION';
  return environment;
}

function environmentForSummary(summary) {
  const reportedEnvironment =
    summary.environment && typeof summary.environment === 'object' ? summary.environment : {};
  return normalizedEnvironment(
    process.env.TEST_REPORT_ENVIRONMENT ||
      process.env.CONNECT_SERVER_NAME ||
      process.env.CONNECT_ENVIRONMENT ||
      reportedEnvironment.serverEnvironment ||
      reportedEnvironment.name ||
      (typeof summary.environment === 'string' ? summary.environment : '')
  );
}

function itemSupportsEnvironment(item, environment) {
  if (typeof item.eligible === 'boolean') return item.eligible;
  const environments = Array.isArray(item.environments)
    ? item.environments.map(normalizedEnvironment)
    : ['ANY'];
  return environments.includes('ANY') || environments.includes(environment);
}

function coverageForSummary(summary, options = {}) {
  const results = summary.results || [];
  const resultsByName = new Map(results.map(result => [result.name, normalizeStatus(result.status)]));
  const items = coverageItems(summary);
  const directRequired = summary.coverage?.required || summary.requiredSuite || {};
  const rowsByFeature = new Map();
  const environment = normalizedEnvironment(options.environment || environmentForSummary(summary));

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (!itemSupportsEnvironment(item, environment)) continue;
    const feature = item.feature || item.logicalFeature || item.category || item.name || 'Uncategorized';
    const testNames = Array.isArray(item.tests)
      ? item.tests.map(test => (typeof test === 'string' ? test : test?.name)).filter(Boolean)
      : item.testName || item.entryPoint
        ? [item.testName || item.name || item.entryPoint]
        : item.feature || item.logicalFeature
          ? [item.name].filter(Boolean)
          : [];
    const classification = String(
      item.classification || item.coverage || item.tier || (item.required === false || item.optIn ? 'opt-in' : 'required')
    ).toLowerCase();
    const required = item.required === true || classification === 'required';
    const rowKey = `${feature}\u0000${classification}`;
    const row = rowsByFeature.get(rowKey) || {
      feature,
      classification,
      required,
      total: 0,
      scheduled: 0,
      completed: 0,
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      inconclusive: 0,
    };
    row.required ||= required;
    if (row.classification !== 'required' && required) row.classification = 'required';

    for (const testName of testNames) {
      row.total += 1;
      const status = resultsByName.get(testName);
      const scheduled = item.scheduled === true || Boolean(status);
      if (scheduled) row.scheduled += 1;
      if (!status) continue;
      if (!['SKIPPED', 'BLOCKED', 'UNKNOWN'].includes(status)) {
        row.completed += 1;
        row.executed += 1;
      }
      const statusKey = status.toLowerCase();
      if (Object.hasOwn(row, statusKey)) row[statusKey] += 1;
    }
    rowsByFeature.set(rowKey, row);
  }

  const rows = [...rowsByFeature.values()];
  const requiredRows = rows.filter(row => row.required);
  const requiredTotal = Number.isFinite(Number(directRequired.total))
    ? Number(directRequired.total)
    : requiredRows.reduce((sum, row) => sum + row.total, 0);
  const requiredScheduled = Number.isFinite(Number(directRequired.scheduled))
    ? Number(directRequired.scheduled)
    : requiredRows.reduce((sum, row) => sum + row.scheduled, 0);
  const requiredCompleted = Number.isFinite(Number(directRequired.completed))
    ? Number(directRequired.completed)
    : Number.isFinite(Number(directRequired.executed))
      ? Number(directRequired.executed)
      : requiredRows.reduce((sum, row) => sum + row.completed, 0);
  const available = items.length > 0 || Object.keys(directRequired).length > 0;

  return {
    available,
    environment,
    rows,
    requiredTotal,
    requiredScheduled,
    requiredCompleted,
    requiredExecuted: requiredCompleted,
    complete:
      available &&
      requiredTotal > 0 &&
      requiredScheduled === requiredTotal &&
      requiredCompleted === requiredTotal,
  };
}

function buildEvidenceDecision(summary, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const freshnessMs = Number.isFinite(options.freshnessMs)
    ? options.freshnessMs
    : DEFAULT_FRESHNESS_MS;
  const timestamp = Date.parse(summary.updatedAt || summary.finishedAt || summary.startedAt || '');
  const ageMs = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
  const fresh = ageMs !== null && ageMs <= freshnessMs;
  const counts = countsForSummary(summary);
  const environment = options.environment || buildEnvironmentSummary(summary, summary.results || []);
  const coverage = coverageForSummary(summary, { environment: environment.serverEnvironment });
  const missingAppIdentity = [
    ['bundle ID', environment.bundleId],
    ['version', environment.appVersion],
    ['build', environment.appBuild],
    ['branch', environment.appBranch],
    ['commit', environment.appCommit],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);
  const serverEnvironmentKnown = !['', 'UNSPECIFIED'].includes(
    normalizedEnvironment(environment.serverEnvironment)
  );
  const reasons = [];
  let decision = 'READY';

  if (counts.failed || counts.blocked) {
    decision = 'NOT_READY';
    if (counts.failed) reasons.push(`${counts.failed} failed`);
    if (counts.blocked) reasons.push(`${counts.blocked} blocked`);
  } else if (counts.inconclusive || counts.unknown) {
    decision = 'INCONCLUSIVE';
    if (counts.inconclusive) reasons.push(`${counts.inconclusive} inconclusive`);
    if (counts.unknown) reasons.push(`${counts.unknown} unknown`);
  } else if (!fresh) {
    decision = 'STALE';
    reasons.push(ageMs === null ? 'Report timestamp unavailable' : 'Report exceeds freshness window');
  } else if (missingAppIdentity.length || !serverEnvironmentKnown || !coverage.complete) {
    decision = 'INCOMPLETE';
    if (missingAppIdentity.length) reasons.push(`App ${missingAppIdentity.join(', ')} unavailable`);
    if (!serverEnvironmentKnown) reasons.push('Server environment unavailable');
    if (!coverage.complete) {
      reasons.push(
        coverage.available
          ? `${coverage.requiredScheduled}/${coverage.requiredTotal} required scheduled; ${coverage.requiredCompleted}/${coverage.requiredTotal} completed`
          : 'Required-suite coverage unavailable'
      );
    }
  } else {
    reasons.push('Fresh, complete, and conclusive');
  }

  return {
    decision,
    counts,
    coverage,
    environment,
    appIdentityKnown: missingAppIdentity.length === 0,
    serverEnvironmentKnown,
    freshness: {
      fresh,
      ageMs,
      thresholdMs: freshnessMs,
      timestamp: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '',
    },
    reasons,
  };
}

module.exports = {
  RESULT_STATUSES,
  buildEvidenceDecision,
  buildEnvironmentSummary,
  buildLaneStats,
  buildRunComparison,
  countsForSummary,
  coverageForSummary,
  failureCategory,
  failureSnippet,
  findPreviousComparableReport,
  formatDate,
  formatDurationMs,
  laneForResult,
  normalizeStatus,
  rerunCommandForResult,
  resultDurationMs,
  statusForSummary,
  uniqueReportRuns,
};
