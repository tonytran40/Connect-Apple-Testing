require('dotenv').config();

const { SELECTORS, PREDICATES } = require('../utils/selectors');
const { allowNotificationPromptIfNeeded } = require('../utils/permissions');
const { resetToHome } = require('../utils/testSession');

function intEnv(name, fallback, min, max) {
  const n = Number.parseInt(process.env[name], 10);
  const v = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

const LOGIN_SUCCESS_TIMEOUT_MS = intEnv('LOGIN_SUCCESS_TIMEOUT_MS', 60000, 5000, 180000);
const LOGIN_POLL_MS = intEnv('LOGIN_POLL_MS', 500, 100, 3000);
// Cold simulator launches can take materially longer than warm lane reuse. This
// is only a ceiling: polling still continues immediately once Connect is ready.
const APP_ENTRY_TIMEOUT_MS = intEnv('APP_ENTRY_TIMEOUT_MS', 30000, 3000, 120000);
const APP_ENTRY_POLL_MS = intEnv('APP_ENTRY_POLL_MS', 250, 100, 1000);
const APP_ENTRY_RECOVERY_MS = intEnv('APP_ENTRY_RECOVERY_MS', 4000, 1000, 15000);

async function isOnLoginScreen(driver) {
  return visible(driver, SELECTORS.loginView, 250);
}

async function visible(driver, selector, timeout = 500) {
  try {
    const el = await driver.$(selector);
    await el.waitForDisplayed({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function isLoggedInSignalVisible(driver) {
  const selectors = [
    SELECTORS.settingsButton,
    SELECTORS.peoplePlusButton,
    SELECTORS.newConversationButton,
    SELECTORS.roomsSectionHeader,
    PREDICATES.roomsHeaderButton,
  ];

  for (const selector of selectors) {
    if (await visible(driver, selector, 350)) {
      return true;
    }
  }

  return false;
}

async function waitForAppEntryState(driver) {
  const deadline = Date.now() + APP_ENTRY_TIMEOUT_MS;
  const recoveryAt = Date.now() + Math.min(APP_ENTRY_RECOVERY_MS, APP_ENTRY_TIMEOUT_MS);
  let recoveryAttempted = false;

  while (Date.now() < deadline) {
    if (await isOnLoginScreen(driver)) return 'login';
    if (await isLoggedInSignalVisible(driver)) return 'home';

    if (!recoveryAttempted && Date.now() >= recoveryAt) {
      recoveryAttempted = true;
      console.log('Login preflight: recovering from an unfinished in-app flow');
      await resetToHome(driver, 8);
      continue;
    }

    await driver.pause(APP_ENTRY_POLL_MS);
  }

  throw new Error(
    `Connect did not reach either login or the conversation list within ${APP_ENTRY_TIMEOUT_MS}ms`
  );
}

async function loginErrorText(driver) {
  const selectors = [
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND (label CONTAINS[c] "issue logging in" OR name CONTAINS[c] "issue logging in")',
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND (label CONTAINS[c] "Please try again" OR name CONTAINS[c] "Please try again")',
  ];

  for (const selector of selectors) {
    try {
      const el = await driver.$(selector);
      if (await el.isDisplayed().catch(() => false)) {
        const label = await el.getAttribute('label').catch(() => '');
        const name = label ? '' : await el.getAttribute('name').catch(() => '');
        return String(label || name || 'Login error').trim();
      }
    } catch {}
  }

  return '';
}

async function doubleTapViewport(driver, x, y) {
  await driver.performActions([
    {
      type: 'pointer',
      id: 'loginRevealTap',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
        { type: 'pause', duration: 80 },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions().catch(() => {});
}

async function revealServersButton(driver, logoArea) {
  const serversButton = await driver.$(SELECTORS.serversButton);
  const win = await driver.getWindowRect();
  const taps = [
    async () => driver.execute('mobile: doubleTap', { elementId: logoArea.elementId }),
    async () => doubleTapViewport(driver, Math.round(win.width * 0.5), Math.round(win.height * 0.16)),
    async () => doubleTapViewport(driver, Math.round(win.width * 0.5), Math.round(win.height * 0.50)),
  ];

  for (let i = 0; i < taps.length; i++) {
    await taps[i]();
    if (await serversButton.waitForDisplayed({ timeout: 2500 }).then(() => true).catch(() => false)) {
      return serversButton;
    }
  }

  const error = await loginErrorText(driver);
  if (error) {
    throw new Error(`Could not reveal server picker; app is showing login error "${error}"`);
  }

  throw new Error('Could not reveal server picker; ~serversButton was not displayed after logo double-tap retries');
}

async function waitForLoginSuccess(driver) {
  const started = Date.now();

  while (Date.now() - started < LOGIN_SUCCESS_TIMEOUT_MS) {
    if (await isLoggedInSignalVisible(driver)) {
      console.log('✅ Login confirmed');
      return;
    }

    const error = await loginErrorText(driver);
    if (error) {
      throw new Error(`Login failed: app displayed "${error}"`);
    }

    await driver.pause(LOGIN_POLL_MS);
  }

  throw new Error(`Login did not reach the conversation list within ${LOGIN_SUCCESS_TIMEOUT_MS}ms`);
}

async function ensureLoggedIn(driver) {
  const entryState = await waitForAppEntryState(driver);

  if (entryState === 'home') {
    console.log('Already logged in (loginView not present). Skipping login flow.');
    await allowNotificationPromptIfNeeded(driver);
    return;
  }

  console.log('ℹ️ On login screen. Running login flow...');

  // double-tap logo area to reveal Servers button
  const logoArea = await driver.$(SELECTORS.loginView);
  await logoArea.waitForDisplayed({ timeout: 15000 });

  // tap Servers
  const serversButton = await revealServersButton(driver, logoArea);
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
  const loginBtn = await driver.$(SELECTORS.loginButton);
  await loginBtn.waitForEnabled({ timeout: 15000 });
  await loginBtn.click();

  console.log('✅ Login submitted');
  await waitForLoginSuccess(driver);
  await allowNotificationPromptIfNeeded(driver);
}

module.exports = { ensureLoggedIn };
