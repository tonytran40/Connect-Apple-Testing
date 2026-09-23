const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildArtifactLinks,
  ensureDir,
  escapeCell,
  phaseTimingRows,
  readJsonIfExists,
  relativeLink,
  writeJsonFile,
  writeReportArtifacts,
} = require('../utils/runnerArtifacts');

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'connect-runner-artifacts-'));
}

test('JSON artifact helpers preserve formatted files and tolerate missing or invalid input', () => {
  const root = temporaryRoot();
  const nested = ensureDir(path.join(root, 'nested'));
  const jsonPath = path.join(nested, 'result.json');

  writeJsonFile(jsonPath, { status: 'PASS', count: 2 });

  assert.equal(fs.readFileSync(jsonPath, 'utf8'), '{\n  "status": "PASS",\n  "count": 2\n}\n');
  assert.deepEqual(readJsonIfExists(jsonPath), { status: 'PASS', count: 2 });
  assert.equal(readJsonIfExists(path.join(root, 'missing.json')), null);
  fs.writeFileSync(jsonPath, '{invalid');
  assert.equal(readJsonIfExists(jsonPath), null);

  fs.rmSync(root, { recursive: true, force: true });
});

test('report artifacts write compatible Markdown and JSON siblings', () => {
  const root = temporaryRoot();
  const reportPath = path.join(root, 'summary.md');

  writeReportArtifacts({
    reportPath,
    lines: ['# Report', '', 'PASS'],
    summary: { status: 'PASS' },
  });

  assert.equal(fs.readFileSync(reportPath, 'utf8'), '# Report\n\nPASS\n');
  assert.deepEqual(readJsonIfExists(path.join(root, 'summary.json')), { status: 'PASS' });
  fs.rmSync(root, { recursive: true, force: true });
});

test('artifact links include existing files, honor explicit inclusion, and encode paths', () => {
  const root = temporaryRoot();
  const reportPath = path.join(root, 'reports', 'summary.md');
  const existingPath = path.join(root, 'evidence', 'test log.txt');
  const optionalPath = path.join(root, 'evidence', 'missing.json');
  ensureDir(path.dirname(existingPath));
  fs.writeFileSync(existingPath, 'log');

  assert.equal(
    buildArtifactLinks({
      reportPath,
      artifacts: [
        { label: 'log', path: existingPath },
        { label: 'json', path: optionalPath },
        { label: 'forced', path: optionalPath, requireExists: false },
        { label: 'hidden', path: existingPath, include: false },
      ],
    }),
    '[log](../evidence/test%20log.txt) / [forced](../evidence/missing.json)'
  );
  assert.equal(relativeLink(reportPath, existingPath, 'log'), '[log](../evidence/test%20log.txt)');
  assert.equal(escapeCell('a|b\nc'), 'a\\|b<br>c');
  fs.rmSync(root, { recursive: true, force: true });
});

test('phase timing rows retain the established labels and default missing phases to zero', () => {
  const rows = phaseTimingRows({ phases: { sessionCreationMs: 1250, recoveryMs: 300 } });

  assert.deepEqual(rows[0], {
    key: 'sessionCreationMs',
    label: 'Session creation',
    durationMs: 1250,
  });
  assert.equal(rows.find(row => row.key === 'recoveryMs').durationMs, 300);
  assert.equal(rows.find(row => row.key === 'testBodyMs').durationMs, 0);
  assert.equal(rows.at(-1).label, 'Room creation (test-owned)');
});
