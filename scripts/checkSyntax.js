const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['Login_Flow', 'Tests', 'scripts', 'utils', 'unit'];

function javascriptFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return javascriptFiles(file);
    return entry.isFile() && entry.name.endsWith('.js') ? [file] : [];
  });
}

function main() {
  const files = SOURCE_DIRS.flatMap(dir => javascriptFiles(path.join(REPO_ROOT, dir)));
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      failures.push(`${path.relative(REPO_ROOT, file)}\n${result.stderr || result.stdout}`);
    }
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(`Syntax check passed (${files.length} JavaScript files)`);
}

if (require.main === module) main();

module.exports = { javascriptFiles, main };
