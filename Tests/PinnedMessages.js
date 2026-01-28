require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

/*-----------------Config----------------------------------------*/
const ARTIFACTS_DIR = path.resolve(__dirname, '../screenshots');
const DEFAULT_TIMEOUT = 20000;

/*-----------------Helpers----------------------------------------*/
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

async function tapSearchResultByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  // 0) Button row (rooms often render as a tappable button)
  const buttonEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await buttonEl.isExisting().catch(() => false)) {
    await buttonEl.waitForDisplayed({ timeout });
    await buttonEl.click();
    return;
  }

  // 1) Static text
  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  // 2) Cell fallback
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

    //Search room
    const searchField = await driver.$('~searchUsersTextField');
    await searchField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await searchField.click();
    await searchField.setValue(roomName);

    // give SwiftUI a beat to render results
    await driver.pause(1200);

    //Select room
    await tapSearchResultByText(driver, roomName, DEFAULT_TIMEOUT);

    //Type message in composer
    await typeComposerMessage(driver, generateRandomMessage());

    const sendBtn = await driver.$('~sendMessageButton');
    await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
    await sendBtn.click();

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
