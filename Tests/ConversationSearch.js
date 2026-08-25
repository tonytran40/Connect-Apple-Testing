require('dotenv').config();

const assert = require('node:assert/strict');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');
const { createPublicRoom } = require('./CreateRoom');
const { addQuickReaction } = require('./Reactions');
const {
  buildUniqueRoomName,
  typeAndSendMessage,
} = require('../utils/conversationFeatureFlows');
const { escapePredicateString, getElementRect, tapByText } = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'ConversationSearch';
const SEARCH_RETRY_INTERVAL_MS = 1200;

function visibleTextPredicate(text, { exact = false } = {}) {
  const safe = escapePredicateString(text);
  const comparison = exact ? '==' : 'CONTAINS';
  return (
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
    'type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeOther") AND ' +
    `(name ${comparison} "${safe}" OR label ${comparison} "${safe}")`
  );
}

async function firstVisible(driver, selector) {
  const elements = await driver.$$(selector);
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return null;
}

async function waitForVisibleText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  const selector = visibleTextPredicate(text);
  while (Date.now() < deadline) {
    const element = await firstVisible(driver, selector);
    if (element) return element;
    await driver.pause(175);
  }
  throw new Error(`Conversation search did not display "${text}"`);
}

async function isTextVisible(driver, text) {
  return Boolean(await firstVisible(driver, visibleTextPredicate(text)));
}

async function submitSearch(driver, query) {
  const field = await driver.$(SELECTORS.searchInputTextView);
  await field.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await field.click();
  await field.setValue(query);
  await driver.keys(['\uE007']);
}

async function searchUntilIndexed(driver, query, expectedMessages, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    await submitSearch(driver, query);

    const attemptDeadline = Math.min(deadline, Date.now() + SEARCH_RETRY_INTERVAL_MS);
    while (Date.now() < attemptDeadline) {
      const visible = await Promise.all(expectedMessages.map(message => isTextVisible(driver, message)));
      if (visible.every(Boolean)) return attempts;
      await driver.pause(175);
    }
  }

  throw new Error(
    `Conversation search did not index all seeded messages for "${query}" within ${timeout}ms`
  );
}

async function verticalPosition(driver, text) {
  const element = await waitForVisibleText(driver, text);
  const rect = await getElementRect(element);
  return rect.y;
}

async function waitForOrder(driver, first, second, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const [firstY, secondY] = await Promise.all([
      verticalPosition(driver, first),
      verticalPosition(driver, second),
    ]);
    if (firstY < secondY) return;
    await driver.pause(200);
  }
  throw new Error(`Expected "${first}" to appear above "${second}" in search results`);
}

async function waitForReactionNearMessage(
  driver,
  messagePrefix,
  emoji,
  timeout = DEFAULT_TIMEOUT
) {
  const deadline = Date.now() + timeout;
  const emojiSelector = visibleTextPredicate(emoji);

  while (Date.now() < deadline) {
    const messageElement = await firstVisible(driver, visibleTextPredicate(messagePrefix));
    const emojiElements = await driver.$$(emojiSelector);
    if (messageElement) {
      const messageRect = await getElementRect(messageElement);
      const messageCenterY = messageRect.y + messageRect.height / 2;
      const tolerance = Math.max(90, messageRect.height);

      for (const element of emojiElements) {
        if (!(await element.isDisplayed().catch(() => false))) continue;
        const emojiRect = await getElementRect(element);
        const emojiCenterY = emojiRect.y + emojiRect.height / 2;
        if (Math.abs(messageCenterY - emojiCenterY) <= tolerance) return element;
      }
    }
    await driver.pause(200);
  }

  throw new Error(
    `Expected reaction ${emoji} to render with search result "${messagePrefix}"`
  );
}

async function openSearch(driver) {
  const searchButton = await driver.$(SELECTORS.chatSearchButton);
  await searchButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await searchButton.click();

  const field = await driver.$(SELECTORS.searchInputTextView);
  await field.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
}

