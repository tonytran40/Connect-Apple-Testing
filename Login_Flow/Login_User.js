require('dotenv').config();

async function exists(el, timeout = 1500) {
  try {
    await el.waitForExist({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function isOnLoginScreen(driver) {
  return exists(driver.$('~loginView'), 1500);
}

async function ensureLoggedIn(driver) {
  const onLogin = await isOnLoginScreen(driver);

  if (!onLogin) {
    console.log('Already logged in (loginView not present). Skipping login flow.');
    return;
  }

  console.log('ℹ️ On login screen. Running login flow...');

  // double-tap logo area to reveal Servers button
  const logoArea = await driver.$('~loginView');
  await logoArea.waitForDisplayed({ timeout: 15000 });

  await driver.execute('mobile: doubleTap', { elementId: logoArea.elementId });

  // tap Servers
  const serversButton = await driver.$('~serversButton');
  await serversButton.waitForDisplayed({ timeout: 15000 });
  await serversButton.click();

  // select localhost
  const localhostRow = await driver.$(
    '//XCUIElementTypeCell[.//XCUIElementTypeStaticText[@name="localhost"]]'
  );
  await localhostRow.waitForDisplayed({ timeout: 15000 });
  await localhostRow.click();

  // fill email + password
  const emailInput = await driver.$('//XCUIElementTypeTextField');
  await emailInput.waitForDisplayed({ timeout: 15000 });
  await emailInput.setValue(process.env.Connect_username);

  const passwordInput = await driver.$('//XCUIElementTypeSecureTextField');
  await passwordInput.waitForDisplayed({ timeout: 15000 });
  await passwordInput.setValue(process.env.Connect_password);

  // tap login
  const loginBtn = await driver.$('~loginButton');
  await loginBtn.waitForEnabled({ timeout: 15000 });
  await loginBtn.click();

  console.log('✅ Login submitted');
}

module.exports = { ensureLoggedIn };
