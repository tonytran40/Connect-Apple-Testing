require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  runWithOptionalDriver,
  scrollUntilConversationEntryVisible,
  ensureRoomsSectionReady,
  goBack,
} = require('../utils/testSession');
const { SELECTORS, PREDICATES } = require('../utils/selectors');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'PinnedMessages';

/** Max time to wait for search results after typing (polls; avoids 3× long waitForDisplayed). */
const SEARCH_RESULTS_BUDGET_MS = 2800;
const SEARCH_AFTER_TYPE_MS = 500;

async function openNewConversation(driver, timeout = DEFAULT_TIMEOUT) {
  await scrollUntilConversationEntryVisible(driver);
  const peoplePlus = await driver.$(SELECTORS.peoplePlusButton);
  if (await peoplePlus.isDisplayed().catch(() => false)) {
    await peoplePlus.click();
    console.log('Opened Start Conversation via peoplePlusButton');
    return;
  }

  const newConversationButton = await driver.$(SELECTORS.newConversationButton);
  await newConversationButton.waitForDisplayed({ timeout });
  await newConversationButton.click();
  console.log('Opened Start Conversation via newConversationButton');
}

async function tapByText(driver, text, timeout = 20000) {
  const safe = escapePredicateString(text);

  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  const parentButton = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeButton[1]`
  );

  if (await parentButton.isExisting().catch(() => false)) {
    await parentButton.waitForDisplayed({ timeout });
    await parentButton.click();
    return;
  }

  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );

  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
}

function generateRandomMessage(prefix = 'Message test') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix} - ${rand}`;
}

function generatePinnedRoomName() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `A-Pinned Messages-${rand}`;
}

function escapePredicateString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function tapSearchResultByText(driver, text, timeout = 20000) {
  const safe = escapePredicateString(text);

  const buttonEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await buttonEl.isExisting().catch(() => false)) {
    await buttonEl.waitForDisplayed({ timeout });
    await buttonEl.click();
    return;
  }

  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  const cellEl = await driver.$(
    `//XCUIElementTypeStaticText[contains(@name,"${text}") or contains(@label,"${text}")]/ancestor::XCUIElementTypeCell[1]`
  );
  if (await cellEl.isExisting().catch(() => false)) {
    await cellEl.waitForDisplayed({ timeout });
    await cellEl.click();
    return;
  }

  throw new Error(`Could not tap search result for "${text}"`);
}

/** True if a row/button for this room name shows in search, within a single short budget (polls). */
async function roomAppearsInSearch(driver, text, budgetMs = SEARCH_RESULTS_BUDGET_MS) {
  const safe = escapePredicateString(text);
  const deadline = Date.now() + budgetMs;

  const buttonEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  const cellEl = await driver.$(
    `//XCUIElementTypeStaticText[contains(@name,"${text}") or contains(@label,"${text}")]/ancestor::XCUIElementTypeCell[1]`
  );

  while (Date.now() < deadline) {
    if (await buttonEl.isExisting().catch(() => false) && (await buttonEl.isDisplayed().catch(() => false)))
      return true;
    if (await textEl.isExisting().catch(() => false) && (await textEl.isDisplayed().catch(() => false)))
      return true;
    if (await cellEl.isExisting().catch(() => false) && (await cellEl.isDisplayed().catch(() => false)))
      return true;
    await driver.pause(120);
  }
  return false;
}

/** Rooms row “+” — same as CreateRoom.openRoomsPlusMenu */
async function openRoomsPlusMenu(driver, timeout = DEFAULT_TIMEOUT) {
  await ensureRoomsSectionReady(driver);

  const roomsHeader = await driver.$(PREDICATES.roomsHeaderButton);
  await roomsHeader.waitForDisplayed({ timeout });

  const headerLocation = await roomsHeader.getLocation();
  const headerSize = await roomsHeader.getSize();
  const windowRect = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.min(windowRect.width - 20, Math.round(headerLocation.x + headerSize.width + 8)),
    y: Math.round(headerLocation.y + headerSize.height / 2),
  });
  console.log('Clicked Rooms plus');
}

