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

module.exports = {
  ensureDir,
  gitTracksFile,
  readJsonIfExists,
  readTextIfExists,
  writeGeneratedFile,
};
