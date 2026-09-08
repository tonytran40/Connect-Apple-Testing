require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');
const { escapePredicateString, tapByText } = require('../utils/uiActions');

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
  if (serverName.toLowerCase() !== 'qa') {
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

function visibleTextSelector(text, exact = true) {
  const safe = escapePredicateString(text);
  const comparison = exact ? '==' : 'CONTAINS';
  return (
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
    'type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeOther") AND ' +
    `(name ${comparison} "${safe}" OR label ${comparison} "${safe}")`
  );
}

async function firstVisible(driver, selector) {
  const elements = await driver.$$(selector).catch(() => []);
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return null;
}

async function waitForVisibleText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const element = await firstVisible(driver, visibleTextSelector(text));
    if (element) return element;
    await driver.pause(175);
  }
  throw new Error(`Corporate Directory did not display expected QA user "${text}"`);
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

async function run(driver, options = {}) {
  const fixture = options.fixture || validateCorporateDirectoryFixture(options.env || process.env);
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, { ...options, fixture });
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = {
  BlockedTestError,
  run,
  runTest,
  validateCorporateDirectoryFixture,
  visibleTextSelector,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
