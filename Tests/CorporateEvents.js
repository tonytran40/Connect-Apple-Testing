require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  resetToHome,
  runWithOptionalDriver,
  swipeConversationList,
  waitForConnectivity,
} = require('../utils/testSession');
const { APP_STATE, waitForAppState } = require('../utils/systemFlowDraft');
const { escapePredicateString, getElementRect } = require('../utils/uiActions');

const TEST_NAME = 'CorporateEvents';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.CORPORATE_EVENTS_TIMEOUT_MS, 10) || 30000;
const DEFAULT_EXPECTED_SECTION = 'Automate test 1';
const DEFAULT_EXPECTED_ITEM = 'CORPORATE AUTOMATE ROOM';
const DEFAULT_DM_ITEM = 'JONATHAN LEVY';
const DEFAULT_EXPECTED_DM = 'Jonathan Levy';
const DEFAULT_ROOM_ITEM = 'CORPORATE AUTOMATE ROOM';
const DEFAULT_EXPECTED_ROOM = 'Corporate Automate Room';
const DEFAULT_URL_ITEM = 'GOOGLE';
const CONNECT_BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';
const EXTERNAL_NAVIGATION_TIMEOUT =
  Number.parseInt(process.env.CORPORATE_EVENTS_EXTERNAL_TIMEOUT_MS, 10) || 10000;
const EVENTS_HEADER_SELECTOR =
  '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
  '(name CONTAINS "Events" OR label CONTAINS "Events")';
const UNLABELED_BUTTON_SELECTOR = '//XCUIElementTypeButton[not(@name) and not(@label)]';

class BlockedTestError extends Error {
  constructor(reason, options) {
    super(`BLOCKED: ${reason}`, options);
    this.name = 'BlockedTestError';
    this.code = 'TEST_BLOCKED';
    this.status = 'BLOCKED';
  }
}

function booleanEnv(value) {
  return ['1', 'true'].includes(String(value || '').trim().toLowerCase());
}

function fixtureValue(env, key, fallback) {
  return Object.hasOwn(env, key) ? String(env[key] || '').trim() : fallback;
}

function pairedFixtureValues(env, itemKey, destinationKey, defaultItem, defaultDestination) {
  const hasItem = Object.hasOwn(env, itemKey);
  const hasDestination = Object.hasOwn(env, destinationKey);
  if (hasItem !== hasDestination) {
    throw new BlockedTestError(`${itemKey} and ${destinationKey} must be configured together`);
  }
  return {
    item: hasItem ? String(env[itemKey] || '').trim() : defaultItem,
    destination: hasDestination
      ? String(env[destinationKey] || '').trim()
      : defaultDestination,
  };
}

function applyStandaloneDefaults(env = process.env) {
  if (!env.CONNECT_SERVER_NAME) env.CONNECT_SERVER_NAME = 'QA';
  if (!env.CORPORATE_EVENTS_ENABLED) env.CORPORATE_EVENTS_ENABLED = '1';
  return env;
}

