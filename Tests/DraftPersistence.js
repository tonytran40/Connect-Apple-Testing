require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { ensureRoomsSectionReady } = require('../utils/testSession');
const { defineTest } = require('../utils/testHarness');
const { typeComposerMessage } = require('../utils/uiActions');
const {
  backgroundAndReactivate,
  clearComposer,
  createUniqueSystemValue,
  ensureAppForeground,
  restoreRoomsList,
  waitForComposerValue,
} = require('../utils/systemFlowDraft');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'DraftPersistence';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.SYSTEM_FLOW_TIMEOUT_MS, 10) || 20000;
const BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const waitOptions = { timeout: DEFAULT_TIMEOUT };
  const roomName = createUniqueSystemValue('A-Draft-Persistence-Room');
  const draftText = createUniqueSystemValue('Unsent draft');
  let draftMayExist = false;
  let primaryError;

  try {
    if (!skipLogin) {
      await ensureLoggedIn(driver);
    }
    await ensureRoomsSectionReady(driver);

    console.log(`DraftPersistence: creating ${roomName}`);
    const creation = await createPublicRoom(driver, roomName);

    draftMayExist = true;
    await typeComposerMessage(driver, draftText, DEFAULT_TIMEOUT);
    await waitForComposerValue(driver, draftText, waitOptions);
    await saveScreenshot(driver, TEST_NAME, '01_draft_entered.png');

    const backgroundState = await backgroundAndReactivate(
      driver,
      BUNDLE_ID,
      waitOptions
    );
    console.log(`DraftPersistence: observed background app state ${backgroundState}`);

    await waitForComposerValue(driver, draftText, waitOptions);
    await saveScreenshot(driver, TEST_NAME, '02_draft_after_reactivation.png');

    await clearComposer(driver, waitOptions);
    draftMayExist = false;
    console.log('DraftPersistence: verified the composer was cleared');
    return { timings: { roomCreationMs: creation.roomCreationMs } };
  } catch (error) {
    primaryError = error;
    try {
      await saveScreenshot(driver, TEST_NAME, 'ERROR.png');
    } catch {}
    throw error;
  } finally {
    try {
      await ensureAppForeground(driver, BUNDLE_ID, waitOptions);
      if (draftMayExist) {
        await clearComposer(driver, waitOptions);
      }
      await restoreRoomsList(driver);
      console.log('DraftPersistence: restored the Rooms list with an empty draft');
    } catch (cleanupError) {
      if (!primaryError) {
        throw cleanupError;
      }
      console.warn(`DraftPersistence cleanup failed: ${cleanupError.message}`);
    }
  }
}

const test = defineTest({
  name: TEST_NAME,
  execute: runTest,
  // runTest captures before cleanup restores the Rooms list, preserving the existing evidence.
  captureErrorScreenshot: false,
});
const { run } = test;

module.exports = { run, runTest };
test.runIfMain(module);
