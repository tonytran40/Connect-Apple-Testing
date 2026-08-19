const path = require('path');
const fs = require('fs');

const ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'screenshots');
const DEFAULT_SCREENSHOT_DELAYS_MS = {
  'CreateRoom/rooms_list_after_public.png': 1200,
};
const screenshotMetrics = new Map();

function ensureArtifactsDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureTestArtifactsDir(testName) {
  const runId = process.env.TEST_RUN_ID || process.env.PARALLEL_RUN_ID || '';
  if (runId) {
    return ensureArtifactsDir(path.join(ARTIFACTS_ROOT, runId, testName));
  }
  return ensureArtifactsDir(path.join(ARTIFACTS_ROOT, testName));
}

function screenshotsDisabled() {
  if (process.env.SKIP_SCREENSHOTS === '1' || process.env.SKIP_SCREENSHOTS === 'true') {
    return true;
  }
  const c = process.env.CONNECT_SCREENSHOTS;
  return c === '0' || c === 'false';
}

function parseDelayOverrides(raw) {
  return String(raw || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .reduce((delays, entry) => {
      const separatorIndex = entry.lastIndexOf('=');
      if (separatorIndex <= 0) return delays;

      const key = entry.slice(0, separatorIndex).trim();
      const delay = Number.parseInt(entry.slice(separatorIndex + 1).trim(), 10);
      if (key && Number.isFinite(delay) && delay >= 0) {
        delays[key] = delay;
      }
      return delays;
    }, {});
}

function screenshotDelayMs(testName, fileName) {
  const key = `${testName}/${fileName}`;
  const overrides = parseDelayOverrides(
    process.env.SCREENSHOT_DELAYS_MS || process.env.SCREENSHOT_DELAY_MS
  );

  return overrides[key] ?? overrides[fileName] ?? DEFAULT_SCREENSHOT_DELAYS_MS[key] ?? 0;
}

function metricsFile(testName, resultDir = process.env.TEST_RESULT_DIR) {
  if (!resultDir) return '';
  return path.join(resultDir, '.metrics', `${testName}.screenshots.json`);
}

function emptyScreenshotMetrics() {
  return {
    count: 0,
    captureMs: 0,
    delayMs: 0,
  };
}

function persistScreenshotMetrics(testName, metrics, resultDir) {
  const file = metricsFile(testName, resultDir);
  if (!file) return;
  ensureArtifactsDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
}

function resetScreenshotMetrics(testName, options = {}) {
  const metrics = emptyScreenshotMetrics();
  screenshotMetrics.set(testName, metrics);
  persistScreenshotMetrics(testName, metrics, options.resultDir);
  return { ...metrics };
}

function readScreenshotMetrics(testName, options = {}) {
  const file = metricsFile(testName, options.resultDir);
  if (file) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        count: Number.isFinite(stored.count) ? stored.count : 0,
        captureMs: Number.isFinite(stored.captureMs) ? stored.captureMs : 0,
        delayMs: Number.isFinite(stored.delayMs) ? stored.delayMs : 0,
      };
    } catch {}
  }

  const inMemory = screenshotMetrics.get(testName);
  return inMemory ? { ...inMemory } : emptyScreenshotMetrics();
}

async function saveScreenshot(driver, testName, fileName) {
  if (screenshotsDisabled()) {
    return;
  }
  if (!screenshotMetrics.has(testName)) {
    resetScreenshotMetrics(testName);
  }
  const startedAt = Date.now();
  const delayMs = screenshotDelayMs(testName, fileName);
  if (delayMs > 0) {
    console.log(`Screenshot delay ${delayMs}ms: ${testName}/${fileName}`);
    await driver.pause(delayMs);
  }

  const file = path.join(ensureTestArtifactsDir(testName), fileName);
  try {
    await driver.saveScreenshot(file);
    console.log(`Screenshot: ${file}`);
  } finally {
    const current = screenshotMetrics.get(testName) || emptyScreenshotMetrics();
    current.count += 1;
    current.captureMs += Math.max(0, Date.now() - startedAt);
    current.delayMs += delayMs;
    screenshotMetrics.set(testName, current);
    persistScreenshotMetrics(testName, current);
  }
}

module.exports = {
  emptyScreenshotMetrics,
  ensureTestArtifactsDir,
  readScreenshotMetrics,
  resetScreenshotMetrics,
  saveScreenshot,
  screenshotDelayMs,
  screenshotsDisabled,
};
