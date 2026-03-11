require('dotenv').config();

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot, ensureTestArtifactsDir } = require('../utils/screenshots');

const TEST_NAME = 'Login_Signout';

async function run() {
  let driver;

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);
    await saveScreenshot(driver, TEST_NAME, 'Logging.png');
    await driver.pause(2000);
    await saveScreenshot(driver, TEST_NAME, 'Logged_In.png');

// Open User setting
    const userSettingsButton = await driver.$('~settingsButton');
    await userSettingsButton.waitForDisplayed({ timeout: 10000 });
    await userSettingsButton.click();
    await saveScreenshot(driver, TEST_NAME, 'User_Settings.png');
    await driver.pause(800);

    // Tap Sign Out
    const signOutButton = await driver.$('~logoutButton');
    await signOutButton.waitForDisplayed({ timeout: 10000 });
    await signOutButton.click();
    await driver.pause(800);
    await saveScreenshot(driver, TEST_NAME, 'After_Sign_Out_Tap.png');
    

  } catch (err) {
    console.error('❌ Test failed:', err);
    throw err;
  } finally {
    if (driver) await driver.deleteSession();
  }
}

run().catch(() => process.exit(1));
