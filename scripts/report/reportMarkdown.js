const path = require('path');
const { countsForSummary, formatDurationMs, laneForResult, normalizeStatus, statusForSummary } = require('./reportAnalysis');
const { copyScreenshotAsset, failedStepIndex, listScreenshots } = require('./reportAssets');
const { writeGeneratedFile } = require('./reportFiles');
const { phaseTimingEntries } = require('./reportModel');
const { escapeMd, relativeLink, titleFromFileName } = require('./reportUtils');

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
  ];

  if (result.logicalCategory) lines.push(`- Logical category: ${result.logicalCategory}`);
  if (result.deviceName) lines.push(`- Device: ${result.deviceName}`);
  if (result.appiumPort) lines.push(`- Appium port: ${result.appiumPort}`);
  if (result.startedAt) lines.push(`- Started: ${result.startedAt}`);
  if (result.finishedAt) lines.push(`- Finished: ${result.finishedAt}`);

  if (result.error) {
    lines.push('', '## Failure', '', '```text', result.error, '```');
  }

  if (result.timings) {
    lines.push('', '## Phase Timings', '', '| Phase | Duration |', '| --- | --- |');
    phaseTimingEntries(result.timings).forEach(phase => {
      lines.push(`| ${phase.label} | ${formatDurationMs(phase.durationMs)} |`);
    });
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

  writeGeneratedFile(file, `${lines.join('\n')}\n`);
  return file;
}

function writeIndex({ outDir, runId, summary, testDocs }) {
  const file = path.join(outDir, 'index.md');
  const counts = countsForSummary(summary);
  const failures = summary.results.filter(result => normalizeStatus(result.status) === 'FAIL');
  const lines = [
    '# Scribe-Style Test Documentation',
    '',
    `- Run ID: ${runId}`,
    `- Source: ${summary.source}`,
    `- Status: ${statusForSummary(summary)}`,
    `- Started: ${summary.startedAt || ''}`,
    `- Updated: ${summary.updatedAt || ''}`,
    `- Passed: ${counts.passed}`,
    `- Failed: ${counts.failed}`,
    `- Skipped: ${counts.skipped}`,
    `- Blocked: ${counts.blocked}`,
    `- Inconclusive: ${counts.inconclusive}`,
    `- Total tests: ${counts.total}`,
  ];

  if (summary.timings) {
    lines.push('', '## Phase Timings', '', '| Phase | Aggregate Duration |', '| --- | --- |');
    phaseTimingEntries(summary.timings).forEach(phase => {
      lines.push(`| ${phase.label} | ${formatDurationMs(phase.durationMs)} |`);
    });
  }

  lines.push(
    '',
    '## Tests',
    '',
    '| Test | Category | Physical Lane | Status | Duration | Screenshots | Guide |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  );

  for (const result of summary.results) {
    const laneRunId = laneForResult(result, runId);
    const screenshots = listScreenshots(laneRunId, result.name, result);
    lines.push(
      `| ${escapeMd(result.name)} | ${escapeMd(result.logicalCategory || '')} | ${escapeMd(laneRunId)} | ${escapeMd(result.status || '')} | ${escapeMd(result.duration || '')} | ${screenshots.length} | [guide](${relativeLink(file, testDocs[result.name])}) |`
    );
  }

  if (failures.length) {
    lines.push('', '## Failures', '');
    for (const failure of failures) {
      lines.push(`- **${failure.name}**: ${failure.error || 'Failed without error text'}`);
    }
  }

  writeGeneratedFile(file, `${lines.join('\n')}\n`);
  return file;
}

module.exports = { writeIndex, writeTestDoc };
