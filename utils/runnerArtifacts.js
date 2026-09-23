const fs = require('fs');
const path = require('path');

const PHASE_LABELS = Object.freeze({
  sessionCreationMs: 'Session creation',
  loginReadinessMs: 'Login/readiness',
  testBodyMs: 'Test body',
  screenshotCaptureMs: 'Screenshot capture',
  recoveryMs: 'Recovery',
  reportGenerationMs: 'Report generation',
  roomCreationMs: 'Room creation (test-owned)',
});

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

function writeJsonFile(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeReportArtifacts({ reportPath, lines, summary }) {
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  writeJsonFile(reportPath.replace(/\.md$/, '.json'), summary);
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function relativeLink(fromFile, targetPath, label) {
  const relativePath = path.relative(path.dirname(fromFile), targetPath).replace(/\\/g, '/');
  return `[${label}](${encodeURI(relativePath)})`;
}

function buildArtifactLinks({ reportPath, artifacts }) {
  return artifacts
    .filter(artifact =>
      artifact.path &&
      artifact.include !== false &&
      (artifact.requireExists === false || fs.existsSync(artifact.path))
    )
    .map(artifact => relativeLink(reportPath, artifact.path, artifact.label))
    .join(' / ');
}

function phaseTimingRows(timings) {
  return Object.entries(PHASE_LABELS).map(([key, label]) => ({
    key,
    label,
    durationMs: timings?.phases?.[key] || 0,
  }));
}

module.exports = {
  buildArtifactLinks,
  ensureDir,
  escapeCell,
  phaseTimingRows,
  readJsonIfExists,
  relativeLink,
  writeJsonFile,
  writeReportArtifacts,
};
