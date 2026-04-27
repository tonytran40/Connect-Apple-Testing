require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'ConversationList';

const LAYOUT_OPTIONS = (process.env.CONVERSATION_LAYOUTS || 'Classic,Cozy')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const SORT_OPTIONS = (process.env.CONVERSATION_SORTS || 'Recent Activity,Alphabetically,Self-Managed')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function containsAnyTextPredicate(text) {
  const safe = text.replace(/"/g, '\\"');
  return (
    `(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton" OR type == "XCUIElementTypeOther" OR type == "XCUIElementTypeCell") ` +
    `AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}" OR value CONTAINS "${safe}")`
  );
}

async function scrollToText(driver, text, maxScrolls = 8) {
  const predicate = containsAnyTextPredicate(text);
  for (let i = 0; i < maxScrolls; i++) {
    const el = await driver.$(`-ios predicate string:${predicate}`);
    if (await el.isExisting().catch(() => false)) return;
    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
    } catch {}
    await driver.pause(350);
  }
  throw new Error(`Could not find "${text}" after ${maxScrolls} scrolls`);
}

async function tapByText(driver, text, timeout = DEFAULT_TIMEOUT) {
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

async function tapRadioLoose(driver, title, timeout = DEFAULT_TIMEOUT) {
  const predicate = containsAnyTextPredicate(title);
  const el = await driver.$(`-ios predicate string:${predicate}`);
  await el.waitForDisplayed({ timeout });
  await el.click();
}

function slug(label) {
  return label.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'option';
}

async function openUserSettings(driver) {
  const settings = await driver.$('~settingsButton');
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await settings.click();
  await driver.pause(700);
}

async function closeUserSettings(driver) {
  const closeBtn = await driver.$('~closeButton');
  await closeBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await closeBtn.click();
  await driver.pause(500);
}

/** After closing settings, main conversation list should be usable again. */
async function assertConversationListReady(driver) {
  const settings = await driver.$('~settingsButton');
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  const peoplePlus = await driver.$('~peoplePlusButton');
  const newConv = await driver.$('~newConversationButton');
  const ok =
    (await peoplePlus.isDisplayed().catch(() => false)) ||
    (await newConv.isDisplayed().catch(() => false));
  if (!ok) {
    throw new Error('Expected conversation list (people plus or new conversation) after closing settings');
  }
}

async function applyEachLayout(driver) {
  for (const layout of LAYOUT_OPTIONS) {
    console.log(`Layout: ${layout}`);
    await openUserSettings(driver);
    await scrollToText(driver, 'Conversation Layout', 10);
    await tapByText(driver, 'Conversation Layout', DEFAULT_TIMEOUT);
    await driver.pause(500);
    await saveScreenshot(driver, TEST_NAME, `layout_${slug(layout)}_menu_open.png`);

    await scrollToText(driver, layout, 8);
    await tapRadioLoose(driver, layout, DEFAULT_TIMEOUT);
    await driver.pause(500);
    await saveScreenshot(driver, TEST_NAME, `layout_${slug(layout)}_after_switch_in_menu.png`);

    await closeUserSettings(driver);
    await assertConversationListReady(driver);
    await saveScreenshot(driver, TEST_NAME, `layout_${slug(layout)}_conversation_list.png`);
  }
}

async function applyEachSort(driver) {
  for (const sort of SORT_OPTIONS) {
    console.log(`Sort: ${sort}`);
    await openUserSettings(driver);
    await scrollToText(driver, 'Conversation Sorting', 10);
    await tapByText(driver, 'Conversation Sorting', DEFAULT_TIMEOUT);
    await driver.pause(500);
    await saveScreenshot(driver, TEST_NAME, `sort_${slug(sort)}_menu_open.png`);

    await scrollToText(driver, sort, 8);
    await tapRadioLoose(driver, sort, DEFAULT_TIMEOUT);
    await driver.pause(500);
    await saveScreenshot(driver, TEST_NAME, `sort_${slug(sort)}_after_switch_in_menu.png`);

    await closeUserSettings(driver);
    await assertConversationListReady(driver);
    await saveScreenshot(driver, TEST_NAME, `sort_${slug(sort)}_conversation_list.png`);
  }
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await driver.pause(800);
  }

  await applyEachLayout(driver);
  await applyEachSort(driver);
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
  run().catch(() => process.exit(1));
}
