const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const TESTS_DIR = path.resolve(__dirname, '..', 'Tests');
const ORCHESTRATION_ENTRY_POINTS = new Set([
  'runAll.js',
  'runParallel.js',
  'runSingle.js',
  'runSplitParallel.js',
]);

function directScenarioFiles() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter(file => file.endsWith('.js'))
    .filter(file => !ORCHESTRATION_ENTRY_POINTS.has(file))
    .filter(file => {
      const source = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
      return source.includes('require.main === module');
    });
}

test('standalone scenarios use the shared test harness', () => {
  const missingHarness = directScenarioFiles().filter(file => {
    const source = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
    return !source.includes('defineTest');
  });

  assert.deepEqual(
    missingHarness,
    [],
    `Standalone scenarios missing defineTest: ${missingHarness.join(', ')}`
  );
});

