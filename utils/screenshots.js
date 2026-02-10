const path = require('path');
const fs = require('fs');

const ARTIFACTS_ROOT = path.resolve(__dirname, '..', 'screenshots');

function ensureArtifactsDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureTestArtifactsDir(testName) {
  return ensureArtifactsDir(path.join(ARTIFACTS_ROOT, testName));
}

async function saveScreenshot(driver, testName, fileName) {
  const file = path.join(ensureTestArtifactsDir(testName), fileName);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

module.exports = {
  ensureTestArtifactsDir,
  saveScreenshot,
};