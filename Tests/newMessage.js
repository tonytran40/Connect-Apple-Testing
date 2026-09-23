require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { scrollUntilConversationEntryVisible } = require('../utils/testSession');
const { defineTest } = require('../utils/testHarness');
const { SELECTORS } = require('../utils/selectors');
const { escapePredicateString, typeComposerMessage } = require('../utils/uiActions');
const {
  waitForAnyElementDisplayed,
  waitForCondition,
  waitForElementDisplayed,
  waitForElementEnabled,
} = require('../utils/uiTransitions');

const TEST_NAME = 'newMessage';

async function waitForSearchResultByText(driver, text, timeout = 20000) {
  const safe = escapePredicateString(text);

  return waitForCondition(
    driver,
    async () => {
      const buttonEl = await driver.$(
        `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
      );
      if (await buttonEl.isDisplayed().catch(() => false)) return buttonEl;

      const textEl = await driver.$(
        `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
      );
      if (await textEl.isDisplayed().catch(() => false)) {
        const parentCell = await textEl.$('ancestor::XCUIElementTypeCell[1]');
        if (await parentCell.isDisplayed().catch(() => false)) return parentCell;

        const parentButton = await textEl.$('ancestor::XCUIElementTypeButton[1]');
        if (await parentButton.isDisplayed().catch(() => false)) return parentButton;
        return textEl;
      }

      const cellEl = await driver.$(
        `//XCUIElementTypeStaticText[contains(@name,"${text}") or contains(@label,"${text}")]/ancestor::XCUIElementTypeCell[1]`
      );
      if (await cellEl.isDisplayed().catch(() => false)) return cellEl;

      const anyEl = await driver.$(
        `-ios predicate string:(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
      );
      return (await anyEl.isDisplayed().catch(() => false)) ? anyEl : false;
    },
    {
      timeout,
      timeoutMsg: `Search result for "${text}" did not become visible`,
    }
  );
}

async function tapSearchResultByText(driver, text, timeout = 20000) {
  const result = await waitForSearchResultByText(driver, text, timeout);
  await result.click();
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const recipient = process.env.RECIPIENT || 'greg.blake';
  const message = process.env.MESSAGE || 'Hello this is tony. How are you doing';

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await waitForAnyElementDisplayed(
      driver,
      [SELECTORS.mainAppView, SELECTORS.roomsSectionHeader],
      { timeout: 20000, timeoutMsg: 'Connect did not become ready after login' }
    );
    await saveScreenshot(driver, TEST_NAME, '01_logged_in.png');
  }

  await scrollUntilConversationEntryVisible(driver);

  const peoplePlus = await driver.$(SELECTORS.newConversationButton);
  if (await peoplePlus.isDisplayed().catch(() => false)) {
    await peoplePlus.click();
    console.log('Opened Start Conversation via peoplePlusButton');
  } else {
    const newConversationButton = await driver.$(SELECTORS.newConversationButton);
    await newConversationButton.waitForDisplayed({ timeout: 20000 });
    await newConversationButton.click();
    console.log('Opened Start Conversation via newConversationButton');
  }

  await waitForElementDisplayed(driver, SELECTORS.searchUsersTextField, {
    timeout: 20000,
    timeoutMsg: 'Recipient search did not become visible',
  });
  await saveScreenshot(driver, TEST_NAME, '02_start_conversation.png');

  const searchField = await driver.$(SELECTORS.searchUsersTextField);
  await searchField.waitForDisplayed({ timeout: 20000 });
  await searchField.click();
  await searchField.setValue(recipient);
  console.log(`Typed recipient: ${recipient}`);

  await waitForSearchResultByText(driver, recipient);
  await saveScreenshot(driver, TEST_NAME, '03_typed_recipient.png');

  await tapSearchResultByText(driver, recipient);
  console.log('Selected recipient');

  await waitForAnyElementDisplayed(
    driver,
    [SELECTORS.roomComposerTextView, SELECTORS.messageComposerTextView],
    { timeout: 20000, timeoutMsg: 'Message composer did not become visible after selecting recipient' }
  );
  await saveScreenshot(driver, TEST_NAME, '04_selected_recipient.png');

  await typeComposerMessage(driver, message);
  const sendBtn = await waitForElementEnabled(driver, SELECTORS.sendMessageButton, {
    timeout: 10000,
    timeoutMsg: 'Send button did not become enabled after typing the message',
  });
  await saveScreenshot(driver, TEST_NAME, '05_message_typed.png');

  await sendBtn.click();
  console.log('Sent message');
}

const test = defineTest({ name: TEST_NAME, execute: runTest });
const { run } = test;

module.exports = { run };
test.runIfMain(module);
