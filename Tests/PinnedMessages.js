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

async function screenshot(driver, name) {
  const file = path.join(ensureArtifactsDir(), name);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

function generateRandomMessage(prefix = 'Message test') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix} - ${rand}`;
}

async function tapSearchResultByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = String(text).replace(/"/g, '\\"');

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

async function typeComposerMessage(driver, message, timeout = DEFAULT_TIMEOUT) {
  const byId = await driver.$('~messageComposerTextView');
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

  throw new Error('❌ Could not find message composer TextView');
}

async function findMessageBubbleByText(driver, messageText, timeout = DEFAULT_TIMEOUT) {
  const safe = String(messageText).replace(/"/g, '\\"');
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

async function longPressByText(driver, text, timeout = DEFAULT_TIMEOUT, durationMs = 900) {
  const bubble = await findMessageBubbleByText(driver, text, timeout);
  await longPressElement(driver, bubble, durationMs);
}

async function tapContextMenuItem(driver, labelContains, timeout = DEFAULT_TIMEOUT) {
  const safe = String(labelContains).replace(/"/g, '\\"');

  // 1) Direct Button match (covers "Unpin", and also ", Unpin")
  const btn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await btn.isExisting().catch(() => false)) {
    await btn.waitForDisplayed({ timeout });
    await btn.click();
    return;
  }

  // 2) StaticText inside a row (sometimes the tappable thing is the row/cell, not the text)
  const txt = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await txt.isExisting().catch(() => false)) {
    await txt.waitForDisplayed({ timeout });

    const parentBtn = await txt.$('ancestor::XCUIElementTypeButton[1]');
    if (await parentBtn.isExisting().catch(() => false)) {
      await parentBtn.click();
      return;
    }

    const parentCell = await txt.$('ancestor::XCUIElementTypeCell[1]');
    if (await parentCell.isExisting().catch(() => false)) {
      await parentCell.click();
      return;
    }

    await txt.click();
    return;
  }

  // 3) Some menus expose the label on a Cell/Other directly
  const cell = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeCell" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await cell.isExisting().catch(() => false)) {
    await cell.waitForDisplayed({ timeout });
    await cell.click();
    return;
  }

  // 4) Last resort: any element that contains the text
  const anyEl = await driver.$(
    `-ios predicate string:(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  await anyEl.waitForDisplayed({ timeout });
  await anyEl.click();
}


async function run() {
  let driver;
  const roomName = process.env.PINNED_MESSAGES_ROOM_NAME || 'Message Room';

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

    // This pause is important: SwiftUI search results render async
    await driver.pause(1200);

    await tapSearchResultByText(driver, roomName, DEFAULT_TIMEOUT);

    const sentText = generateRandomMessage();
    await typeComposerMessage(driver, sentText);

    const sendBtn = await driver.$('~sendMessageButton');
    await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
    await sendBtn.click();

    await driver.pause(1200);

    await longPressByText(driver, sentText, DEFAULT_TIMEOUT, 900);
    await driver.pause(600);

    await tapContextMenuItem(driver, 'Pin', DEFAULT_TIMEOUT);

    const pinnedBtn = await driver.$('~pinnedMessagesButton');
    await pinnedBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await pinnedBtn.click();

    const pinnedBubble = await findMessageBubbleByText(driver, sentText, DEFAULT_TIMEOUT);
    await longPressElement(driver, pinnedBubble, 900);

    await tapContextMenuItem(driver, 'Message', DEFAULT_TIMEOUT);
    await tapContextMenuItem(driver, 'Unpin', DEFAULT_TIMEOUT);

    await pinnedBtn.click();

    console.log('🎉 Done');

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
