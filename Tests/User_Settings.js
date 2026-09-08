require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');
const {
  clickLabeledControl,
  waitForLabeledControlSignature,
  waitForLabeledControlVisualTransition,
  waitForStableLabeledControlSignature,
} = require('../utils/conversationFeatureFlows');
const { tapByText } = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'User_Settings';
const DISPLAY_STYLES = Object.freeze(['Classic', 'Cozy']);
const SORTING_STYLES = Object.freeze(['Recent Activity', 'Alphabetically', 'Self-Managed']);

function booleanEnv(value) {
  return ['1', 'true'].includes(String(value || '').trim().toLowerCase());
}

function resolveChoice(env, name, allowed, fallback) {
  const value = String(env[name] || fallback).trim();
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function resolveUserSettingsFixture(env = process.env) {
  const layout = {
    target: resolveChoice(env, 'USER_SETTINGS_LAYOUT_TARGET', DISPLAY_STYLES, 'Cozy'),
    restore: resolveChoice(env, 'USER_SETTINGS_LAYOUT_RESTORE', DISPLAY_STYLES, 'Classic'),
  };
  const sorting = {
    target: resolveChoice(
      env,
      'USER_SETTINGS_SORT_TARGET',
      SORTING_STYLES,
      'Alphabetically'
    ),
    restore: resolveChoice(
      env,
      'USER_SETTINGS_SORT_RESTORE',
      SORTING_STYLES,
      'Recent Activity'
    ),
  };

  for (const [name, values] of [['layout', layout], ['sorting', sorting]]) {
    if (values.target === values.restore) {
      throw new Error(`User Settings ${name} target and restore values must differ`);
    }
  }

  return {
    layout,
    sorting,
    includeLogout: booleanEnv(env.USER_SETTINGS_INCLUDE_LOGOUT),
  };
}

async function screenshot(driver, name) {
  await saveScreenshot(driver, TEST_NAME, name);
}

async function openUserSettings(driver) {
  const settings = await driver.$(SELECTORS.settingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await settings.click();

  const layoutSection = await driver.$(
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
      'type == "XCUIElementTypeStaticText") AND ' +
      '(name == "Conversation Layout" OR label == "Conversation Layout")'
  );
  await layoutSection.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
}

async function closeUserSettings(driver) {
  const close = await driver.$(SELECTORS.closeButton);
  await close.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await close.click();

  const settings = await driver.$(SELECTORS.settingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
}

async function reopenUserSettings(driver) {
  await closeUserSettings(driver);
  await openUserSettings(driver);
}

async function verifyPersistedSetting(driver, config) {
  const { section, target, restore, screenshotPrefix } = config;

  await tapByText(driver, section, DEFAULT_TIMEOUT);
  await clickLabeledControl(driver, restore, { timeout: DEFAULT_TIMEOUT });
  await driver.pause(500);

  await reopenUserSettings(driver);
  await tapByText(driver, section, DEFAULT_TIMEOUT);
  const targetBaseline = await waitForStableLabeledControlSignature(driver, target);

  await clickLabeledControl(driver, target, { timeout: DEFAULT_TIMEOUT });
  const targetSelected = await waitForLabeledControlVisualTransition(
    driver,
    target,
    targetBaseline
  );

  await reopenUserSettings(driver);
  await tapByText(driver, section, DEFAULT_TIMEOUT);
  await waitForLabeledControlSignature(driver, target, targetSelected);
  await screenshot(driver, `${screenshotPrefix}_target_persisted.png`);

  await clickLabeledControl(driver, restore, { timeout: DEFAULT_TIMEOUT });
  const targetRestored = await waitForLabeledControlVisualTransition(
    driver,
    target,
    targetSelected
  );

  await reopenUserSettings(driver);
  await tapByText(driver, section, DEFAULT_TIMEOUT);
  await waitForLabeledControlSignature(driver, target, targetRestored);
  await screenshot(driver, `${screenshotPrefix}_baseline_restored.png`);
  await tapByText(driver, section, DEFAULT_TIMEOUT);
}

async function runOptInLogoutLogin(driver) {
  const logout = await driver.$(SELECTORS.logoutButton);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await logout.isDisplayed().catch(() => false)) break;
    await driver.execute('mobile: scroll', { direction: 'down' });
    await driver.pause(300);
  }
  await logout.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await logout.click();
  await ensureLoggedIn(driver);

  const settings = await driver.$(SELECTORS.settingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await screenshot(driver, '04_opt_in_logout_login_complete.png');
}

async function runTest(driver, options = {}) {
  const fixture = options.fixture || resolveUserSettingsFixture(options.env || process.env);

  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  await openUserSettings(driver);
  await screenshot(driver, '01_settings_open.png');

  await verifyPersistedSetting(driver, {
    section: 'Conversation Layout',
    ...fixture.layout,
    screenshotPrefix: '02_layout',
  });
  await verifyPersistedSetting(driver, {
    section: 'Conversation Sorting',
    ...fixture.sorting,
    screenshotPrefix: '03_sorting',
  });

  if (fixture.includeLogout) {
    await runOptInLogoutLogin(driver);
  } else {
    await closeUserSettings(driver);
  }

  return {
    notes: fixture.includeLogout
      ? 'Layout and sorting persisted; opt-in logout/login completed'
      : 'Layout and sorting persisted and were restored; logout/login remained isolated',
  };
}

async function run(driver, options = {}) {
  const fixture = options.fixture || resolveUserSettingsFixture(options.env || process.env);
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, { ...options, fixture });
    } catch (error) {
      await screenshot(activeDriver, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = {
  DISPLAY_STYLES,
  SORTING_STYLES,
  booleanEnv,
  resolveUserSettingsFixture,
  run,
  runTest,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
