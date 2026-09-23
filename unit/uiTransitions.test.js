const test = require('node:test');
const assert = require('node:assert/strict');

const {
  waitForAnyElementDisplayed,
  waitForCondition,
  waitForElementEnabled,
  waitForElementHidden,
} = require('../utils/uiTransitions');

function createPollingDriver() {
  return {
    async waitUntil(predicate, options = {}) {
      for (let attempt = 0; attempt < 10; attempt++) {
        if (await predicate()) return true;
      }
      throw new Error(options.timeoutMsg || 'waitUntil timed out');
    },
  };
}

test('waitForCondition returns the observed value instead of adding a fixed pause', async () => {
  const driver = createPollingDriver();
  let attempts = 0;
  const expected = { state: 'ready' };

  const result = await waitForCondition(driver, async () => {
    attempts += 1;
    return attempts === 3 ? expected : false;
  });

  assert.equal(attempts, 3);
  assert.equal(result, expected);
});

test('waitForAnyElementDisplayed resolves the first candidate that becomes visible', async () => {
  const driver = createPollingDriver();
  const hidden = {
    isExisting: async () => true,
    isDisplayed: async () => false,
  };
  const visible = {
    isExisting: async () => true,
    isDisplayed: async () => true,
  };

  assert.equal(await waitForAnyElementDisplayed(driver, [hidden, visible]), visible);
});

test('waitForElementEnabled waits for both visibility and enabled state', async () => {
  const driver = createPollingDriver();
  let enabledChecks = 0;
  const element = {
    isExisting: async () => true,
    isDisplayed: async () => true,
    isEnabled: async () => {
      enabledChecks += 1;
      return enabledChecks >= 2;
    },
  };

  assert.equal(await waitForElementEnabled(driver, element), element);
  assert.equal(enabledChecks, 2);
});

test('waitForElementHidden re-resolves targets until they are removed', async () => {
  const driver = createPollingDriver();
  let resolutions = 0;

  await waitForElementHidden(driver, async () => {
    resolutions += 1;
    return {
      isExisting: async () => resolutions < 3,
      isDisplayed: async () => true,
    };
  });

  assert.equal(resolutions, 3);
});
