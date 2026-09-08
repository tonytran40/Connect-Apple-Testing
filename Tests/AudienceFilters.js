require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  ensureRoomsSectionReady,
  runWithOptionalDriver,
} = require('../utils/testSession');
const { buildUniqueRoomName } = require('../utils/conversationFeatureFlows');
const { SELECTORS } = require('../utils/selectors');
const {
  escapePredicateString,
  getElementRect,
  tapByText,
} = require('../utils/uiActions');
const { createPublicRoom } = require('./CreateRoom');
const { requireQaServer } = require('./BrowseRooms');

const TEST_NAME = 'AudienceFilters';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.AUDIENCE_FILTER_TIMEOUT_MS, 10) || 25000;
const REQUIRED_VALUE_ENV = [
  'AUDIENCE_FILTER_TERRITORY',
  'AUDIENCE_FILTER_DEPARTMENT',
  'AUDIENCE_FILTER_TITLE',
];

function configurationBlockedError(missing) {
  const error = new Error(
    `BLOCKED: ${TEST_NAME} requires deterministic QA values for ${missing.join(', ')}.`
  );
  error.name = 'QaOnlyBlockedError';
  error.code = 'BLOCKED_QA_CONFIGURATION';
  error.status = 'BLOCKED';
  return error;
}

function resolveAudienceFilterConfig(env = process.env) {
  const missing = REQUIRED_VALUE_ENV.filter(name => !String(env[name] || '').trim());
  if (missing.length) throw configurationBlockedError(missing);

  return {
    territory: String(env.AUDIENCE_FILTER_TERRITORY).trim(),
    department: String(env.AUDIENCE_FILTER_DEPARTMENT).trim(),
    title: String(env.AUDIENCE_FILTER_TITLE).trim(),
    roomName:
      String(env.AUDIENCE_FILTER_ROOM_NAME || '').trim() ||
      buildUniqueRoomName('Audience-Filter'),
  };
}

function buildAudienceSummary({ territory, department, title = '' }) {
  const subject = title ? title : 'employees';
  return `All ${subject} in ${department} from ${territory}.`;
}

function visibleTextSelector(text) {
  const safe = escapePredicateString(text);
  return (
    '-ios predicate string:(type == "XCUIElementTypeStaticText" OR ' +
    'type == "XCUIElementTypeButton") AND ' +
    `(name == "${safe}" OR label == "${safe}")`
  );
}

async function isDisplayed(driver, selector) {
  const element = await driver.$(selector);
  return element.isDisplayed().catch(() => false);
}

async function waitForText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const element = await driver.$(visibleTextSelector(text));
  await element.waitForDisplayed({
    timeout,
    timeoutMsg: `Expected audience-filter text "${text}" to be visible`,
  });
  return element;
}

async function waitForTextHidden(driver, text, timeout = DEFAULT_TIMEOUT) {
  const selector = visibleTextSelector(text);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await isDisplayed(driver, selector))) return;
    await driver.pause(250);
  }
  throw new Error(`Audience-filter text "${text}" remained visible after ${timeout}ms`);
}

function categoryFieldXPath(category) {
  const safe = category.replace(/'/g, "\\'");
  return (
    `//XCUIElementTypeStaticText[@name='${safe}' or @label='${safe}' or ` +
    `@name='${safe.toUpperCase()}' or @label='${safe.toUpperCase()}']` +
    '/following::XCUIElementTypeTextField[1]'
  );
}

async function selectAudienceValue(
  driver,
  category,
  value,
  expectedSummary,
  timeout = DEFAULT_TIMEOUT
) {
  const field = await driver.$(categoryFieldXPath(category));
  await field.waitForDisplayed({
    timeout,
    timeoutMsg: `Audience filter did not expose the ${category} typeahead`,
  });
  await field.click();
  await field.clearValue().catch(() => {});
  await field.setValue(value);

  const option = await driver.$(visibleTextSelector(value));
  await option.waitForDisplayed({
    timeout,
    timeoutMsg: `Audience filter did not return the configured ${category} value "${value}"`,
  });
  await tapByText(driver, value, timeout);
  await waitForText(driver, expectedSummary, timeout);
  await driver.hideKeyboard().catch(() => {});
  return expectedSummary;
}

async function tapEnabledTextButton(driver, label, timeout = DEFAULT_TIMEOUT) {
  const safe = escapePredicateString(label);
  const button = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
    `(name == "${safe}" OR label == "${safe}")`
  );
  await button.waitForDisplayed({ timeout });
  await button.waitForEnabled({
    timeout,
    timeoutMsg: `Audience-filter action "${label}" did not become enabled`,
  });
  await button.click();
}

async function openAudienceFilterSheet(driver, timeout = DEFAULT_TIMEOUT) {
  await waitForText(driver, 'Add Members', timeout);
  await tapByText(driver, 'Add Members by Territory, Department, & Title', timeout);
  await waitForText(driver, 'Filter Members', timeout);
}

