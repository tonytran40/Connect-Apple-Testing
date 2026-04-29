require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');

const TEST_NAME = 'Login_Signout';

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await saveScreenshot(driver, TEST_NAME, 'Logging.png');
    await driver.pause(2000);
    await saveScreenshot(driver, TEST_NAME, 'Logged_In.png');
  }

  const userSettingsButton = await driver.$('~settingsButton');
  await userSettingsButton.waitForDisplayed({ timeout: 10000 });
  await userSettingsButton.click();
  await saveScreenshot(driver, TEST_NAME, 'User_Settings.png');
  await driver.pause(800);

  const signOutButton = await driver.$('~logoutButton');
  await signOutButton.waitForDisplayed({ timeout: 10000 });
  await signOutButton.click();
  await driver.pause(800);
  await saveScreenshot(driver, TEST_NAME, 'After_Sign_Out_Tap.png');
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(activeDriver => runTest(activeDriver, options), driver);
}

module.exports = { run };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