function validateCorporateEventsFixture(env = process.env) {
  const serverName = String(env.CONNECT_SERVER_NAME || '').trim();
  if (serverName.toLowerCase() !== 'qa') {
    throw new BlockedTestError(
      `Corporate Events automation is QA-only; CONNECT_SERVER_NAME was "${serverName || 'unset'}"`
    );
  }
  if (!booleanEnv(env.CORPORATE_EVENTS_ENABLED)) {
    throw new BlockedTestError(
      'Corporate Events automation is opt-in; set CORPORATE_EVENTS_ENABLED=1'
    );
  }

  const dm = pairedFixtureValues(
    env,
    'CORPORATE_EVENTS_DM_ITEM',
    'CORPORATE_EVENTS_EXPECTED_DM',
    DEFAULT_DM_ITEM,
    DEFAULT_EXPECTED_DM
  );
  const room = pairedFixtureValues(
    env,
    'CORPORATE_EVENTS_ROOM_ITEM',
    'CORPORATE_EVENTS_EXPECTED_ROOM',
    DEFAULT_ROOM_ITEM,
    DEFAULT_EXPECTED_ROOM
  );
  const fixture = {
    serverName,
    expectedSection: fixtureValue(
      env,
      'CORPORATE_EVENTS_EXPECTED_SECTION',
      DEFAULT_EXPECTED_SECTION
    ),
    expectedItem: fixtureValue(env, 'CORPORATE_EVENTS_EXPECTED_ITEM', DEFAULT_EXPECTED_ITEM),
    dmItem: dm.item,
    expectedDm: dm.destination,
    roomItem: room.item,
    expectedRoom: room.destination,
    urlItem: fixtureValue(env, 'CORPORATE_EVENTS_URL_ITEM', DEFAULT_URL_ITEM),
  };
  const missing = [];
  if (!fixture.expectedSection) missing.push('CORPORATE_EVENTS_EXPECTED_SECTION');
  if (!fixture.expectedItem) missing.push('CORPORATE_EVENTS_EXPECTED_ITEM');
  if (missing.length) {
    throw new BlockedTestError(`Missing deterministic Corporate Events fixture: ${missing.join(', ')}`);
  }
  if (Boolean(fixture.dmItem) !== Boolean(fixture.expectedDm)) {
    throw new BlockedTestError('Corporate Events DM item and destination must both be non-empty');
  }
  if (Boolean(fixture.roomItem) !== Boolean(fixture.expectedRoom)) {
    throw new BlockedTestError('Corporate Events room item and destination must both be non-empty');
  }

  return fixture;
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

function visibleButtonSelector(text, exact = true) {
  const safe = escapePredicateString(text);
  const comparison = exact ? '==' : 'CONTAINS';
  return (
    '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
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

async function waitForVisibleText(driver, text, timeout = DEFAULT_TIMEOUT, exact = true) {
  let element;
  await driver.waitUntil(async () => {
    element = await firstVisible(driver, visibleTextSelector(text, exact));
    return Boolean(element);
  }, {
    timeout,
    interval: 200,
    timeoutMsg: `Corporate Events did not display "${text}"`,
  });
  return element;
}

async function waitForVisibleButton(driver, text, timeout = DEFAULT_TIMEOUT, exact = true) {
  let element;
  await driver.waitUntil(async () => {
    element = await firstVisible(driver, visibleButtonSelector(text, exact));
    return Boolean(element);
  }, {
    timeout,
    interval: 200,
    timeoutMsg: `Corporate Events did not display tappable item "${text}"`,
  });
  return element;
}

async function findEventsHeader(driver, timeout = DEFAULT_TIMEOUT) {
  let header;
  await driver.waitUntil(async () => {
    header = await firstVisible(driver, EVENTS_HEADER_SELECTOR);
    return Boolean(header);
  }, {
    timeout,
    interval: 250,
    timeoutMsg: 'Corporate Events did not display the Events section header',
  });
  return header;
}

async function scrollToEventsHeader(driver, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;

  try {
    const rect = await driver.getWindowRect();
    await driver.execute('mobile: tap', {
      x: Math.round(rect.x + rect.width * 0.12),
      y: Math.round(rect.y + Math.max(8, Math.min(20, rect.height * 0.02))),
    });
    await driver.pause(350);
  } catch {}

  for (let attempt = 0; Date.now() < deadline; attempt++) {
    const header = await firstVisible(driver, EVENTS_HEADER_SELECTOR);
    if (header) return header;
    if (attempt >= 8) break;
    await swipeConversationList(driver, 'down', { holdMs: 20, durationMs: 180 });
    await driver.pause(120);
  }

  throw new BlockedTestError('No active Corporate Events fixture was visible in QA');
}

async function findEventBannerButton(driver, header, timeout = DEFAULT_TIMEOUT) {
  const headerRect = await getElementRect(header);
  const windowRect = await driver.getWindowRect();
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const candidates = [];
    for (const button of await driver.$$(UNLABELED_BUTTON_SELECTOR)) {
      if (!(await button.isDisplayed().catch(() => false))) continue;
      const rect = await getElementRect(button).catch(() => null);
      if (!rect) continue;

      const followsHeader = rect.y >= headerRect.y + headerRect.height - 2;
      const nearHeader = rect.y <= headerRect.y + headerRect.height + windowRect.height * 0.28;
      const spansList = rect.width >= windowRect.width * 0.85;
      const bannerHeight = rect.height >= 60;
      if (followsHeader && nearHeader && spansList && bannerHeight) {
        candidates.push({ button, rect });
      }
    }
    candidates.sort((left, right) => left.rect.y - right.rect.y);
    if (candidates[0]) return candidates[0].button;
    await driver.pause(200);
  }

  return null;
}

async function ensureEventExpanded(driver, fixture, timeout = DEFAULT_TIMEOUT) {
  const existingItem = await firstVisible(driver, visibleTextSelector(fixture.expectedItem));
  if (existingItem) {
    await waitForVisibleText(driver, fixture.expectedSection, timeout);
    return { expandedNow: false, item: existingItem };
  }

  let header = await scrollToEventsHeader(driver, timeout);
  let banner = await findEventBannerButton(driver, header, 1500);
  if (!banner) {
    await header.click();
    await driver.pause(650);
    header = await findEventsHeader(driver, timeout);
    banner = await findEventBannerButton(driver, header, timeout);
  }
  if (!banner) {
    throw new BlockedTestError('QA exposed an Events section but no selectable event banner');
  }

  await banner.click();
  let section;
  let item;
  try {
    section = await waitForVisibleText(driver, fixture.expectedSection, 2000).catch(() => null);
    if (!section) {
      // SwiftUI can expose the inner disclosure before the outer expansion
      // animation accepts taps. Re-query and retry only while still collapsed.
      header = await findEventsHeader(driver, timeout);
      banner = await findEventBannerButton(driver, header, timeout);
      if (!banner) throw new Error('Corporate Event banner disappeared before expansion');
      await banner.click();
    }
    section = await waitForVisibleText(driver, fixture.expectedSection, timeout);
    item = await waitForVisibleText(driver, fixture.expectedItem, timeout);
  } catch (error) {
    throw new BlockedTestError(
      `Configured QA Corporate Events fixture was not available: ` +
      `${fixture.expectedSection} / ${fixture.expectedItem}`,
      { cause: error }
    );
  }
  return { expandedNow: true, section, item };
}

async function collapseEventsSection(driver) {
  const header = await firstVisible(driver, EVENTS_HEADER_SELECTOR);
  if (!header) return false;
  await header.click();
  await driver.pause(350);
  return true;
}

async function waitForExpectedRoom(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const safe = escapePredicateString(roomName);
  const roomTitle =
    '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
    `(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`;
  let title;
  await driver.waitUntil(async () => {
    title = await firstVisible(driver, roomTitle);
    return Boolean(title);
  }, {
    timeout,
    interval: 200,
    timeoutMsg: `Corporate Event item did not open expected room "${roomName}"`,
  });
  return title;
}

async function openConversationItem(driver, fixture, options) {
  const item = await waitForVisibleButton(
    driver,
    options.itemLabel,
    DEFAULT_TIMEOUT,
    options.exact !== false
  );
  await item.click();
  await waitForExpectedRoom(driver, options.expectedTitle);
  await saveScreenshot(driver, TEST_NAME, options.openedScreenshot);

  await resetToHome(driver);
  await scrollToEventsHeader(driver);
  await ensureEventExpanded(driver, fixture);
  await saveScreenshot(driver, TEST_NAME, options.returnedScreenshot);
}

async function openUrlItem(driver, fixture) {
  const urlItem = await waitForVisibleButton(driver, fixture.urlItem);
  await urlItem.click();
  try {
    await waitForAppState(
      driver,
      CONNECT_BUNDLE_ID,
      [APP_STATE.BACKGROUND_SUSPENDED, APP_STATE.BACKGROUND],
      { timeout: EXTERNAL_NAVIGATION_TIMEOUT }
    );
  } catch (error) {
    throw new Error(
      `Corporate Event URL item "${fixture.urlItem}" did not open an external app. ` +
      'Verify the event uses a fully qualified URL such as https://www.google.com.',
      { cause: error }
    );
  }
  await saveScreenshot(driver, TEST_NAME, '06_external_url_opened.png');

  await driver.activateApp(CONNECT_BUNDLE_ID);
  await waitForAppState(driver, CONNECT_BUNDLE_ID, APP_STATE.FOREGROUND, {
    timeout: DEFAULT_TIMEOUT,
  });
  await waitForVisibleText(driver, fixture.expectedItem, DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, '07_returned_to_connect.png');
}

async function runTest(driver, options = {}) {
  const fixture = options.fixture || validateCorporateEventsFixture(options.env || process.env);

  if (!options.skipLogin) await ensureLoggedIn(driver);
  try {
    await waitForConnectivity(driver);
  } catch (error) {
    throw new BlockedTestError('QA connectivity did not recover for Corporate Events', {
      cause: error,
    });
  }
  await resetToHome(driver);
  const expansion = await ensureEventExpanded(driver, fixture);
  try {
    await saveScreenshot(driver, TEST_NAME, '01_events_expanded.png');

    if (fixture.dmItem) {
      await openConversationItem(driver, fixture, {
        itemLabel: fixture.dmItem,
        expectedTitle: fixture.expectedDm,
        exact: false,
        openedScreenshot: '02_dm_item_opened.png',
        returnedScreenshot: '03_returned_after_dm.png',
      });
    }
    if (fixture.roomItem) {
      await openConversationItem(driver, fixture, {
        itemLabel: fixture.roomItem,
        expectedTitle: fixture.expectedRoom,
        openedScreenshot: '04_room_item_opened.png',
        returnedScreenshot: '05_returned_after_room.png',
      });
    }
    if (fixture.urlItem) await openUrlItem(driver, fixture);

    const validated = [fixture.expectedSection, fixture.expectedItem];
    if (fixture.dmItem) validated.push(`${fixture.dmItem} -> ${fixture.expectedDm}`);
    if (fixture.roomItem) validated.push(`${fixture.roomItem} -> ${fixture.expectedRoom}`);
    if (fixture.urlItem) validated.push(`${fixture.urlItem} -> external browser`);
    return {
      qaOnly: true,
      notes: `Validated Corporate Events: ${validated.join('; ')}`,
    };
  } finally {
    if (expansion.expandedNow) {
      await resetToHome(driver).catch(() => {});
      await collapseEventsSection(driver).catch(() => {});
    }
  }
}

async function run(driver, options = {}) {
  const fixture = options.fixture || validateCorporateEventsFixture(options.env || process.env);
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
  EVENTS_HEADER_SELECTOR,
  UNLABELED_BUTTON_SELECTOR,
  applyStandaloneDefaults,
  booleanEnv,
  collapseEventsSection,
  ensureEventExpanded,
  findEventBannerButton,
  openConversationItem,
  pairedFixtureValues,
  run,
  runTest,
  scrollToEventsHeader,
  validateCorporateEventsFixture,
  visibleButtonSelector,
  visibleTextSelector,
  waitForVisibleButton,
  waitForExpectedRoom,
};

if (require.main === module) {
  applyStandaloneDefaults();
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
