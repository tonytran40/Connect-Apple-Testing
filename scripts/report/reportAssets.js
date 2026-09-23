const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./reportFiles');
const { safePathPart, slugify } = require('./reportUtils');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCREENSHOTS_ROOT = path.join(REPO_ROOT, 'screenshots');

function copyScreenshotAsset({ outDir, laneRunId, testName, screenshot }) {
  const assetDir = ensureDir(path.join(outDir, 'assets', safePathPart(laneRunId), safePathPart(testName)));
  const target = path.join(assetDir, path.basename(screenshot));
  if (!fs.existsSync(target)) {
    fs.copyFileSync(screenshot, target);
  }
  return target;
}

function isWithinResultWindow(file, result) {
  const startedAt = Date.parse(result?.startedAt || '');
  const finishedAt = Date.parse(result?.finishedAt || '');
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return true;

  const stat = fs.statSync(file);
  const mtime = stat.mtimeMs;
  const toleranceMs = 120000;
  return mtime >= startedAt - toleranceMs && mtime <= finishedAt + toleranceMs;
}

function listScreenshots(runId, testName, result = {}) {
  const dir = path.join(SCREENSHOTS_ROOT, runId, testName);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
    .filter(file => result.status === 'FAIL' || !/^error\.(png|jpg|jpeg)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(file => path.join(dir, file));

  const inWindow = files.filter(file => isWithinResultWindow(file, result));
  return inWindow.length ? inWindow : files;
}

function failedStepIndex(screenshots, result) {
  if (result.status !== 'FAIL' || !screenshots.length) return -1;
  const errorIndex = screenshots.findIndex(screenshot => /^error\.(png|jpe?g)$/i.test(path.basename(screenshot)));
  return errorIndex >= 0 ? errorIndex : screenshots.length - 1;
}

function testDetailFile(outDir, result) {
  return path.join(outDir, 'tests', safePathPart(slugify(result.name)), 'index.html');
}

module.exports = {
  copyScreenshotAsset,
  failedStepIndex,
  isWithinResultWindow,
  listScreenshots,
  testDetailFile,
};
