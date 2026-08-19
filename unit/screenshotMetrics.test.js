const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readScreenshotMetrics,
  resetScreenshotMetrics,
  saveScreenshot,
} = require('../utils/screenshots');

function withEnv(name, value) {
  const previous = process.env[name];
  if (value == null) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (previous == null) delete process.env[name];
    else process.env[name] = previous;
  };
}

test('screenshot metrics include configured delay and capture work and persist by test', async () => {
  const resultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-screenshot-metrics-'));
  const restoreResultDir = withEnv('TEST_RESULT_DIR', resultDir);
  const restoreDelays = withEnv('SCREENSHOT_DELAYS_MS', 'MetricTest/one.png=7');
  const restoreSkip = withEnv('SKIP_SCREENSHOTS', null);
  const restoreConnect = withEnv('CONNECT_SCREENSHOTS', null);
  const restoreTestRun = withEnv('TEST_RUN_ID', null);
  const restoreParallelRun = withEnv('PARALLEL_RUN_ID', null);
  const calls = [];
  const driver = {
    pause: async ms => calls.push(['pause', ms]),
    saveScreenshot: async file => {
      calls.push(['save', file]);
      await new Promise(resolve => setTimeout(resolve, 8));
    },
  };

  try {
    resetScreenshotMetrics('MetricTest', { resultDir });
    await saveScreenshot(driver, 'MetricTest', 'one.png');
    const metrics = readScreenshotMetrics('MetricTest', { resultDir });

    assert.equal(metrics.count, 1);
    assert.equal(metrics.delayMs, 7);
    assert.ok(metrics.captureMs >= 5);
    assert.deepEqual(calls[0], ['pause', 7]);
    assert.match(calls[1][1], /screenshots\/MetricTest\/one\.png$/);
  } finally {
    restoreConnect();
    restoreSkip();
    restoreDelays();
    restoreParallelRun();
    restoreTestRun();
    restoreResultDir();
    fs.rmSync(resultDir, { recursive: true, force: true });
  }
});

test('disabled screenshots do not add capture metrics', async () => {
  const resultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-screenshot-disabled-'));
  const restoreResultDir = withEnv('TEST_RESULT_DIR', resultDir);
  const restoreSkip = withEnv('SKIP_SCREENSHOTS', '1');

  try {
    resetScreenshotMetrics('DisabledMetricTest', { resultDir });
    await saveScreenshot(
      { saveScreenshot: async () => assert.fail('disabled screenshot should not be saved') },
      'DisabledMetricTest',
      'disabled.png'
    );
    assert.deepEqual(readScreenshotMetrics('DisabledMetricTest', { resultDir }), {
      count: 0,
      captureMs: 0,
      delayMs: 0,
    });
  } finally {
    restoreSkip();
    restoreResultDir();
    fs.rmSync(resultDir, { recursive: true, force: true });
  }
});
