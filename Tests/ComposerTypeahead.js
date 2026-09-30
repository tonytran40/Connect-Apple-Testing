require('dotenv').config();

const assert = require('node:assert/strict');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { defineTest } = require('../utils/testHarness');
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
const TYPEAHEAD_STEP_TIMEOUT = 1200;
const TEST_NAME = 'ComposerTypeahead';
const EMOJI_SHORTCODE = 'grinning_face';
const EMOJI_CHARACTER = '😀';

function progressiveShortcodePrefixes(shortcode, startingPrefix = 'grin') {
  const normalizedShortcode = String(shortcode || '').trim();
  const normalizedPrefix = String(startingPrefix || '').trim();
  if (!normalizedShortcode.startsWith(normalizedPrefix)) {
    throw new Error(`Shortcode "${normalizedShortcode}" does not start with "${normalizedPrefix}"`);
  }

  return Array.from(
    { length: normalizedShortcode.length - normalizedPrefix.length + 1 },
    (_, index) => normalizedShortcode.slice(0, normalizedPrefix.length + index)
  );
}

async function revealEmojiTypeahead(driver, shortcode, optionLabel) {
  const prefixes = progressiveShortcodePrefixes(shortcode);
  await setComposerValue(driver, `:${prefixes[0]}`, DEFAULT_TIMEOUT);

  for (let index = 0; index < prefixes.length; index++) {
    const prefix = prefixes[index];
    if (index > 0) {
      await appendComposerValue(driver, prefix.slice(-1), DEFAULT_TIMEOUT);
    }

    try {
      const timeout = index === prefixes.length - 1 ? DEFAULT_TIMEOUT : TYPEAHEAD_STEP_TIMEOUT;
      const option = await findTypeaheadOption(driver, optionLabel, timeout);
      console.log(`ComposerTypeahead: emoji option appeared after typing ":${prefix}"`);
      return option;
    } catch (error) {
      if (index === prefixes.length - 1) throw error;
    }
  }

  throw new Error(`Emoji typeahead option "${optionLabel}" did not appear`);
}

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

  // Emoji typeahead rows do not expose identifiers, so use the source-rendered shortcode label.
  await revealEmojiTypeahead(driver, EMOJI_SHORTCODE, emojiOptionLabel);
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

const test = defineTest({ name: TEST_NAME, execute: runTest });
const { run } = test;

module.exports = { progressiveShortcodePrefixes, revealEmojiTypeahead, run, runTest };
test.runIfMain(module);
