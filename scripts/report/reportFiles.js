const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeGeneratedFile(file, contents) {
  fs.writeFileSync(file, String(contents).replace(/[ \t]+(?=\r?\n)/g, ''), 'utf8');
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function gitTracksFile(file, repoRoot) {
  const relative = path.relative(repoRoot, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return spawnSync('git', ['ls-files', '--error-unmatch', '--', relative], {
    cwd: repoRoot,
    stdio: 'ignore',
  }).status === 0;
}

function enforceReportRetention({ outputRoot, maxArchives = 20, maxAgeDays = 90, now = Date.now() }) {
  const archiveRoot = path.join(outputRoot, 'archive');
  if (!fs.existsSync(archiveRoot)) return { kept: [], removed: [] };

  const countLimit = Number.isFinite(Number(maxArchives)) ? Math.max(0, Number(maxArchives)) : 20;
  const ageLimitDays = Number.isFinite(Number(maxAgeDays)) ? Math.max(0, Number(maxAgeDays)) : 90;
  const ageLimitMs = ageLimitDays * 24 * 60 * 60 * 1000;
  const archives = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dir = path.join(archiveRoot, entry.name);
      const meta = readJsonIfExists(path.join(dir, '_report-meta.json')) || {};
      const parsed = Date.parse(meta.startedAt || meta.updatedAt || '');
      const timestamp = Number.isFinite(parsed) ? parsed : fs.statSync(dir).mtimeMs;
      return { dir, timestamp };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const kept = [];
  const removed = [];
  archives.forEach((archive, index) => {
    const overCount = countLimit > 0 && index >= countLimit;
    const overAge = ageLimitDays > 0 && now - archive.timestamp > ageLimitMs;
    if (overCount || overAge) {
      fs.rmSync(archive.dir, { recursive: true, force: true });
      removed.push(archive.dir);
    } else {
      kept.push(archive.dir);
    }
  });
  return { kept, removed };
}

module.exports = {
  enforceReportRetention,
  ensureDir,
  gitTracksFile,
  readJsonIfExists,
  readTextIfExists,
  writeGeneratedFile,
};
