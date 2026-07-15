require('dotenv').config();

const path = require('path');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { ensureRoomsSectionReady } = require('../utils/testSession');
const { runCliTimed } = require('../utils/cliTestTiming');

function normalizeTestName(raw) {
  return String(raw || '')
    .replace(/^Tests\//, '')
    .replace(/\.js$/, '')
    .trim();
}

function loadTestModule(testName) {
  const file = path.join(__dirname, `${testName}.js`);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mod = require(file);
  if (typeof mod.run !== 'function') {
    throw new Error(`Test "${testName}" does not export run()`);
  }
  return mod;
}

async function runOne(testName) {
  let driver;

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);
    await ensureRoomsSectionReady(driver);

    const test = loadTestModule(testName);
    await test.run(driver, { skipLogin: true });
  } finally {
    if (driver) {
      await driver.deleteSession().catch(() => {});
    }
  }
}

if (require.main === module) {
  const testName = normalizeTestName(process.argv[2]);
  if (!testName) {
    console.error('Usage: node Tests/runSingle.js <testName>');
    process.exit(1);
  }

  runCliTimed(testName, () => runOne(testName)).catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

module.exports = { runOne };