/** Matches CreateRoom.tapByText — primary buttons are often XCUIElementTypeButton, not static text. */
async function tapByTextButtonOrStatic(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = escapePredicateString(text);
  const el = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "${safe}" OR name == "${safe}")`
  );
  await el.waitForDisplayed({ timeout });
  await el.click();
}

async function isConversationTitleVisible(driver, roomName, timeout = 1200) {
  const safe = escapePredicateString(roomName);
  const title = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );
  return title.waitForDisplayed({ timeout }).then(() => true).catch(() => false);
}

async function isTargetRoomOpen(driver, roomName, timeout = 1200) {
  const roomSettings = await driver.$(SELECTORS.openRoomSettingsButton);
  const inRoom = await roomSettings.waitForDisplayed({ timeout }).then(() => true).catch(() => false);
  return inRoom && (await isConversationTitleVisible(driver, roomName, timeout));
}

async function openRoomFromRoomsList(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  await ensureRoomsSectionReady(driver);

  for (let i = 0; i < 10; i++) {
    try {
      await tapByTextButtonOrStatic(driver, roomName, Math.min(timeout, 2500));
      break;
    } catch (err) {
      if (i === 9) throw new Error(`Could not find room "${roomName}" in the Rooms list`);
      try {
        await driver.execute('mobile: scroll', { direction: 'down' });
      } catch {
        try {
          await driver.execute('mobile: swipe', { direction: 'up' });
        } catch {}
      }
      await driver.pause(300);
    }
  }

  if (!(await isTargetRoomOpen(driver, roomName, timeout))) {
    throw new Error(`Expected to open room "${roomName}", but another conversation is active`);
  }
}

async function ensureTargetRoomOpen(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  if (await isTargetRoomOpen(driver, roomName, 3000)) {
    return;
  }

  console.log(`PinnedMessages: "${roomName}" is not active; reopening from Rooms list`);
  if (await driver.$(SELECTORS.backButton).isDisplayed().catch(() => false)) {
    await goBack(driver, 700);
  }
  await openRoomFromRoomsList(driver, roomName, timeout);
}

async function createRoomFromSheet(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const closeBtn = await driver.$(SELECTORS.closeButton);
  await closeBtn.waitForDisplayed({ timeout });
  await closeBtn.click();
  console.log('Closed new-message sheet (closeButton)');
  await driver.pause(500);

  await openRoomsPlusMenu(driver, timeout);

  const createRoomBtn = await driver.$(SELECTORS.createRoomButton);
  await createRoomBtn.waitForDisplayed({ timeout });
  await createRoomBtn.click();

  const roomField = await driver.$(SELECTORS.roomNameText);
  await roomField.waitForDisplayed({ timeout });
  await roomField.click();
  await roomField.setValue(roomName);

  await tapByTextButtonOrStatic(driver, 'Create', timeout);
  await tapByTextButtonOrStatic(driver, 'Skip for now', timeout);
  await ensureTargetRoomOpen(driver, roomName, timeout);
  console.log(`Created room: ${roomName}`);
}

async function createRoomFromRoomsList(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  await openRoomsPlusMenu(driver, timeout);

  const createRoomBtn = await driver.$(SELECTORS.createRoomButton);
  await createRoomBtn.waitForDisplayed({ timeout });
  await createRoomBtn.click();

  const roomField = await driver.$(SELECTORS.roomNameText);
  await roomField.waitForDisplayed({ timeout });
  await roomField.click();
  await roomField.setValue(roomName);

  await tapByTextButtonOrStatic(driver, 'Create', timeout);
  await tapByTextButtonOrStatic(driver, 'Skip for now', timeout);
  await ensureTargetRoomOpen(driver, roomName, timeout);
  console.log(`Created room: ${roomName}`);
}

async function typeComposerMessage(driver, message, timeout = 20000) {
  const byId = await driver.$(SELECTORS.roomComposerTextView);
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    return;
  }

  const placeholder = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND 
     (label CONTAINS "Start a new message" OR name CONTAINS "Start a new message" OR
      label CONTAINS "Message" OR name CONTAINS "Message")`
  );

  if (await placeholder.isExisting().catch(() => false)) {
    await placeholder.waitForDisplayed({ timeout });
    await placeholder.click();
    await driver.pause(300);
  }

  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      await tv.click();
      await driver.pause(150);
      await tv.setValue(message);
      return;
    }
  }

  throw new Error('Could not find message composer TextView');
}