async function findAudienceFilterMenuButton(driver, summary, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const summaryElement = await driver.$(visibleTextSelector(summary));
    if (await summaryElement.isDisplayed().catch(() => false)) {
      const summaryRect = await getElementRect(summaryElement).catch(() => null);
      if (summaryRect) {
        const summaryCenterY = summaryRect.y + summaryRect.height / 2;
        const candidates = [];
        for (const button of await driver.$$('//XCUIElementTypeButton')) {
          if (!(await button.isDisplayed().catch(() => false))) continue;
          const rect = await getElementRect(button).catch(() => null);
          if (!rect) continue;
          const centerY = rect.y + rect.height / 2;
          if (
            rect.x > summaryRect.x + summaryRect.width * 0.55 &&
            Math.abs(centerY - summaryCenterY) <= Math.max(44, summaryRect.height / 2)
          ) {
            candidates.push({ button, rect });
          }
        }
        candidates.sort((left, right) => right.rect.x - left.rect.x);
        if (candidates[0]) return candidates[0].button;
      }
    }
    await driver.pause(250);
  }

  throw new Error(
    `Could not locate the unlabeled audience-filter ellipsis beside "${summary}". ` +
    'The base app does not provide an accessibility identifier for this control.'
  );
}

async function openAudienceFilterMenu(driver, summary, timeout = DEFAULT_TIMEOUT) {
  const menu = await findAudienceFilterMenuButton(driver, summary, timeout);
  await menu.click();
  await waitForText(driver, 'Edit Filter', timeout);
  await waitForText(driver, 'Delete Filter', timeout);
}

async function waitForRoomOpen(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  await waitForText(driver, roomName, timeout);
  const composer = await driver.$(SELECTORS.roomComposerTextView);
  await composer.waitForDisplayed({
    timeout,
    timeoutMsg: `AudienceFilters did not open the created room "${roomName}"`,
  });
}

async function runTest(driver, options = {}) {
  const env = options.env || process.env;
  requireQaServer(env, TEST_NAME);
  const config = resolveAudienceFilterConfig(env);

  if (!options.skipLogin) await ensureLoggedIn(driver);
  await ensureRoomsSectionReady(driver);

  const creation = await createPublicRoom(driver, config.roomName, {
    skipAddMembersSheet: true,
  });
  await saveScreenshot(driver, TEST_NAME, '01_add_members_sheet.png');

  await openAudienceFilterSheet(driver);
  await saveScreenshot(driver, TEST_NAME, '02_filter_members_open.png');

  const territorySummary = `All employees from ${config.territory}.`;
  await selectAudienceValue(
    driver,
    'Territory',
    config.territory,
    territorySummary
  );

  const createdSummary = buildAudienceSummary({
    territory: config.territory,
    department: config.department,
  });
  await selectAudienceValue(
    driver,
    'Department',
    config.department,
    createdSummary
  );
  await saveScreenshot(driver, TEST_NAME, '03_create_filter_ready.png');
  await tapEnabledTextButton(driver, 'Create Filter');

  await waitForText(driver, 'Add Members');
  await waitForText(driver, createdSummary);
  await saveScreenshot(driver, TEST_NAME, '04_filter_created.png');

  await openAudienceFilterMenu(driver, createdSummary);
  await saveScreenshot(driver, TEST_NAME, '05_filter_actions.png');
  await tapByText(driver, 'Edit Filter', DEFAULT_TIMEOUT);
  await waitForText(driver, 'Filter Members');

  const editedSummary = buildAudienceSummary({ ...config, title: config.title });
  await selectAudienceValue(
    driver,
    'User Title',
    config.title,
    editedSummary
  );
  await saveScreenshot(driver, TEST_NAME, '06_edit_filter_ready.png');
  await tapEnabledTextButton(driver, 'Save Filter');

  await waitForText(driver, 'Add Members');
  await waitForTextHidden(driver, createdSummary);
  await waitForText(driver, editedSummary);
  await saveScreenshot(driver, TEST_NAME, '07_filter_edited.png');

  await openAudienceFilterMenu(driver, editedSummary);
  await tapByText(driver, 'Delete Filter', DEFAULT_TIMEOUT);
  await waitForTextHidden(driver, editedSummary);
  await waitForText(driver, 'Add Members by Territory, Department, & Title');
  await saveScreenshot(driver, TEST_NAME, '08_filter_deleted.png');

  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);
  await waitForRoomOpen(driver, config.roomName);
  await saveScreenshot(driver, TEST_NAME, '09_room_open_after_filter_lifecycle.png');

  return {
    qaOnly: true,
    roomName: config.roomName,
    createdSummary,
    editedSummary,
    timings: { roomCreationMs: creation.roomCreationMs },
  };
}

async function run(driver, options = {}) {
  const env = options.env || process.env;
  requireQaServer(env, TEST_NAME);
  resolveAudienceFilterConfig(env);
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = {
  REQUIRED_VALUE_ENV,
  buildAudienceSummary,
  categoryFieldXPath,
  configurationBlockedError,
  findAudienceFilterMenuButton,
  openAudienceFilterMenu,
  openAudienceFilterSheet,
  resolveAudienceFilterConfig,
  run,
  runTest,
  selectAudienceValue,
  visibleTextSelector,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
