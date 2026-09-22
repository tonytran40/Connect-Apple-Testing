const DEFAULT_POLL_MS = 150;
const NATIVE_ALERT_SELECTOR = '//XCUIElementTypeAlert';
const SYSTEM_ALERTS_CONFIGURED = new WeakSet();

const SSO_CONTINUE_BUTTON =
  '//XCUIElementTypeAlert[' +
  './/XCUIElementTypeStaticText[contains(@name,"powerhrg.com") or ' +
  'contains(@label,"powerhrg.com")]]' +
  '//XCUIElementTypeButton[@name="Continue" or @label="Continue"]';

function isWebSignInAlert(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return (
    /wants to use.+to sign in/i.test(value) ||
    /powerhrg\.com.+sign in/i.test(value)
  );
}

async function exposeSystemAlertsToXctest(driver) {
  if (
    !driver ||
    (typeof driver !== 'object' && typeof driver !== 'function') ||
    typeof driver.updateSettings !== 'function'
  ) {
    return false;
  }
  if (SYSTEM_ALERTS_CONFIGURED.has(driver)) return true;

  await driver.updateSettings({ respectSystemAlerts: true });
  SYSTEM_ALERTS_CONFIGURED.add(driver);
  return true;
}

async function acceptNativeWebSignInAlert(driver) {
  if (typeof driver.getAlertText !== 'function' || typeof driver.acceptAlert !== 'function') {
    return false;
  }

  // WebdriverIO logs a protocol error before a missing getAlertText() request
  // can be caught. Querying the XCTest hierarchy first keeps normal runs quiet.
  const alert = await driver.$(NATIVE_ALERT_SELECTOR);
  if (!(await alert.isDisplayed().catch(() => false))) return false;

  const alertText = await driver.getAlertText().catch(() => '');
  if (!isWebSignInAlert(alertText)) return false;

  await driver.acceptAlert();
  return true;
}

async function clickWebSignInContinue(driver) {
  const continueButton = await driver.$(SSO_CONTINUE_BUTTON);
  if (!(await continueButton.isDisplayed().catch(() => false))) return false;

  await continueButton.click();
  return true;
}

async function continueWebAuthenticationIfNeeded(driver, options = {}) {
  await exposeSystemAlertsToXctest(driver).catch(() => false);
  const timeout = Math.max(0, Number(options.timeout) || 0);
  const pollMs = Math.max(50, Number(options.pollMs) || DEFAULT_POLL_MS);
  const deadline = Date.now() + timeout;

  do {
    const handled =
      (await clickWebSignInContinue(driver).catch(() => false)) ||
      (await acceptNativeWebSignInAlert(driver).catch(() => false));

    if (handled) {
      console.log('Approved the iOS PowerHRG web sign-in prompt');
      await driver.pause(options.settleMs ?? 300);
      return true;
    }

    if (Date.now() < deadline) await driver.pause(pollMs);
  } while (Date.now() < deadline);

  return false;
}

module.exports = {
  NATIVE_ALERT_SELECTOR,
  SSO_CONTINUE_BUTTON,
  continueWebAuthenticationIfNeeded,
  exposeSystemAlertsToXctest,
  isWebSignInAlert,
};
