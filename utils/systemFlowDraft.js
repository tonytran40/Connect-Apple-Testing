const { randomUUID } = require('crypto');

const { SELECTORS } = require('./selectors');
const { ensureRoomsSectionReady, goBack } = require('./testSession');

const APP_STATE = Object.freeze({
  NOT_RUNNING: 1,
  BACKGROUND_SUSPENDED: 2,
  BACKGROUND: 3,
  FOREGROUND: 4,
});

const COMPOSER_SELECTORS = Object.freeze([
  SELECTORS.roomComposerTextView,
  SELECTORS.messageComposerTextView,
]);

function createUniqueSystemValue(prefix, options = {}) {
  const normalizedPrefix = String(prefix || '').trim();
  if (!normalizedPrefix) {
    throw new Error('createUniqueSystemValue requires a non-empty prefix');
  }

  const now = options.now ?? Date.now();
  const token = String(options.token ?? randomUUID())
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12);

  if (!token) {
    throw new Error('createUniqueSystemValue requires an alphanumeric token');
  }

  return `${normalizedPrefix}-${Number(now).toString(36)}-${token}`;
}

function appStateName(state) {
  return Object.entries(APP_STATE).find(([, value]) => value === state)?.[0] || `UNKNOWN(${state})`;
}

async function waitForAppState(driver, appId, acceptedStates, options = {}) {
  const states = Array.isArray(acceptedStates) ? acceptedStates : [acceptedStates];
  const timeout = options.timeout ?? 15000;
  const interval = options.interval ?? 100;
  let observedState;

  if (!states.length || states.some(state => !Number.isInteger(state))) {
    throw new Error('waitForAppState requires one or more numeric Appium app states');
  }

  await driver.waitUntil(
    async () => {
      observedState = Number(await driver.queryAppState(appId));
      return states.includes(observedState);
    },
    {
      timeout,
      interval,
      timeoutMsg:
        `App ${appId} did not reach state ` +
        `${states.map(appStateName).join(' or ')} within ${timeout}ms`,
    }
  );

  return observedState;
}

async function ensureAppForeground(driver, appId, options = {}) {
  const currentState = Number(await driver.queryAppState(appId));
  if (currentState !== APP_STATE.FOREGROUND) {
    await driver.activateApp(appId);
  }

  return waitForAppState(driver, appId, APP_STATE.FOREGROUND, options);
}

async function backgroundAndReactivate(driver, appId, options = {}) {
  await waitForAppState(driver, appId, APP_STATE.FOREGROUND, options);
  await driver.execute('mobile: pressButton', { name: 'home' });

  const backgroundState = await waitForAppState(
    driver,
    appId,
    [APP_STATE.BACKGROUND_SUSPENDED, APP_STATE.BACKGROUND],
    options
  );

  await driver.activateApp(appId);
  await waitForAppState(driver, appId, APP_STATE.FOREGROUND, options);

  return backgroundState;
}

async function findVisibleComposer(driver, selectors = COMPOSER_SELECTORS) {
  for (const selector of selectors) {
    const composer = await driver.$(selector);
    if (await composer.isDisplayed().catch(() => false)) {
      return composer;
    }
  }

  return null;
}

async function waitForVisibleComposer(driver, options = {}) {
  const timeout = options.timeout ?? 20000;
  const interval = options.interval ?? 100;
  const selectors = options.selectors || COMPOSER_SELECTORS;
  let composer;

  await driver.waitUntil(
    async () => {
      composer = await findVisibleComposer(driver, selectors);
      return Boolean(composer);
    },
    {
      timeout,
      interval,
      timeoutMsg: `No message composer became visible within ${timeout}ms`,
    }
  );

  return composer;
}

async function readComposerValue(composer) {
  try {
    const value = await composer.getValue();
    return value == null ? '' : String(value);
  } catch {
    const value = await composer.getAttribute('value');
    return value == null ? '' : String(value);
  }
}

async function waitForComposerValue(driver, expectedValue, options = {}) {
  const expected = String(expectedValue);
  const timeout = options.timeout ?? 20000;
  const interval = options.interval ?? 100;
  const selectors = options.selectors || COMPOSER_SELECTORS;
  let composer;
  let observedValue = '<composer not visible>';

  try {
    await driver.waitUntil(
      async () => {
        composer = await findVisibleComposer(driver, selectors);
        if (!composer) return false;

        observedValue = await readComposerValue(composer);
        return observedValue === expected;
      },
      {
        timeout,
        interval,
        timeoutMsg: `Composer did not reach the expected value within ${timeout}ms`,
      }
    );
  } catch (error) {
    throw new Error(
      `Composer did not equal ${JSON.stringify(expected)} within ${timeout}ms; ` +
        `last value was ${JSON.stringify(observedValue)}`,
      { cause: error }
    );
  }

  return composer;
}

async function clearComposer(driver, options = {}) {
  const composer = await waitForVisibleComposer(driver, options);
  await composer.click();

  if (typeof composer.clearValue === 'function') {
    try {
      await composer.clearValue();
    } catch {
      await composer.setValue('');
    }
  } else {
    await composer.setValue('');
  }

  return waitForComposerValue(driver, '', options);
}

async function restoreRoomsList(driver) {
  if (await findVisibleComposer(driver)) {
    await goBack(driver, 0);
  }
  await ensureRoomsSectionReady(driver);
}

module.exports = {
  APP_STATE,
  backgroundAndReactivate,
  clearComposer,
  createUniqueSystemValue,
  ensureAppForeground,
  findVisibleComposer,
  readComposerValue,
  restoreRoomsList,
  waitForAppState,
  waitForComposerValue,
  waitForVisibleComposer,
};
