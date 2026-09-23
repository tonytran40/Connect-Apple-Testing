require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { defineTest } = require('../utils/testHarness');
const { ensureRoomsSectionReady } = require('../utils/testSession');
const { integer } = require('../utils/envConfig');
const { requireQaServer } = require('../utils/qaEnvironment');
const { buildUniqueRoomName } = require('../utils/conversationFeatureFlows');
const { SELECTORS } = require('../utils/selectors');
const {
  escapePredicateString,
  getElementRect,
  tapByText,
} = require('../utils/uiActions');
const { waitForElementHidden } = require('../utils/uiTransitions');
const { createPrivateRoom } = require('./CreateRoom');

const TEST_NAME = 'AudienceFilters';
const DEFAULT_TIMEOUT = integer(process.env, 'AUDIENCE_FILTER_TIMEOUT_MS', 25000, { min: 1 });
const APPLY_TIMEOUT = integer(process.env, 'AUDIENCE_FILTER_APPLY_TIMEOUT_MS', 120000, { min: 1 });
const TYPE_DELAY_MS = integer(process.env, 'AUDIENCE_FILTER_TYPE_DELAY_MS', 75, { min: 0 });
const TYPE_RETRIES = integer(process.env, 'AUDIENCE_FILTER_TYPE_RETRIES', 3, { min: 1 });
const QA_AUDIENCE_FIXTURE = Object.freeze({
  territory: 'Philadelphia',
  department: 'Business Technology',
  title: 'Nitro Quality Ninja',
});

