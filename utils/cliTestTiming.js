const { performance } = require('perf_hooks');
const { formatDurationMs } = require('./reportWriter');

/**
 * Wrap a test's `run()` when invoked as `node Tests/SomeTest.js` — logs wall-clock duration on success or failure.
 * @param {string} label  Usually the same as `TEST_NAME` in the test file.
 * @param {() => Promise<unknown>} runAsync
 */
async function runCliTimed(label, runAsync) {
  const start = performance.now();
  try {
    await runAsync();
    const ms = Math.round(performance.now() - start);
    console.log(`\n✓ ${label} finished in ${formatDurationMs(ms)}`);
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.error(`\n✗ ${label} failed after ${formatDurationMs(ms)}`);
    throw err;
  }
}

module.exports = { runCliTimed };
