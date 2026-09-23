const fs = require('fs');
const path = require('path');
const { discoverReports, reportsForNavigation } = require('./reportCatalog');
const { enforceReportRetention, ensureDir } = require('./reportFiles');
const { writeIndex, writeTestDoc } = require('./reportMarkdown');
const {
  archiveRunId,
  loadRunSummary,
  persistReportGenerationTiming,
  previewFailureSpec,
  setReportGenerationTiming,
  withPreviewFailures,
} = require('./reportModel');
const {
  buildReportNav,
  refreshReportNavigation,
  reportFile,
} = require('./reportNavigation');
const {
  writeArchivePages,
  writeHtmlReport,
  writeReportMeta,
  writeTestHtmlPages,
} = require('./reportRendering');
const { argValue } = require('./reportUtils');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'docs', 'generated', 'scribe');

function generateReportAt({ outputRoot, outputRunId, sourceRunId, summary, reportType }) {
  const outDir = path.join(outputRoot, outputRunId);
  const indexPath = path.join(outDir, 'index.md');
  const htmlPath = path.join(outDir, 'index.html');
  const metaPath = path.join(outDir, '_report-meta.json');
  if (
    reportType === 'archive' &&
    fs.existsSync(indexPath) &&
    fs.existsSync(htmlPath) &&
    fs.existsSync(metaPath)
  ) {
    return {
      outDir,
      indexPath,
      htmlPath,
      metaPath,
      testDocs: {},
      immutableExisting: true,
    };
  }
  if (reportType === 'latest' && fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  ensureDir(outDir);
  const testDocs = {};

  for (const result of summary.results) {
    testDocs[result.name] = writeTestDoc({ outDir, runId: sourceRunId, result });
  }

  writeIndex({ outDir, runId: sourceRunId, summary, testDocs });
  writeHtmlReport({ outDir, runId: sourceRunId, summary, testDocs });
  writeReportMeta({ outDir, runId: sourceRunId, summary, reportType });
  return { outDir, indexPath, htmlPath, metaPath, testDocs, immutableExisting: false };
}

function generate() {
  const inheritedStart = Number.parseInt(process.env.REPORT_GENERATION_STARTED_AT_MS, 10);
  const generationStartedAtMs = Number.isFinite(inheritedStart) ? inheritedStart : Date.now();
  const runId = argValue('run', process.env.SCRIBE_DOC_RUN_ID || 'split3-combined');
  const outputRoot = path.resolve(argValue('out', process.env.SCRIBE_DOC_OUTPUT_DIR || DEFAULT_OUTPUT_ROOT));
  const archiveEnabled = argValue('archive', process.env.SCRIBE_ARCHIVE_ENABLED || '0') !== '0';
  const summary = withPreviewFailures(loadRunSummary(runId), previewFailureSpec());
  const archiveId = argValue('archive-id', process.env.SCRIBE_DOC_ARCHIVE_ID || archiveRunId(runId, summary));
  const latest = generateReportAt({
    outputRoot,
    outputRunId: runId,
    sourceRunId: runId,
    summary,
    reportType: 'latest',
  });
  const archive = archiveEnabled
    ? generateReportAt({
        outputRoot,
        outputRunId: path.join('archive', archiveId),
        sourceRunId: runId,
        summary,
        reportType: 'archive',
      })
    : null;
  const retention = enforceReportRetention({
    outputRoot,
    maxArchives: argValue('max-archives', process.env.SCRIBE_ARCHIVE_MAX_COUNT || '20'),
    maxAgeDays: argValue('max-archive-age-days', process.env.SCRIBE_ARCHIVE_MAX_AGE_DAYS || '90'),
  });
  const writeArchive =
    archive && !archive.immutableExisting && !retention.removed.includes(archive.outDir);
  const discoveredReports = discoverReports(outputRoot);
  const reports = reportsForNavigation(discoveredReports, latest.htmlPath, { repoRoot: REPO_ROOT });
  writeTestHtmlPages({
    outDir: latest.outDir,
    runId,
    summary,
    testDocs: latest.testDocs,
    allReports: reports,
  });
  if (writeArchive) {
    writeTestHtmlPages({
      outDir: archive.outDir,
      runId,
      summary,
      testDocs: archive.testDocs,
      allReports: reports,
    });
  }
  refreshReportNavigation(
    reports.filter(report => path.resolve(reportFile(report)) !== path.resolve(latest.htmlPath))
  );
  const archivePages = writeArchivePages(outputRoot, reports);

  const reportGenerationMs = Math.max(0, Date.now() - generationStartedAtMs);
  setReportGenerationTiming(summary, reportGenerationMs);
  persistReportGenerationTiming(runId, summary);
  writeIndex({ outDir: latest.outDir, runId, summary, testDocs: latest.testDocs });
  writeHtmlReport({
    outDir: latest.outDir,
    runId,
    summary,
    testDocs: latest.testDocs,
    reportNav: buildReportNav(reports, latest.htmlPath),
    allReports: reports,
  });
  writeReportMeta({ outDir: latest.outDir, runId, summary, reportType: 'latest' });
  if (writeArchive) {
    writeIndex({ outDir: archive.outDir, runId, summary, testDocs: archive.testDocs });
    writeHtmlReport({
      outDir: archive.outDir,
      runId,
      summary,
      testDocs: archive.testDocs,
      reportNav: buildReportNav(reports, archive.htmlPath),
      allReports: reports,
    });
    writeReportMeta({ outDir: archive.outDir, runId, summary, reportType: 'archive' });
  }

  console.log(`Scribe-style Markdown written to ${latest.indexPath}`);
  console.log(`Scribe-style web report written to ${latest.htmlPath}`);
  if (archive && !retention.removed.includes(archive.outDir)) {
    console.log(`Archived copy available at ${archive.htmlPath}`);
  } else if (!archive) {
    console.log('Archive generation disabled for this report');
  }
  if (retention.removed.length) {
    console.log(`Report retention removed ${retention.removed.length} expired archive(s)`);
  }
  console.log(`Report archive page updated at ${archivePages.repoRootIndex} (${archivePages.reportCount} reports)`);
}

module.exports = { generate, generateReportAt, loadRunSummary };
