require('dotenv').config();
const { createDriver } = require('./Login_Flow/Open_App');

async function run() {
  let driver;

  try {
    driver = await createDriver();

  
    // Double tap logo 
    const logo = await driver.$('~loginView');

    const logoVisible = await logo.isDisplayed().catch(() => false);
    if (logoVisible) {
      await driver.execute('mobile: doubleTap', {
        elementId: logo.elementId,
      });
      console.log('✅ Double-tapped logo (toggled servers button)');
      await driver.pause(800);
    } else {
      console.log('ℹ️ loginView not visible, skipping double tap');
    }

    // Tap Servers button
    const serversButton = await driver.$('~serversButton');
    await serversButton.waitForDisplayed({ timeout: 10000 });
    await serversButton.click();

    console.log('✅ Tapped Servers button (ServerPickerView shown)');
    await driver.pause(800);

    //  Select localhost server
    
    const localhostRow = await driver.$(
      '//XCUIElementTypeCell[.//XCUIElementTypeStaticText[@name="localhost"]]'
    );
    await localhostRow.waitForDisplayed({ timeout: 10000 });
    await localhostRow.click();

    console.log('✅ Selected localhost server');
    await driver.pause(1000);

    
    //  Entering Username and Password
    
    const emailInput = await driver.$('//XCUIElementTypeTextField');
    await emailInput.waitForDisplayed({ timeout: 15000 });
    await emailInput.click();
    await driver.pause(300);
    await emailInput.setValue(process.env.Connect_username);
    await driver.pause(300);

    const passwordInput = await driver.$('//XCUIElementTypeSecureTextField');
    await passwordInput.waitForDisplayed({ timeout: 15000 });
    await passwordInput.click();
    await driver.pause(300);
    await passwordInput.setValue(process.env.Connect_password);
    await driver.pause(300);

    console.log('✅ Filled email & password');

    await driver.saveScreenshot('./screenshots/login_screen.png');
    console.log('📸 Saved screenshot: ./screenshots/login_screen.png');

  } catch (err) {
    console.error('Test failed:', err);

    // Try to capture screenshot on error
    if (driver) {
      try {
        await driver.saveScreenshot('./screenshots/login_error.png');
        console.log('📸 Saved error screenshot: ./screenshots/login_error.png');
      } catch (sErr) {
        console.error('Could not take error screenshot:', sErr);
      }
    }

    // Re-throw so the process exits non-zero
    throw err;

  } finally {
    if (driver) {
      await driver.deleteSession();
    }
  }
}

run().catch((err) => {
  console.error('Top-level failure:', err);
  process.exit(1);
});
