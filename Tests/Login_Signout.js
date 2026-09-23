require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { defineTest } = require('../utils/testHarness');
const { waitForElementDisplayed } = require('../utils/uiTransitions');
const { SELECTORS } = require('../utils/selectors');

const TEST_NAME = 'Login_Signout';

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await saveScreenshot(driver, TEST_NAME, 'Logging.png');
    await saveScreenshot(driver, TEST_NAME, 'Logged_In.png');
  }

  const userSettingsButton = await driver.$(SELECTORS.settingsButton);
  await userSettingsButton.waitForDisplayed({ timeout: 10000 });
  await userSettingsButton.click();
  await saveScreenshot(driver, TEST_NAME, 'User_Settings.png');

  const signOutButton = await driver.$(SELECTORS.logoutButton);
  await signOutButton.waitForDisplayed({ timeout: 10000 });
  await signOutButton.click();
  await waitForElementDisplayed(driver, SELECTORS.loginView, {
    timeout: 10000,
    timeoutMsg: 'Login screen did not appear after signing out',
  });
  await saveScreenshot(driver, TEST_NAME, 'After_Sign_Out_Tap.png');
}

const test = defineTest({ name: TEST_NAME, execute: runTest });
const { run } = test;

module.exports = { run };
test.runIfMain(module);
