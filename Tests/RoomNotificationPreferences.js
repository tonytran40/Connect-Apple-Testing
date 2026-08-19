require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  ensureRoomsSectionReady,
  goBack,
  runWithOptionalDriver,
  waitForConversationRow,
} = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');
const { createPublicRoom } = require('./CreateRoom');
const {
  buildLabelPredicate,
  buildUniqueRoomName,
  clickLabeledControl,
  resolveNotificationLabels,
  waitForLabeledControlSignature,
  waitForLabeledControlVisualTransition,
  waitForStableLabeledControlSignature,
} = require('../utils/conversationFeatureFlows');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'RoomNotificationPreferences';
const PREFERENCES_TITLE = 'Notification Preferences';
const PREFERENCES_TITLE_SELECTOR = buildLabelPredicate(PREFERENCES_TITLE, {
  types: ['XCUIElementTypeStaticText'],
});

async function isDisplayed(driver, selector) {
  return (await driver.$(selector)).isDisplayed().catch(() => false);
}

async function firstDisplayed(driver, selector) {
  const elements = await driver.$$(selector).catch(() => []);
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return null;
}

async function waitForPreferencesScreen(driver) {
  const deadline = Date.now() + DEFAULT_TIMEOUT;
  while (Date.now() < deadline) {
    if (await firstDisplayed(driver, PREFERENCES_TITLE_SELECTOR)) return;
    await driver.pause(175);
  }
  throw new Error('Notification Preferences screen did not appear');
}

async function isPreferencesScreenOpen(driver) {
  return Boolean(await firstDisplayed(driver, PREFERENCES_TITLE_SELECTOR));
}

async function openPreferencesFromRoom(driver) {
  const settings = await driver.$(SELECTORS.openRoomSettingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await settings.click();

  const preferences = await driver.$(SELECTORS.notificationPreferencesButton);
  await preferences.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await preferences.click();
  await waitForPreferencesScreen(driver);
}

async function reopenPreferencesFromSettings(driver) {
  const preferences = await driver.$(SELECTORS.notificationPreferencesButton);
  await preferences.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await preferences.click();
  await waitForPreferencesScreen(driver);
}

async function returnToSettings(driver) {
  await goBack(driver, 0);
  const preferences = await driver.$(SELECTORS.notificationPreferencesButton);
  await preferences.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
}

async function ensurePreferencesOpen(driver, roomName) {
  if (await isPreferencesScreenOpen(driver)) return;

  if (await isDisplayed(driver, SELECTORS.notificationPreferencesButton)) {
    await reopenPreferencesFromSettings(driver);
    return;
  }

  if (await isDisplayed(driver, SELECTORS.openRoomSettingsButton)) {
    await openPreferencesFromRoom(driver);
    return;
  }

  await ensureRoomsSectionReady(driver);
  const { el: room } = await waitForConversationRow(driver, roomName, {
    exact: true,
    timeout: DEFAULT_TIMEOUT,
  });
  await room.click();
  await openPreferencesFromRoom(driver);
}

async function closeSettingsToRoom(driver) {
  if (await isPreferencesScreenOpen(driver)) {
    await returnToSettings(driver);
  }

  const close = await driver.$(SELECTORS.closeButton);
  await close.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await close.click();

  const settings = await driver.$(SELECTORS.openRoomSettingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
}

async function runTest(driver, options = {}) {
  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const roomName = process.env.ROOM_NOTIFICATION_ROOM_NAME ||
    buildUniqueRoomName('Notification-Preferences');
  const labels = resolveNotificationLabels(process.env);
  let roomCreationMs = 0;
  let roomCreated = false;
  let primaryError;

  try {
    const creation = await createPublicRoom(driver, roomName);
    roomCreationMs = creation.roomCreationMs;
    roomCreated = true;
    await saveScreenshot(driver, TEST_NAME, '01_room_opened.png');

    await openPreferencesFromRoom(driver);
    const initialSignature = await waitForStableLabeledControlSignature(driver, labels.target);
    await saveScreenshot(driver, TEST_NAME, '02_preferences_open.png');

    // Preference rows expose no source identifier or semantic selected value.
    await clickLabeledControl(driver, labels.target, {
      allowContains: true,
      timeout: DEFAULT_TIMEOUT,
    });
    const selectedSignature = await waitForLabeledControlVisualTransition(
      driver,
      labels.target,
      initialSignature
    );
    await saveScreenshot(driver, TEST_NAME, '03_preference_selected.png');

    await returnToSettings(driver);
    await reopenPreferencesFromSettings(driver);
    await waitForLabeledControlSignature(driver, labels.target, selectedSignature);
    await saveScreenshot(driver, TEST_NAME, '04_preference_persisted.png');
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (roomCreated) {
      try {
        await ensurePreferencesOpen(driver, roomName);
        const restoreBaseline = await waitForStableLabeledControlSignature(driver, labels.restore);
        await clickLabeledControl(driver, labels.restore, {
          allowContains: true,
          timeout: DEFAULT_TIMEOUT,
        });
        const restoredSignature = await waitForLabeledControlVisualTransition(
          driver,
          labels.restore,
          restoreBaseline
        );

        await returnToSettings(driver);
        await reopenPreferencesFromSettings(driver);
        await waitForLabeledControlSignature(driver, labels.restore, restoredSignature);
        await saveScreenshot(driver, TEST_NAME, '05_restore_persisted.png');
        await closeSettingsToRoom(driver);
      } catch (cleanupError) {
        if (!primaryError) throw cleanupError;
        console.error(`Room notification preference restore failed: ${cleanupError.message}`);
      }
    }
  }
  return { timings: { roomCreationMs } };
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = { run, runTest };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
