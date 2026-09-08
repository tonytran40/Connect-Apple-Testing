const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NATIVE_ALERT_SELECTOR,
  SSO_CONTINUE_BUTTON,
  continueWebAuthenticationIfNeeded,
  isWebSignInAlert,
} = require('../utils/systemPrompts');

function hiddenButton() {
  return {
    isDisplayed: async () => false,
    click: async () => {
      throw new Error('hidden button must not be clicked');
    },
  };
}

test('recognizes only the PowerHRG web sign-in confirmation', () => {
  assert.equal(
    isWebSignInAlert('“Connect v3” Wants to Use “powerhrg.com” to Sign In'),
    true
  );
  assert.equal(isWebSignInAlert('powerhrg.com will be used to sign in'), true);
  assert.equal(isWebSignInAlert('“Connect v3” Would Like to Send You Notifications'), false);
});

test('clicks Continue when the scoped iOS sign-in alert is visible', async () => {
  let requestedSelector = '';
  let clicked = false;
  const driver = {
    $: async selector => {
      requestedSelector = selector;
      return {
        isDisplayed: async () => true,
        click: async () => {
          clicked = true;
        },
      };
    },
    pause: async () => {},
  };

  assert.equal(await continueWebAuthenticationIfNeeded(driver), true);
  assert.equal(requestedSelector, SSO_CONTINUE_BUTTON);
  assert.equal(clicked, true);
});

test('falls back to native alert acceptance for the matching sign-in prompt', async () => {
  let accepted = false;
  const driver = {
    $: async selector => selector === NATIVE_ALERT_SELECTOR ? { isDisplayed: async () => true } : hiddenButton(),
    getAlertText: async () => '“Connect v3” Wants to Use “powerhrg.com” to Sign In',
    acceptAlert: async () => {
      accepted = true;
    },
    pause: async () => {},
  };

  assert.equal(await continueWebAuthenticationIfNeeded(driver), true);
  assert.equal(accepted, true);
});

test('leaves unrelated alerts untouched', async () => {
  let accepted = false;
  const driver = {
    $: async selector => selector === NATIVE_ALERT_SELECTOR ? { isDisplayed: async () => true } : hiddenButton(),
    getAlertText: async () => '“Connect v3” Would Like to Send You Notifications',
    acceptAlert: async () => {
      accepted = true;
    },
    pause: async () => {},
  };

  assert.equal(await continueWebAuthenticationIfNeeded(driver), false);
  assert.equal(accepted, false);
});

test('does not request native alert text when no alert is open', async () => {
  let alertTextRequests = 0;
  const driver = {
    $: async () => hiddenButton(),
    getAlertText: async () => {
      alertTextRequests++;
      throw new Error('no alert open');
    },
    acceptAlert: async () => {},
    pause: async () => {},
  };

  assert.equal(await continueWebAuthenticationIfNeeded(driver), false);
  assert.equal(alertTextRequests, 0);
});