function resolveAudienceFilterConfig(env = process.env) {
  return {
    territory: String(env.AUDIENCE_FILTER_TERRITORY || QA_AUDIENCE_FIXTURE.territory).trim(),
    department: String(env.AUDIENCE_FILTER_DEPARTMENT || QA_AUDIENCE_FIXTURE.department).trim(),
    title: String(env.AUDIENCE_FILTER_TITLE || QA_AUDIENCE_FIXTURE.title).trim(),
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
  await waitForElementHidden(driver, selector, {
    timeout,
    interval: 250,
    timeoutMsg: `Audience-filter text "${text}" remained visible after ${timeout}ms`,
  });
}

async function textFieldValue(field) {
  if (typeof field.getValue === 'function') {
    const value = await field.getValue().catch(() => '');
    if (value !== null && value !== undefined) return String(value);
  }
  return String((await field.getAttribute('value').catch(() => '')) || '');
}

async function typeUntilDropdownOptionVisible(driver, field, value, options = {}) {
  const delayMs = options.delayMs ?? TYPE_DELAY_MS;
  const retries = options.retries ?? TYPE_RETRIES;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const optionSelector = visibleTextSelector(value);

  for (let attempt = 1; attempt <= retries; attempt++) {
    await field.click();
    await field.clearValue().catch(async () => field.setValue(''));
    let expectedPrefix = '';
    let mistyped = false;

    for (const character of value) {
      expectedPrefix += character;
      await field.addValue(character);
      if (delayMs > 0) await driver.pause(delayMs);

      const typed = await textFieldValue(field);
      if (typed !== expectedPrefix) {
        console.log(
          `AudienceFilters: typed "${typed}" instead of prefix "${expectedPrefix}"; ` +
          `retrying (${attempt}/${retries})`
        );
        mistyped = true;
        break;
      }

      const option = await driver.$(optionSelector);
      if (await option.isDisplayed().catch(() => false)) {
        console.log(`AudienceFilters: "${value}" appeared after typing "${expectedPrefix}"`);
        return option;
      }
    }

    if (mistyped) continue;

    const option = await driver.$(optionSelector);
    if (await option.waitForDisplayed({ timeout }).then(() => true).catch(() => false)) {
      return option;
    }
  }

  throw new Error(
    `AudienceFilters could not type a reliable prefix or find dropdown option "${value}"`
  );
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
  const option = await typeUntilDropdownOptionVisible(driver, field, value, { timeout });
  await option.click().catch(async () => tapByText(driver, value, timeout));
  await waitForText(driver, expectedSummary, timeout);
  await driver.hideKeyboard().catch(() => {});
  return expectedSummary;
}

function roomMemberCountSelector() {
  return (
    '-ios predicate string:' +
    '(name BEGINSWITH "Members (" OR label BEGINSWITH "Members (")'
  );
}

async function waitForRoomMemberCount(
  driver,
  expected = 2,
  timeout = APPLY_TIMEOUT,
  options = {}
) {
  const selector = roomMemberCountSelector();
  const exact = options.exact === true;
  let observed = '';
  await driver.waitUntil(async () => {
    // Reload the element on every poll because SwiftUI replaces count labels
    // as the audience response and Matrix membership arrive.
    const countElement = await driver.$(selector);
    if (!(await countElement.isDisplayed().catch(() => false))) return false;
    observed = String(
      (await countElement.getAttribute('name').catch(() => '')) ||
      (await countElement.getAttribute('label').catch(() => '')) ||
      (await countElement.getText().catch(() => '')) ||
      ''
    ).trim();
    const match = observed.match(/^Members \((\d+)\)$/);
    if (!match) return false;
    const count = Number(match[1]);
    return exact ? count === expected : count >= expected;
  }, {
    timeout,
    interval: 300,
    timeoutMsg: exact
      ? `Audience-filter room did not reach exactly ${expected} joined members`
      : `Audience-filter room did not load at least ${expected} joined members`,
  });
  return Number(observed.match(/^Members \((\d+)\)$/)[1]);
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

async function openRoomMembers(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const settings = await driver.$(SELECTORS.openRoomSettingsButton);
  await settings.waitForDisplayed({
    timeout,
    timeoutMsg: `Room settings did not become available for "${roomName}"`,
  });
  await settings.click();

  const members = await driver.$(SELECTORS.membersButton);
  await members.waitForDisplayed({ timeout });
  await members.click();
  const membersTitle = await driver.$(roomMemberCountSelector());
  await membersTitle.waitForDisplayed({
    timeout,
    timeoutMsg: `Members list did not open for "${roomName}"`,
  });
}

async function runTest(driver, options = {}) {
  const env = options.env || process.env;
  requireQaServer(env, TEST_NAME);
  const config = resolveAudienceFilterConfig(env);

  if (!options.skipLogin) await ensureLoggedIn(driver);
  await ensureRoomsSectionReady(driver);

  const creation = await createPrivateRoom(driver, config.roomName, {
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

  await tapEnabledTextButton(driver, 'Save', DEFAULT_TIMEOUT);
  await waitForRoomOpen(driver, config.roomName, APPLY_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '08_filter_applied_room_open.png');

  await openRoomMembers(driver, config.roomName, APPLY_TIMEOUT);
  const joinedRoomMemberCount = await waitForRoomMemberCount(driver, 2, APPLY_TIMEOUT);
  console.log(`AudienceFilters: audience applied with ${joinedRoomMemberCount} joined members`);
  await saveScreenshot(driver, TEST_NAME, '09_audience_members_loaded.png');

  let cleanedRoomMemberCount = null;
  let cleanupWarning = null;
  try {
    await tapEnabledTextButton(driver, 'Edit', DEFAULT_TIMEOUT);
    await waitForText(driver, 'Edit Members', DEFAULT_TIMEOUT);
    await waitForText(driver, editedSummary, DEFAULT_TIMEOUT);
    await saveScreenshot(driver, TEST_NAME, '10_filter_persisted_in_members.png');

    await openAudienceFilterMenu(driver, editedSummary, DEFAULT_TIMEOUT);
    await tapByText(driver, 'Delete Filter', DEFAULT_TIMEOUT);
    await waitForTextHidden(driver, editedSummary);
    await saveScreenshot(driver, TEST_NAME, '11_filter_deleted_for_cleanup.png');

    await tapEnabledTextButton(driver, 'Save', DEFAULT_TIMEOUT);
    cleanedRoomMemberCount = await waitForRoomMemberCount(
      driver,
      1,
      DEFAULT_TIMEOUT,
      { exact: true }
    );
    await saveScreenshot(driver, TEST_NAME, '12_filter_cleanup_saved.png');
  } catch (error) {
    cleanupWarning = `Audience filter cleanup was not completed: ${error.message}`;
    console.warn(`AudienceFilters: ${cleanupWarning}`);
  }

  return {
    qaOnly: true,
    roomName: config.roomName,
    createdSummary,
    editedSummary,
    joinedRoomMemberCount,
    cleanedRoomMemberCount,
    cleanupWarning,
    timings: { roomCreationMs: creation.roomCreationMs },
  };
}

const test = defineTest({
  name: TEST_NAME,
  execute: runTest,
  prepareOptions: options => {
    const env = options.env || process.env;
    requireQaServer(env, TEST_NAME);
    resolveAudienceFilterConfig(env);
    return options;
  },
});
const { run } = test;

module.exports = {
  QA_AUDIENCE_FIXTURE,
  buildAudienceSummary,
  categoryFieldXPath,
  findAudienceFilterMenuButton,
  openAudienceFilterMenu,
  openAudienceFilterSheet,
  resolveAudienceFilterConfig,
  roomMemberCountSelector,
  run,
  runTest,
  selectAudienceValue,
  textFieldValue,
  typeUntilDropdownOptionVisible,
  visibleTextSelector,
  waitForRoomMemberCount,
};

test.runIfMain(module);