async function selectSearchResult(driver, message) {
  const result = await waitForVisibleText(driver, message);
  const rect = await getElementRect(result);
  await driver.execute('mobile: tap', {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  });

  const backButton = await driver.$(SELECTORS.backButton);
  await backButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await waitForVisibleText(driver, message, DEFAULT_TIMEOUT);
}

async function runTest(driver, options = {}) {
  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const token = Date.now().toString(36);
  const roomName = process.env.CONVERSATION_SEARCH_ROOM_NAME || buildUniqueRoomName('Search', token);
  const query = process.env.CONVERSATION_SEARCH_QUERY || 'needle';
  const olderPrefix = `${query} older`;
  const newerPrefix = `${query} newer`;
  const unrelatedPrefix = 'message control';
  const olderMessage = `${olderPrefix} ${token}`;
  const unrelatedMessage = `${unrelatedPrefix} ${token}`;
  const newerMessage = `${newerPrefix} ${token}`;

  const creation = await createPublicRoom(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '01_room_created.png');

  await typeAndSendMessage(driver, olderMessage, DEFAULT_TIMEOUT);
  await typeAndSendMessage(driver, unrelatedMessage, DEFAULT_TIMEOUT);
  await typeAndSendMessage(driver, newerMessage, DEFAULT_TIMEOUT);
  await waitForVisibleText(driver, newerPrefix);

  await addQuickReaction(driver, olderMessage, 'thumbs_up', DEFAULT_TIMEOUT);
  await addQuickReaction(driver, newerMessage, 'heart', DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '02_search_messages_seeded_with_reactions.png');

  await openSearch(driver);
  await saveScreenshot(driver, TEST_NAME, '03_search_opened.png');

  const indexingAttempts = await searchUntilIndexed(driver, query, [olderPrefix, newerPrefix]);
  assert.equal(
    await isTextVisible(driver, unrelatedPrefix),
    false,
    'Conversation search included a message that did not contain the query'
  );
  await waitForOrder(driver, newerPrefix, olderPrefix);
  await waitForReactionNearMessage(driver, olderPrefix, '👍');
  await waitForReactionNearMessage(driver, newerPrefix, '❤️');
  await saveScreenshot(driver, TEST_NAME, '04_matching_results_newest_first.png');

  await tapByText(driver, 'Newest', DEFAULT_TIMEOUT);
  await waitForVisibleText(driver, 'Oldest');
  await waitForOrder(driver, olderPrefix, newerPrefix);
  await saveScreenshot(driver, TEST_NAME, '05_matching_results_oldest_first.png');

  await selectSearchResult(driver, olderPrefix);
  await waitForReactionNearMessage(driver, olderPrefix, '👍');
  await saveScreenshot(driver, TEST_NAME, '06_selected_result_context.png');

  const backButton = await driver.$(SELECTORS.backButton);
  await backButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await backButton.click();
  await driver.$(SELECTORS.searchInputTextView).then(field =>
    field.waitForDisplayed({ timeout: DEFAULT_TIMEOUT })
  );

  const missingQuery = `missing-${token}`;
  await submitSearch(driver, missingQuery);
  await waitForVisibleText(driver, 'No Results Found', DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '07_no_results.png');

  const closeButton = await driver.$(SELECTORS.closeButton);
  await closeButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await closeButton.click();
  await driver.$(SELECTORS.roomComposerTextView).then(composer =>
    composer.waitForDisplayed({ timeout: DEFAULT_TIMEOUT })
  );
  await saveScreenshot(driver, TEST_NAME, '08_returned_to_conversation.png');

  return {
    timings: { roomCreationMs: creation.roomCreationMs },
    notes: `Search backend indexed seeded messages after ${indexingAttempts} attempt(s)`,
  };
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

module.exports = {
  run,
  runTest,
  visibleTextPredicate,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
