const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APP_STATE,
  backgroundAndReactivate,
  clearComposer,
  createUniqueSystemValue,
  waitForAppState,
  waitForComposerValue,
} = require('../utils/systemFlowDraft');
const draftPersistence = require('../Tests/DraftPersistence');

function addDeterministicWaitUntil(driver, attempts = 8) {
  driver.waitUntil = async (predicate, options = {}) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (await predicate()) return true;
    }
    throw new Error(options.timeoutMsg || 'waitUntil timed out');
  };
  return driver;
}

test('createUniqueSystemValue creates deterministic sortable values with injected inputs', () => {
  assert.equal(
    createUniqueSystemValue('A-Draft-Persistence-Room', {
      now: 123456,
      token: 'test-token_123',
    }),
    'A-Draft-Persistence-Room-2n9c-testtoken123'
  );
});

test('DraftPersistence exposes both suite and direct test entry points', () => {
  assert.equal(typeof draftPersistence.run, 'function');
  assert.equal(typeof draftPersistence.runTest, 'function');
});

test('waitForAppState accepts either suspended or background Appium states', async () => {
  const states = [APP_STATE.FOREGROUND, APP_STATE.BACKGROUND_SUSPENDED];
  const driver = addDeterministicWaitUntil({
    queryAppState: async () => states.shift(),
  });

  const state = await waitForAppState(
    driver,
    'com.example.app',
    [APP_STATE.BACKGROUND_SUSPENDED, APP_STATE.BACKGROUND]
  );

  assert.equal(state, APP_STATE.BACKGROUND_SUSPENDED);
});

test('backgroundAndReactivate uses Appium and observes each lifecycle state', async () => {
  const calls = [];
  const states = [APP_STATE.FOREGROUND, APP_STATE.BACKGROUND, APP_STATE.FOREGROUND];
  const driver = addDeterministicWaitUntil({
    queryAppState: async appId => {
      calls.push(['queryAppState', appId]);
      return states.shift();
    },
    execute: async (command, args) => calls.push(['execute', command, args]),
    activateApp: async appId => calls.push(['activateApp', appId]),
  });

  const backgroundState = await backgroundAndReactivate(driver, 'com.example.app');

  assert.equal(backgroundState, APP_STATE.BACKGROUND);
  assert.deepEqual(calls, [
    ['queryAppState', 'com.example.app'],
    ['execute', 'mobile: pressButton', { name: 'home' }],
    ['queryAppState', 'com.example.app'],
    ['activateApp', 'com.example.app'],
    ['queryAppState', 'com.example.app'],
  ]);
});

test('waitForComposerValue polls until the exact composer value is observable', async () => {
  const values = ['partial', 'Unsent draft-123'];
  const composer = {
    isDisplayed: async () => true,
    getValue: async () => values.shift(),
  };
  const driver = addDeterministicWaitUntil({ $: async () => composer });

  const found = await waitForComposerValue(driver, 'Unsent draft-123');

  assert.equal(found, composer);
});

test('clearComposer clears and verifies the composer value', async () => {
  let value = 'Unsent draft-123';
  const composer = {
    isDisplayed: async () => true,
    click: async () => {},
    clearValue: async () => {
      value = '';
    },
    getValue: async () => value,
  };
  const driver = addDeterministicWaitUntil({ $: async () => composer });

  const cleared = await clearComposer(driver);

  assert.equal(cleared, composer);
  assert.equal(value, '');
});
