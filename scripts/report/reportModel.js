const fs = require('fs');
const path = require('path');
const { argValue, safePathPart, timestampSlug } = require('./reportUtils');
const { formatDurationMs } = require('./reportAnalysis');
const { readJsonIfExists, readTextIfExists } = require('./reportFiles');
const { normalizePhaseTimings } = require('../../utils/reportWriter');

const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_ROOT = path.join(REPO_ROOT, 'reports', 'runs');
const PHASE_LABELS = {
  sessionCreationMs: 'Session creation',
  loginReadinessMs: 'Login/readiness',
  testBodyMs: 'Test body',
  screenshotCaptureMs: 'Screenshot capture',
  recoveryMs: 'Recovery',
  reportGenerationMs: 'Report generation',
  roomCreationMs: 'Room creation (test-owned)',
};

function phaseTimingEntries(timings) {
  const phases = normalizePhaseTimings(timings?.phases || timings);
  return Object.entries(PHASE_LABELS)
    .filter(([key]) => key !== 'roomCreationMs' || phases[key] > 0)
    .map(([key, label]) => ({ key, label, durationMs: phases[key] }));
}

function setReportGenerationTiming(summary, durationMs) {
  summary.timings = {
    unit: 'milliseconds',
    phases: normalizePhaseTimings({
      ...(summary.timings?.phases || summary.timings || {}),
      reportGenerationMs: durationMs,
    }),
  };
  return summary;
}

function persistReportGenerationTiming(runId, summary) {
  const summaryPath = path.join(REPORTS_ROOT, runId, 'summary.json');
  const stored = readJsonIfExists(summaryPath);
  if (!stored) return;
  stored.timings = summary.timings;
  fs.writeFileSync(summaryPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
}

function durationFromText(value) {
  const match = String(value || '').trim().match(/^(?:(\d+)m\s*)?(?:(\d+)s)?$/);
  if (!match) return 0;
  return (Number(match[1] || 0) * 60 + Number(match[2] || 0)) * 1000;
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

function parseCombinedResultsFromSummary(runId) {
  const summary = readTextIfExists(path.join(REPORTS_ROOT, runId, 'summary.md'));
  const lines = summary.split(/\r?\n/);
  const legacyHeaderIndex = lines.findIndex(line =>
    /^\| Test \| Lane \| Status \| Duration \| Device \| Appium Port \|/.test(line)
  );
  const expandedHeaderIndex = lines.findIndex(line =>
    /^\| Test \| Category \| Physical Lane \| Status \| Duration \| Device \| Appium Port \|/.test(line)
  );
  const headerIndex = expandedHeaderIndex >= 0 ? expandedHeaderIndex : legacyHeaderIndex;
  if (headerIndex < 0) return [];

  const results = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 6) continue;

    const [name, logicalCategory, laneLabel, status, duration, deviceName, appiumPort] =
      expandedHeaderIndex >= 0
        ? cells
        : [cells[0], '', cells[1], cells[2], cells[3], cells[4], cells[5]];
    results.push({
      name,
      logicalCategory,
      laneLabel,
      laneRunId: laneLabel,
      status,
      duration,
      durationMs: durationFromText(duration),
      deviceName,
      appiumPort,
    });
  }

  return results;
}

function combinedSummaryMeta(runId) {
  const summary = readTextIfExists(path.join(REPORTS_ROOT, runId, 'summary.md'));
  const valueFor = label => {
    const match = summary.match(new RegExp(`^- ${label}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : '';
  };

  return {
    startedAt: valueFor('Started'),
    updatedAt: valueFor('Finished'),
    durationMs: durationFromText(valueFor('Total wall time')),
  };
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
      timings: summaryJson.timings || {},
      cleanup: summaryJson.cleanup || null,
      coverage: summaryJson.coverage || null,
      registry: summaryJson.registry || summaryJson.testRegistry || null,
      requiredSuite: summaryJson.requiredSuite || null,
      environment: summaryJson.environment || null,
      app: summaryJson.app || null,
      automation: summaryJson.automation || null,
      appBranch: summaryJson.appBranch || '',
      appCommit: summaryJson.appCommit || '',
      productStatus: summaryJson.productStatus || summaryJson.status || '',
    };
  }

  const combinedMeta = combinedSummaryMeta(runId);
  const combinedResults = parseCombinedResultsFromSummary(runId);
  if (combinedResults.length) {
    const failed = combinedResults.filter(result => result.status === 'FAIL').length;
    const passed = combinedResults.filter(result => result.status === 'PASS').length;
    return {
      runId,
      source: 'combined summary.md',
      status: failed ? 'FAIL' : 'PASS',
      startedAt: combinedMeta.startedAt || '',
      updatedAt: combinedMeta.updatedAt || '',
      durationMs: combinedMeta.durationMs,
      counts: { total: combinedResults.length, passed, failed },
      lanes: [...new Set(combinedResults.map(result => result.laneLabel).filter(Boolean))].map(label => ({
        runId: label,
        label,
        tests: combinedResults.filter(result => result.laneLabel === label).map(result => result.name),
      })),
      results: combinedResults,
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
    startedAt: combinedMeta.startedAt || laneSummaries.map(summary => summary.startedAt).filter(Boolean).sort()[0] || '',
    updatedAt: combinedMeta.updatedAt || new Date().toISOString(),
    durationMs: combinedMeta.durationMs,
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

function archiveRunId(runId, summary) {
  return `${timestampSlug(summary.startedAt || summary.updatedAt)}-${safePathPart(runId)}`;
}

function previewFailureSpec() {
  return argValue('preview-failures', process.env.SCRIBE_DOC_PREVIEW_FAILURES || '');
}

function withPreviewFailures(summary, spec) {
  if (!spec) return summary;

  const next = JSON.parse(JSON.stringify(summary));
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

function buildTestHistory(reports = []) {
  const byTest = new Map();
  const seen = new Set();

  for (const report of reports) {
    const key = `${report.runId || ''}|${report.startedAt || ''}`;
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
  const recent = history.slice(0, 5);
  const passed = recent.filter(entry => entry.status === 'PASS').length;
  const failed = recent.filter(entry => entry.status === 'FAIL').length;
  if (passed && failed) return `${failed}/${recent.length} failed in last ${recent.length} runs`;
  if (history.length < 2) return 'No history yet';
  if (failed) return 'Failing recently';
  if (passed) return 'Stable recently';
  return 'No signal';
}

function isFlakyHistory(history = []) {
  const recent = history.slice(0, 5);
  return recent.some(entry => entry.status === 'PASS') && recent.some(entry => entry.status === 'FAIL');
}

function formatReportAge(value, now = Date.now()) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return '';
  const ageMinutes = Math.max(0, Math.round((now - timestamp) / 60000));
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 48) return `${ageHours}h ago`;
  return `${Math.round(ageHours / 24)}d ago`;
}

function reportFreshnessMs(value = process.env.SCRIBE_REPORT_FRESHNESS_HOURS || '24') {
  const hours = Number.parseFloat(value);
  return Number.isFinite(hours) && hours >= 0 ? hours * 60 * 60 * 1000 : undefined;
}

module.exports = {
  archiveRunId,
  buildTestHistory,
  durationFromText,
  flakeSummary,
  formatReportAge,
  isFlakyHistory,
  loadRunSummary,
  parseCombinedResultsFromSummary,
  parseLaneRunIdsFromCombinedSummary,
  persistReportGenerationTiming,
  phaseTimingEntries,
  previewFailureSpec,
  reportFreshnessMs,
  setReportGenerationTiming,
  withPreviewFailures,
};
