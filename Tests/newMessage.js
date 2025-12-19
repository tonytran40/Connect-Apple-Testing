require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

/* -------------------- helpers -------------------- */

function ensureScreenshotsDir() {
  const dir = path.resolve(__dirname, '../screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function screenshot(driver, name) {
  const dir = ensureScreenshotsDir();
  const file = path.join(dir, name);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

/**
 * Taps a search result by visible text.
 *
 * Search results in Start Conversation are dynamically rendered and do not have
 * stable accessibility identifiers. Depending on the result type (user, room,
 * group), the tappable element may be either the text itself or its parent cell.
 *
 * This helper attempts multiple safe selectors (StaticText → Cell) to reliably
 * select a result across UI variations.
 */

async function tapSearchResultByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  // Try static text
  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  // Try cell
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

/**
 * 🔥 MESSAGE COMPOSER TYPING (robust)
 */
async function typeComposerMessage(driver, message, timeout = 20000) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    console.log('✅ Typed message (by accessibility id)');
    return;
  }

  // 2️⃣ Tap placeholder text
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

  // 3️⃣ Type into first visible TextView
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

/* -------------------- test -------------------- */

async function run() {
  let driver;

  const recipient = process.env.RECIPIENT || 'greg.blake';
  const message = process.env.MESSAGE || 'Hello this is tony';

  try {
    driver = await createDriver();

    // Login if needed
    await ensureLoggedIn(driver);
    await driver.pause(1200);
    await screenshot(driver, '01_logged_in.png');

    //Tap People "+"
    const peoplePlus = await driver.$('~peoplePlusButton');
    await peoplePlus.waitForDisplayed({ timeout: 20000 });
    await peoplePlus.click();
    console.log('✅ Opened Start Conversation');

    await driver.pause(1200);
    await screenshot(driver, '02_start_conversation.png');

    //Search recipient
    const searchField = await driver.$('~searchUsersTextField');
    await searchField.waitForDisplayed({ timeout: 20000 });
    await searchField.click();
    await searchField.setValue(recipient);
    console.log(`✅ Typed recipient: ${recipient}`);

    await driver.pause(1500);
    await screenshot(driver, '03_typed_recipient.png');

    //Select recipient
    await tapSearchResultByText(driver, recipient);
    console.log('✅ Selected recipient');

    await driver.pause(1500);
    await screenshot(driver, '04_selected_recipient.png');

    // Type message in composer
    await typeComposerMessage(driver, message);
    await driver.pause(800);
    await screenshot(driver, '05_message_typed.png');

    console.log('🎉 New message flow completed successfully');

    const sendBtn = await driver.$('~sendMessageButton');
    await sendBtn.waitForEnabled({ timeout: 10000 });
    await sendBtn.click();
    console.log('📨 Sent message');

  } catch (err) {
    console.error('❌ Test failed:', err);
    if (driver) {
      try {
        await screenshot(driver, 'ERROR.png');
      } catch {}
    }
    throw err;
  } finally {
    // leave session open while developing
    // if (driver) await driver.deleteSession();
  }
}

run().catch(() => process.exit(1));
