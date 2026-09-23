require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { defineTest } = require('../utils/testHarness');
const { SELECTORS } = require('../utils/selectors');
const { waitForStableLabeledControlSignature } = require('../utils/conversationFeatureFlows');
const { boundedInt, tapByText } = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'ConversationList';

const SCROLL_TO_TEXT_MAX = boundedInt(process.env.CONVERSATION_SCROLL_MAX, 10, 4, 20);
const SCROLL_STEP_PAUSE_MS = boundedInt(process.env.CONVERSATION_SCROLL_PAUSE_MS, 260, 120, 800);
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

async function scrollToText(driver, text, maxScrolls = SCROLL_TO_TEXT_MAX) {
  const predicate = containsAnyTextPredicate(text);
  for (let i = 0; i < maxScrolls; i++) {
    const el = await driver.$(`-ios predicate string:${predicate}`);
    if (await el.waitForDisplayed({ timeout: 1200 }).then(() => true).catch(() => false)) return;
    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
    } catch {}
    await driver.pause(SCROLL_STEP_PAUSE_MS);
  }
  throw new Error(`Could not find "${text}" after ${maxScrolls} scrolls`);
}

async function tapRadioLoose(driver, title, timeout = DEFAULT_TIMEOUT) {
  const predicate = containsAnyTextPredicate(title);
  const el = await driver.$(`-ios predicate string:${predicate}`);
  await el.waitForDisplayed({ timeout });
  await el.click();
  await waitForStableLabeledControlSignature(driver, title, { timeout });
}

function slug(label) {
  return label.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'option';
}

async function openUserSettings(driver) {
  const settings = await driver.$(SELECTORS.settingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await settings.click();
  const layout = await driver.$(`-ios predicate string:${containsAnyTextPredicate('Conversation Layout')}`);
  await layout.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
}

async function closeUserSettings(driver) {
  const closeBtn = await driver.$(SELECTORS.closeButton);
  await closeBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await closeBtn.click();
}

/** After closing settings, main conversation list should be usable again. */
async function assertConversationListReady(driver) {
  const settings = await driver.$(SELECTORS.settingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  const peoplePlus = await driver.$(SELECTORS.peoplePlusButton);
  const newConv = await driver.$(SELECTORS.newConversationButton);
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
    await scrollToText(driver, 'Conversation Layout');
    await tapByText(driver, 'Conversation Layout', DEFAULT_TIMEOUT);
    await scrollToText(driver, layout, SCROLL_TO_TEXT_MAX);
    await saveScreenshot(driver, TEST_NAME, `layout_${slug(layout)}_menu_open.png`);

    await tapRadioLoose(driver, layout, DEFAULT_TIMEOUT);
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
    await scrollToText(driver, 'Conversation Sorting');
    await tapByText(driver, 'Conversation Sorting', DEFAULT_TIMEOUT);
    await scrollToText(driver, sort, SCROLL_TO_TEXT_MAX);
    await saveScreenshot(driver, TEST_NAME, `sort_${slug(sort)}_menu_open.png`);

    await tapRadioLoose(driver, sort, DEFAULT_TIMEOUT);
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
  }

  await applyEachLayout(driver);
  await applyEachSort(driver);
}

const test = defineTest({ name: TEST_NAME, execute: runTest });
const { run } = test;

module.exports = { run };
test.runIfMain(module);