async function findMessageBubbleByText(driver, messageText, timeout = 20000) {
  const safe = messageText.replace(/"/g, '\\"');
  const msgBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );

  await msgBtn.waitForExist({ timeout });
  await msgBtn.waitForDisplayed({ timeout });
  return msgBtn;
}

async function longPressElement(driver, el, durationMs = 900) {
  const elementId = el.elementId || el.ELEMENT;
  if (!elementId) throw new Error('Could not resolve elementId for long press');

  await driver.execute('mobile: touchAndHold', {
    elementId,
    duration: durationMs / 1000,
  });
}

async function longPressByText(driver, text, timeout = 20000, durationMs = 900) {
  const bubble = await findMessageBubbleByText(driver, text, timeout);
  await longPressElement(driver, bubble, durationMs);
}

async function tapPinFromContextMenu(driver, timeout = 20000) {
  const pinBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "Pin" OR label CONTAINS "Pin")`
  );
  await pinBtn.waitForDisplayed({ timeout });
  await pinBtn.click();
}

async function tapContextMenuItem(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');
  const btn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  await btn.waitForDisplayed({ timeout });
  await btn.click();
}

async function findPinnedRowByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');
  const rowBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );

  await rowBtn.waitForExist({ timeout });
  await rowBtn.waitForDisplayed({ timeout });
  return rowBtn;
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const configuredRoomName = process.env.PINNED_MESSAGES_ROOM_NAME;
  const roomName = configuredRoomName || generatePinnedRoomName();

  if (!skipLogin) {
    await ensureLoggedIn(driver);
  }

  if (!configuredRoomName) {
    console.log(`PinnedMessages: creating isolated room "${roomName}"`);
    await createRoomFromRoomsList(driver, roomName, DEFAULT_TIMEOUT);
  } else {
    await openNewConversation(driver, DEFAULT_TIMEOUT);

    const searchField = await driver.$(SELECTORS.searchUsersTextField);
    await searchField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await searchField.click();
    await searchField.setValue(roomName);

    await driver.pause(SEARCH_AFTER_TYPE_MS);

    if (await roomAppearsInSearch(driver, roomName)) {
      await tapSearchResultByText(driver, roomName, DEFAULT_TIMEOUT);
    } else {
      console.log(`Room "${roomName}" not in search; closing with X then Rooms + to create it`);
      await createRoomFromSheet(driver, roomName, DEFAULT_TIMEOUT);
    }

    await ensureTargetRoomOpen(driver, roomName, DEFAULT_TIMEOUT);
  }

  const sentText = generateRandomMessage();
  await typeComposerMessage(driver, sentText);

  const sendBtn = await driver.$(SELECTORS.sendMessageButton);
  await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
  await sendBtn.click();

  await driver.pause(1200);
  await longPressByText(driver, sentText, DEFAULT_TIMEOUT, 900);
  await driver.pause(600);
  await tapPinFromContextMenu(driver, DEFAULT_TIMEOUT);

  const pinButton = await driver.$(SELECTORS.pinnedMessagesButton);
  await pinButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await driver.pause(800);
  await pinButton.click();
  await driver.pause(800);
  await saveScreenshot(driver, TEST_NAME, 'pinned_message.png');

  const pinnedRow = await findPinnedRowByText(driver, sentText, DEFAULT_TIMEOUT);
  await longPressElement(driver, pinnedRow, 900);
  await driver.pause(600);
  await tapContextMenuItem(driver, 'Unpin', DEFAULT_TIMEOUT);

  await driver.pause(800);
  await pinButton.click();
  await saveScreenshot(driver, TEST_NAME, 'unpinned_message.png');
  await driver.pause(800);
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver, options);
    } catch (err) {
      try {
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}
