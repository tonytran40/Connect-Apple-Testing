const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { formatDurationMs } = require('./reportWriter');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFileName(s) {
  return String(s).replace(/[^a-z0-9_.-]/gi, '_');
}

function writeTimingResult(result) {
  const runId = process.env.TEST_RUN_ID || process.env.PARALLEL_RUN_ID || '';
  const dir = process.env.TEST_RESULT_DIR || (runId ? path.resolve(__dirname, '..', 'reports', 'runs', runId) : '');
  if (!dir) return;

  const file = path.join(ensureDir(dir), `${safeFileName(result.name)}.json`);
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

/**
 * Wrap a test's `run()` when invoked as `node Tests/SomeTest.js` — logs wall-clock duration on success or failure.
 * @param {string} label  Usually the same as `TEST_NAME` in the test file.
 * @param {() => Promise<unknown>} runAsync
 */
async function runCliTimed(label, runAsync) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  try {
    await runAsync();
    const ms = Math.round(performance.now() - start);
    writeTimingResult({
      name: label,
      status: 'PASS',
      durationMs: ms,
      duration: formatDurationMs(ms),
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    console.log(`\n✓ ${label} finished in ${formatDurationMs(ms)}`);
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    writeTimingResult({
      name: label,
      status: 'FAIL',
      durationMs: ms,
      duration: formatDurationMs(ms),
      startedAt,
      finishedAt: new Date().toISOString(),
      error: err?.message || String(err),
    });
    console.error(`\n✗ ${label} failed after ${formatDurationMs(ms)}`);
    throw err;
  }
}

module.exports = { runCliTimed };
