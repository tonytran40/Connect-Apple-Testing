require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

const ARTIFACTS_DIR = path.resolve(__dirname, '../screenshots');
const DEFAULT_TIMEOUT = 20000;

function ensureArtifactsDir() {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  return ARTIFACTS_DIR;
}

async function tapByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

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

async function screenshot(driver, name) {
  const file = path.join(ensureArtifactsDir(), name);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

function generateRandomMessage(prefix = 'Message test') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix} - ${rand}`;
}

async function tapSearchResultByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

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

async function typeComposerMessage(driver, message, timeout = 20000) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    console.log('✅ Typed message (by accessibility id)');
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
      console.log('✅ Typed message in composer');
      return;
    }
  }

  throw new Error('❌ Could not find message composer TextView');
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

/*--------------------Test------------------------------------------*/
async function run() {
  let driver;
  const roomName = process.env.PINNED_MESSAGES_ROOM_NAME || 'Message Room';

  console.log('🚀 Starting PinnedMessages test...');

  try {
    driver = await createDriver();

    await ensureLoggedIn(driver);

    const peoplePlus = await driver.$('~peoplePlusButton');
    await peoplePlus.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await peoplePlus.click();

    const searchField = await driver.$('~searchUsersTextField');
    await searchField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await searchField.click();
    await searchField.setValue(roomName);

    await driver.pause(1200);

    await tapSearchResultByText(driver, roomName, DEFAULT_TIMEOUT);

    const sentText = generateRandomMessage();
    await typeComposerMessage(driver, sentText);

    const sendBtn = await driver.$('~sendMessageButton');
    await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
    await sendBtn.click();
    console.log('📨 Sent message');

    await driver.pause(1200);

    await longPressByText(driver, sentText, DEFAULT_TIMEOUT, 900);
    console.log('✅ Long-pressed sent message');

    await driver.pause(600);

    await tapPinFromContextMenu(driver, DEFAULT_TIMEOUT);
    console.log('✅ Tapped Pin');

    const pinButton = await driver.$('~pinnedMessagesButton');
    await pinButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await driver.pause(800);
    await pinButton.click();
    await driver.pause(800);

    const pinnedRow = await findPinnedRowByText(driver, sentText, DEFAULT_TIMEOUT);
    await longPressElement(driver, pinnedRow, 900);
    console.log('✅ Long-pressed pinned message (drawer)');

    await driver.pause(600);

    await tapContextMenuItem(driver, 'Unpin', DEFAULT_TIMEOUT);
    console.log('✅ Tapped Unpin');

    await driver.pause(800);

    await pinButton.click();
    await driver.pause(800);
    console.log('✅ Closed Pinned Messages');

  } catch (err) {
    console.error('❌ Test failed:', err);
    if (driver) {
      try { await screenshot(driver, 'ERROR.png'); } catch {}
    }
    throw err;
  } finally {
    if (driver) await driver.deleteSession();
  }
}

run().catch(() => process.exit(1));
