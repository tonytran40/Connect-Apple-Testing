const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  currentRunIdFromResultDir,
  pruneLocalArtifacts,
} = require('../utils/screenshots');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-artifact-retention-'));
  const screenshotsRoot = path.join(root, 'screenshots');
  const reportRunsRoot = path.join(root, 'reports', 'runs');
  fs.mkdirSync(screenshotsRoot, { recursive: true });
  fs.mkdirSync(reportRunsRoot, { recursive: true });
  return { root, screenshotsRoot, reportRunsRoot };
}

function addRun(roots, runId, timestamp, { screenshots = true } = {}) {
  const reportDir = path.join(roots.reportRunsRoot, runId);
  fs.mkdirSync(reportDir);
  fs.writeFileSync(path.join(reportDir, 'summary.json'), '{}');
  fs.utimesSync(reportDir, timestamp, timestamp);
  if (screenshots) {
    const screenshotDir = path.join(roots.screenshotsRoot, runId);
    fs.mkdirSync(screenshotDir);
    fs.writeFileSync(path.join(screenshotDir, 'step.png'), 'image');
    fs.utimesSync(screenshotDir, timestamp, timestamp);
  }
}

test('artifact retention is opt-in and leaves all generated runs untouched by default', () => {
  const roots = fixture();
  const old = new Date('2025-01-01T00:00:00Z');
  addRun(roots, 'old-run', old);

  try {
    const result = pruneLocalArtifacts({
      ...roots,
      env: {},
      maxRuns: 1,
      maxAgeDays: 1,
      minAgeMinutes: 0,
      now: Date.parse('2026-01-01T00:00:00Z'),
    });
    assert.equal(result.enabled, false);
    assert.deepEqual(result.removed, []);
    assert.equal(fs.existsSync(path.join(roots.reportRunsRoot, 'old-run')), true);
    assert.equal(fs.existsSync(path.join(roots.screenshotsRoot, 'old-run')), true);
  } finally {
    fs.rmSync(roots.root, { recursive: true, force: true });
  }
});

test('artifact retention removes bounded old runs but preserves current and newest runs', () => {
  const roots = fixture();
  const now = Date.parse('2026-01-31T00:00:00Z');
  addRun(roots, 'old-run', new Date('2025-01-01T00:00:00Z'));
  addRun(roots, 'current-run', new Date('2025-01-02T00:00:00Z'));
  addRun(roots, 'newest-run', new Date('2026-01-30T00:00:00Z'));

  try {
    const result = pruneLocalArtifacts({
      ...roots,
      enabled: true,
      maxRuns: 1,
      maxAgeDays: 7,
      minAgeMinutes: 0,
      currentRunIds: ['current-run'],
      now,
    });
    assert.deepEqual(result.removed.map(item => item.runId), ['old-run']);
    assert.equal(fs.existsSync(path.join(roots.reportRunsRoot, 'old-run')), false);
    assert.equal(fs.existsSync(path.join(roots.screenshotsRoot, 'old-run')), false);
    assert.equal(fs.existsSync(path.join(roots.reportRunsRoot, 'current-run')), true);
    assert.equal(fs.existsSync(path.join(roots.screenshotsRoot, 'current-run')), true);
    assert.equal(fs.existsSync(path.join(roots.reportRunsRoot, 'newest-run')), true);
  } finally {
    fs.rmSync(roots.root, { recursive: true, force: true });
  }
});

test('artifact retention dry-run is path-safe and ignores legacy and symlink screenshot entries', () => {
  const roots = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-artifact-outside-'));
  const outsideFile = path.join(outside, 'keep.txt');
  fs.writeFileSync(outsideFile, 'keep');
  addRun(roots, 'old-run', new Date('2025-01-01T00:00:00Z'), { screenshots: false });
  fs.symlinkSync(outside, path.join(roots.screenshotsRoot, 'old-run'));
  fs.mkdirSync(path.join(roots.screenshotsRoot, 'legacy-direct-test'));
  addRun(roots, 'newest-run', new Date('2025-12-31T00:00:00Z'), { screenshots: false });

  try {
    const dryRun = pruneLocalArtifacts({
      ...roots,
      enabled: true,
      dryRun: true,
      maxRuns: 1,
      maxAgeDays: 1,
      minAgeMinutes: 0,
      now: Date.parse('2026-01-01T00:00:00Z'),
    });
    assert.deepEqual(dryRun.removed.map(item => item.runId), ['old-run']);
    assert.equal(fs.existsSync(path.join(roots.reportRunsRoot, 'old-run')), true);

    const applied = pruneLocalArtifacts({
      ...roots,
      enabled: true,
      maxRuns: 1,
      maxAgeDays: 1,
      minAgeMinutes: 0,
      now: Date.parse('2026-01-01T00:00:00Z'),
    });
    assert.deepEqual(applied.removed.map(item => item.runId), ['old-run']);
    assert.equal(fs.existsSync(outsideFile), true);
    assert.equal(fs.lstatSync(path.join(roots.screenshotsRoot, 'old-run')).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.join(roots.screenshotsRoot, 'legacy-direct-test')), true);
  } finally {
    fs.rmSync(roots.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('current run can be inferred only from a result directory inside reports/runs', () => {
  const roots = fixture();
  try {
    assert.equal(
      currentRunIdFromResultDir(
        path.join(roots.reportRunsRoot, 'active-run', 'results'),
        roots.reportRunsRoot
      ),
      'active-run'
    );
    assert.equal(currentRunIdFromResultDir(path.join(roots.root, 'outside'), roots.reportRunsRoot), '');
  } finally {
    fs.rmSync(roots.root, { recursive: true, force: true });
  }
});
