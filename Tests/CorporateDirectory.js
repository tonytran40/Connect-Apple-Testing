require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { defineTest } = require('../utils/testHarness');
const { isQaServerName } = require('../utils/qaEnvironment');
const { SELECTORS } = require('../utils/selectors');
const {
  visibleTextSelector,
  waitForVisibleText: waitForQaText,
} = require('../utils/qaNavigation');
const { tapByText } = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'CorporateDirectory';

class BlockedTestError extends Error {
  constructor(reason) {
    super(`BLOCKED: ${reason}`);
    this.name = 'BlockedTestError';
    this.code = 'TEST_BLOCKED';
    this.status = 'BLOCKED';
  }
}

function validateCorporateDirectoryFixture(env = process.env) {
  const serverName = String(env.CONNECT_SERVER_NAME || '').trim();
  if (!isQaServerName(serverName)) {
    throw new BlockedTestError(
      `Corporate Directory automation is QA-only; CONNECT_SERVER_NAME was "${serverName || 'unset'}"`
    );
  }

  const query = String(env.CORPORATE_DIRECTORY_USER_QUERY || '').trim();
  const expectedUser = String(env.CORPORATE_DIRECTORY_EXPECTED_USER || '').trim();
  const missing = [];
  if (!query) missing.push('CORPORATE_DIRECTORY_USER_QUERY');
  if (!expectedUser) missing.push('CORPORATE_DIRECTORY_EXPECTED_USER');
  if (missing.length) {
    throw new BlockedTestError(`Missing deterministic QA fixture: ${missing.join(', ')}`);
  }

  return { serverName, query, expectedUser };
}

async function waitForVisibleText(driver, text, timeout = DEFAULT_TIMEOUT) {
  return waitForQaText(driver, text, {
    timeout,
    interval: 175,
    timeoutMsg: `Corporate Directory did not display expected QA user "${text}"`,
  });
}

async function findSearchField(driver) {
  const selectors = [
    SELECTORS.searchInputTextView,
    '-ios predicate string:type == "XCUIElementTypeTextField" AND ' +
      '(name CONTAINS "Search" OR label CONTAINS "Search" OR value CONTAINS "Search")',
  ];

  for (const selector of selectors) {
    const field = await driver.$(selector);
    if (await field.isDisplayed().catch(() => false)) return field;
  }
  throw new Error('Corporate Directory search field was not visible');
}

async function runTest(driver, options = {}) {
  const fixture = options.fixture || validateCorporateDirectoryFixture(options.env || process.env);

  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const settings = await driver.$(SELECTORS.settingsButton);
  await settings.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await settings.click();
  await tapByText(driver, 'Corporate Directory', DEFAULT_TIMEOUT);
  await tapByText(driver, 'People', DEFAULT_TIMEOUT);

  const search = await findSearchField(driver);
  await search.click();
  await search.setValue(fixture.query);

  const expectedUser = await waitForVisibleText(driver, fixture.expectedUser);
  await saveScreenshot(driver, TEST_NAME, '01_qa_user_lookup.png');
  await expectedUser.click();

  await waitForVisibleText(driver, 'Direct Message');
  await saveScreenshot(driver, TEST_NAME, '02_contact_card_open.png');

  return {
    notes: `QA Corporate Directory lookup found ${fixture.expectedUser}`,
  };
}

const test = defineTest({
  name: TEST_NAME,
  execute: runTest,
  prepareOptions: options => ({
    ...options,
    fixture: options.fixture || validateCorporateDirectoryFixture(options.env || process.env),
  }),
});
const { run } = test;

module.exports = {
  BlockedTestError,
  run,
  runTest,
  validateCorporateDirectoryFixture,
  visibleTextSelector,
};

test.runIfMain(module);
