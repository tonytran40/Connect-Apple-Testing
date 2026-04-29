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

function screenshotsDisabled() {
  if (process.env.SKIP_SCREENSHOTS === '1' || process.env.SKIP_SCREENSHOTS === 'true') {
    return true;
  }
  const c = process.env.CONNECT_SCREENSHOTS;
  return c === '0' || c === 'false';
}

async function saveScreenshot(driver, testName, fileName) {
  if (screenshotsDisabled()) {
    return;
  }
  const file = path.join(ensureTestArtifactsDir(testName), fileName);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

module.exports = {
  ensureTestArtifactsDir,
  saveScreenshot,
  screenshotsDisabled,
};