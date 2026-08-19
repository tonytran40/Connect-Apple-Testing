require('dotenv').config();

const assert = require('node:assert/strict');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');
const { createPublicRoom } = require('./CreateRoom');
const {
  buildUniqueMessage,
  buildUniqueRoomName,
  clickLabeledControl,
  findMessageBubble,
  findVisibleLabeledControl,
  longPressElement,
  readClipboardText,
  typeAndSendMessage,
  waitForLabeledControlHidden,
  waitForMessageAbsent,
} = require('../utils/conversationFeatureFlows');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'MessageActions';

async function openMessageActions(driver, message, requiredAction) {
  const bubble = await findMessageBubble(driver, message, DEFAULT_TIMEOUT);
  await longPressElement(driver, bubble);
  await findVisibleLabeledControl(driver, requiredAction, { timeout: DEFAULT_TIMEOUT });
}

async function runTest(driver, options = {}) {
  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const roomName = process.env.MESSAGE_ACTIONS_ROOM_NAME || buildUniqueRoomName('Message-Actions');
  const message = process.env.MESSAGE_ACTIONS_MESSAGE || buildUniqueMessage('Message-Actions');

  const creation = await createPublicRoom(driver, roomName);
  await typeAndSendMessage(driver, message, DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '01_message_sent.png');

  await openMessageActions(driver, message, 'Copy');
  await saveScreenshot(driver, TEST_NAME, '02_copy_action_open.png');
  await clickLabeledControl(driver, 'Copy', { timeout: DEFAULT_TIMEOUT });
  await waitForLabeledControlHidden(driver, 'Copy', { timeout: DEFAULT_TIMEOUT });

  const copied = await readClipboardText(driver);
  if (copied.available) {
    assert.equal(copied.text, message, 'Copy did not place the exact message body on the clipboard');
  } else {
    // Explicit fallback for Appium/platform combinations without a readable clipboard endpoint.
    await findMessageBubble(driver, message, DEFAULT_TIMEOUT);
    console.warn(
      `MessageActions clipboard fallback: ${copied.reason}. ` +
        'Verified that Copy closed the action sheet and left the source message visible.'
    );
  }

  await openMessageActions(driver, message, 'Delete');
  await saveScreenshot(driver, TEST_NAME, '03_delete_action_open.png');
  await clickLabeledControl(driver, 'Delete', { timeout: DEFAULT_TIMEOUT });
  await findVisibleLabeledControl(driver, 'Delete Message', { timeout: DEFAULT_TIMEOUT });
  await saveScreenshot(driver, TEST_NAME, '04_delete_confirmation.png');

  await clickLabeledControl(driver, 'Delete', { timeout: DEFAULT_TIMEOUT });
  await waitForLabeledControlHidden(driver, 'Delete Message', { timeout: DEFAULT_TIMEOUT });
  await waitForMessageAbsent(driver, message, DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '05_message_deleted.png');
  return { timings: { roomCreationMs: creation.roomCreationMs } };
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
