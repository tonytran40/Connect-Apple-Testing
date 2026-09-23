const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'screenshots');
const REPORT_RUNS_ROOT = path.join(REPO_ROOT, 'reports', 'runs');
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_SCREENSHOT_DELAYS_MS = {
  'CreateRoom/rooms_list_after_public.png': 1200,
};
const screenshotMetrics = new Map();
let artifactRetentionAttempted = false;

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function finiteLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function directChild(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && !relative.includes(path.sep) && relative !== '..';
}

function safeRoot(root) {
  try {
    const stat = fs.lstatSync(root);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function safeDirectory(root, candidate) {
  if (!safeRoot(root) || !directChild(root, candidate)) return false;
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    return directChild(fs.realpathSync(root), fs.realpathSync(candidate));
  } catch {
    return false;
  }
}

function directoryMtime(candidate) {
  try {
    return fs.statSync(candidate).mtimeMs;
  } catch {
    return 0;
  }
}

function currentRunIdFromResultDir(resultDir, reportRunsRoot = REPORT_RUNS_ROOT) {
  if (!resultDir) return '';
  const relative = path.relative(path.resolve(reportRunsRoot), path.resolve(resultDir));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) return '';
  return relative.split(path.sep)[0] || '';
}

function currentRunIdsFromEnvironment(reportRunsRoot, env = process.env) {
  const ids = [
    env.TEST_RUN_ID,
    env.PARALLEL_RUN_ID,
    currentRunIdFromResultDir(env.TEST_RESULT_DIR, reportRunsRoot),
    ...String(env.LOCAL_ARTIFACT_RETENTION_PROTECTED_RUNS || '').split(','),
  ];
  return new Set(ids.map(id => String(id || '').trim()).filter(Boolean));
}

function discoverRunArtifacts({ reportRunsRoot, screenshotsRoot }) {
  if (!safeRoot(reportRunsRoot)) return [];

  return fs
    .readdirSync(reportRunsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => {
      const reportDir = path.join(reportRunsRoot, entry.name);
      if (!safeDirectory(reportRunsRoot, reportDir)) return null;
      const screenshotCandidate = path.join(screenshotsRoot, entry.name);
      const screenshotDir = safeDirectory(screenshotsRoot, screenshotCandidate)
        ? screenshotCandidate
        : '';
      return {
        runId: entry.name,
        reportDir,
        screenshotDir,
        timestamp: Math.max(directoryMtime(reportDir), directoryMtime(screenshotDir)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp || a.runId.localeCompare(b.runId));
}

function removeGeneratedDirectory(root, candidate, dryRun) {
  if (!candidate || !safeDirectory(root, candidate)) return false;
  if (!dryRun) fs.rmSync(candidate, { recursive: true, force: true });
  return true;
}

function pruneLocalArtifacts(options = {}) {
  const env = options.env || process.env;
  const enabled = options.enabled ?? envEnabled(env.LOCAL_ARTIFACT_RETENTION_ENABLED);
  const dryRun = options.dryRun ?? envEnabled(env.LOCAL_ARTIFACT_RETENTION_DRY_RUN);
  const screenshotsRoot = path.resolve(options.screenshotsRoot || ARTIFACTS_ROOT);
  const reportRunsRoot = path.resolve(options.reportRunsRoot || REPORT_RUNS_ROOT);
  const maxRuns = finiteLimit(options.maxRuns ?? env.LOCAL_ARTIFACT_RETENTION_MAX_RUNS, 20);
  const maxAgeDays = finiteLimit(options.maxAgeDays ?? env.LOCAL_ARTIFACT_RETENTION_MAX_AGE_DAYS, 90);
  const minAgeMinutes = finiteLimit(
    options.minAgeMinutes ?? env.LOCAL_ARTIFACT_RETENTION_MIN_AGE_MINUTES,
    360
  );
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const protectedRunIds = currentRunIdsFromEnvironment(reportRunsRoot, env);
  for (const runId of options.currentRunIds || []) {
    if (runId) protectedRunIds.add(String(runId));
  }

  const result = { enabled, dryRun, kept: [], removed: [], skipped: [] };
  if (!enabled) return result;

  const runs = discoverRunArtifacts({ reportRunsRoot, screenshotsRoot });
  if (runs[0]) protectedRunIds.add(runs[0].runId);

  runs.forEach((run, index) => {
    const ageMs = Math.max(0, now - run.timestamp);
    const protectedRun = protectedRunIds.has(run.runId);
    const recentlyModified = minAgeMinutes > 0 && ageMs < minAgeMinutes * MINUTE_MS;
    const overCount = maxRuns > 0 && index >= maxRuns;
    const overAge = maxAgeDays > 0 && ageMs > maxAgeDays * DAY_MS;

    if (protectedRun || recentlyModified || (!overCount && !overAge)) {
      result.kept.push(run.runId);
      return;
    }

    const reportRemoved = removeGeneratedDirectory(reportRunsRoot, run.reportDir, dryRun);
    const screenshotsRemoved = run.screenshotDir
      ? removeGeneratedDirectory(screenshotsRoot, run.screenshotDir, dryRun)
      : false;
    if (!reportRemoved) {
      result.skipped.push(run.runId);
      return;
    }
    result.removed.push({
      runId: run.runId,
      reason: overAge ? 'age' : 'count',
      reportDir: run.reportDir,
      screenshotDir: screenshotsRemoved ? run.screenshotDir : '',
    });
  });

  return result;
}

function ensureArtifactsDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureTestArtifactsDir(testName) {
  const runId = process.env.TEST_RUN_ID || process.env.PARALLEL_RUN_ID || '';
  maybePruneLocalArtifacts(runId);
  if (runId) {
    return ensureArtifactsDir(path.join(ARTIFACTS_ROOT, runId, testName));
  }
  return ensureArtifactsDir(path.join(ARTIFACTS_ROOT, testName));
}

function maybePruneLocalArtifacts(runId) {
  if (artifactRetentionAttempted || !envEnabled(process.env.LOCAL_ARTIFACT_RETENTION_ENABLED)) {
    return;
  }
  artifactRetentionAttempted = true;
  try {
    const result = pruneLocalArtifacts({ currentRunIds: runId ? [runId] : [] });
    if (result.removed.length) {
      const action = result.dryRun ? 'would remove' : 'removed';
      console.log(`Artifact retention ${action} ${result.removed.length} old run(s)`);
    }
  } catch (error) {
    // Artifact cleanup is maintenance and must never make a test fail.
    console.warn(`Artifact retention skipped: ${error.message}`);
  }
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
  currentRunIdFromResultDir,
  discoverRunArtifacts,
  emptyScreenshotMetrics,
  ensureTestArtifactsDir,
  pruneLocalArtifacts,
  readScreenshotMetrics,
  resetScreenshotMetrics,
  saveScreenshot,
  screenshotDelayMs,
  screenshotsDisabled,
};
