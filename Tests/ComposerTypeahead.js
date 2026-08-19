require('dotenv').config();

const assert = require('node:assert/strict');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');
const { createPublicRoom } = require('./CreateRoom');
const {
  accessibleTextContainsParts,
  appendComposerValue,
  buildUniqueMessage,
  buildUniqueRoomName,
  findTypeaheadOption,
  messageAttributes,
  selectTypeaheadOption,
  sendCurrentComposer,
  setComposerValue,
  waitForComposerText,
} = require('../utils/conversationFeatureFlows');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'ComposerTypeahead';
const EMOJI_SHORTCODE = 'grinning_face';
const EMOJI_CHARACTER = '😀';

async function runTest(driver, options = {}) {
  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const roomName = process.env.COMPOSER_TYPEAHEAD_ROOM_NAME ||
    buildUniqueRoomName('Composer-Typeahead');
  const marker = buildUniqueMessage('Typeahead');
  const emojiOptionLabel = `:${EMOJI_SHORTCODE}:`;

  const creation = await createPublicRoom(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '01_room_opened.png');

  await setComposerValue(driver, `:${EMOJI_SHORTCODE}`, DEFAULT_TIMEOUT);
  // Emoji typeahead rows do not expose identifiers, so use the source-rendered shortcode label.
  await findTypeaheadOption(driver, emojiOptionLabel, DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '02_emoji_typeahead.png');
  await selectTypeaheadOption(driver, emojiOptionLabel, DEFAULT_TIMEOUT);
  await waitForComposerText(driver, EMOJI_CHARACTER, DEFAULT_TIMEOUT);

  await appendComposerValue(driver, ` ${marker}`, DEFAULT_TIMEOUT);
  const messageBubble = await sendCurrentComposer(driver, marker, DEFAULT_TIMEOUT);
  const attributes = await messageAttributes(messageBubble);
  assert.equal(
    accessibleTextContainsParts(attributes, [EMOJI_CHARACTER, marker]),
    true,
    `Sent typeahead message did not contain the selected emoji and marker: ${JSON.stringify(attributes)}`
  );
  await saveScreenshot(driver, TEST_NAME, '03_typeahead_message_sent.png');
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
