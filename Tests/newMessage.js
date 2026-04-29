require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, scrollUntilConversationEntryVisible } = require('../utils/testSession');

const TEST_NAME = 'newMessage';

async function tapSearchResultByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  const buttonEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await buttonEl.isExisting().catch(() => false)) {
    await buttonEl.click();
    return;
  }

  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    const parentCell = await textEl.$('ancestor::XCUIElementTypeCell[1]');
    if (await parentCell.isExisting().catch(() => false)) {
      await parentCell.click();
      return;
    }

    const parentButton = await textEl.$('ancestor::XCUIElementTypeButton[1]');
    if (await parentButton.isExisting().catch(() => false)) {
      await parentButton.click();
      return;
    }

    await textEl.click();
    return;
  }

  const cellEl = await driver.$(
    `//XCUIElementTypeStaticText[contains(@name,"${text}") or contains(@label,"${text}")]/ancestor::XCUIElementTypeCell[1]`
  );

  if (await cellEl.isExisting().catch(() => false)) {
    await cellEl.click();
    return;
  }

  const anyEl = await driver.$(
    `-ios predicate string:(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  await anyEl.waitForDisplayed({ timeout });
  await anyEl.click();
  return;

  throw new Error(`Could not tap search result for "${text}"`);
}

async function typeComposerMessage(driver, message, timeout = 20000) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    console.log('Typed message by accessibility id');
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
      console.log('Typed message in composer');
      return;
    }
  }

  throw new Error('Could not find message composer TextView');
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const recipient = process.env.RECIPIENT || 'greg.blake';
  const message = process.env.MESSAGE || 'Hello this is tony. How are you doing';

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await driver.pause(800);
    await saveScreenshot(driver, TEST_NAME, '01_logged_in.png');
  }

  await scrollUntilConversationEntryVisible(driver);

  const peoplePlus = await driver.$('~newConversationButton');
  if (await peoplePlus.isDisplayed().catch(() => false)) {
    await peoplePlus.click();
    console.log('Opened Start Conversation via peoplePlusButton');
  } else {
    const newConversationButton = await driver.$('~newConversationButton');
    await newConversationButton.waitForDisplayed({ timeout: 20000 });
    await newConversationButton.click();
    console.log('Opened Start Conversation via newConversationButton');
  }

  await driver.pause(700);
  await saveScreenshot(driver, TEST_NAME, '02_start_conversation.png');

  const searchField = await driver.$('~searchUsersTextField');
  await searchField.waitForDisplayed({ timeout: 20000 });
  await searchField.click();
  await searchField.setValue(recipient);
  console.log(`Typed recipient: ${recipient}`);

  await driver.pause(900);
  await saveScreenshot(driver, TEST_NAME, '03_typed_recipient.png');

  await tapSearchResultByText(driver, recipient);
  console.log('Selected recipient');

  await driver.pause(700);
  await saveScreenshot(driver, TEST_NAME, '04_selected_recipient.png');

  await typeComposerMessage(driver, message);
  await driver.pause(500);
  await saveScreenshot(driver, TEST_NAME, '05_message_typed.png');

  const sendBtn = await driver.$('~sendMessageButton');
  await sendBtn.waitForEnabled({ timeout: 10000 });
  await sendBtn.click();
  console.log('Sent message');
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
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
