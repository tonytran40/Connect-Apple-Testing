const { SELECTORS, PREDICATES } = require('./selectors');
const { boundedInt, escapePredicateString } = require('./uiActions');
const { swipeConversationList } = require('./gestureNavigation');
const { waitForConnectivity } = require('./sessionConnectivity');

const ROOMS_HEADER_SELECTOR = PREDICATES.roomsHeaderButton;
const EVENTS_HEADER_SELECTOR =
  '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
  '(name CONTAINS "Events" OR label CONTAINS "Events")';
const ROOMS_HEADER_MIN_Y = boundedInt(process.env.CONNECT_ROOMS_HEADER_MIN_Y, 120, 100, 240);
const DEFAULT_ROOMS_TOP_SETTLE_MS = boundedInt(process.env.CONNECT_ROOMS_TOP_SETTLE_MS, 350, 100, 1200);
const DEFAULT_ROOMS_TOP_SWIPE_PAUSE_MS = boundedInt(process.env.CONNECT_ROOMS_TOP_SWIPE_PAUSE_MS, 100, 0, 500);
const DEFAULT_ENTRY_MAX_SCROLLS = boundedInt(process.env.CONNECT_CONVERSATION_ENTRY_MAX_SCROLLS, 24, 4, 40);
const DEFAULT_ENTRY_SCROLL_PAUSE_MS = boundedInt(process.env.CONNECT_CONVERSATION_ENTRY_SCROLL_PAUSE_MS, 250, 120, 600);

async function getVisibleRoomsHeader(driver, timeout = 800) {
  for (const selector of [ROOMS_HEADER_SELECTOR, SELECTORS.roomsSectionHeader]) {
    try {
      const el = await driver.$(selector);
      await el.waitForDisplayed({ timeout });
      return el;
    } catch {}
  }
  return null;
}

async function getConversationListRoomsHeader(driver, timeout = 800) {
  const header = await getVisibleRoomsHeader(driver, timeout);
  if (!header) return null;
  const location = await header.getLocation().catch(() => null);
  return location && Number(location.y) >= ROOMS_HEADER_MIN_Y ? header : null;
}

async function scrollConversationListToTop(driver, options = {}) {
  const maxSwipes = options.maxSwipes ?? 8;
  const settleMs = options.settleMs ?? DEFAULT_ROOMS_TOP_SETTLE_MS;
  const swipePauseMs = options.swipePauseMs ?? DEFAULT_ROOMS_TOP_SWIPE_PAUSE_MS;

  if (await getConversationListRoomsHeader(driver, 300)) return true;

  try {
    const rect = await driver.getWindowRect();
    await driver.execute('mobile: tap', {
      x: Math.round(rect.x + rect.width * 0.12),
      y: Math.round(rect.y + Math.max(8, Math.min(20, rect.height * 0.02))),
    });
    if (await getConversationListRoomsHeader(driver, settleMs + 500)) {
      console.log('scrollConversationListToTop: Rooms controls restored with status-bar tap');
      return true;
    }
  } catch {}

  try {
    const eventsHeader = await driver.$(EVENTS_HEADER_SELECTOR);
    if (await eventsHeader.isDisplayed().catch(() => false)) {
      await eventsHeader.click();
      if (await getConversationListRoomsHeader(driver, settleMs + 500)) {
        console.log('scrollConversationListToTop: collapsed Events to restore Rooms controls');
        return true;
      }
    }
  } catch {}

  for (let i = 0; i < maxSwipes; i++) {
    await swipeConversationList(driver, 'down', { holdMs: 20, durationMs: 180 });
    // Preserve the short XCTest/gesture settling delay before querying a fresh tree.
    if (swipePauseMs > 0) await driver.pause(swipePauseMs);
    if (await getConversationListRoomsHeader(driver, 300)) {
      console.log(`scrollConversationListToTop: Rooms controls restored after ${i + 1} fast swipe(s)`);
      return true;
    }
  }
  return false;
}

async function waitForConversationRow(driver, names, opts = {}) {
  const candidates = (Array.isArray(names) ? names : [names]).map(name => String(name || '').trim()).filter(Boolean);
  if (!candidates.length) throw new Error('waitForConversationRow requires at least one room name');

  const exact = opts.exact === true;
  const timeout = opts.timeout ?? 30000;
  const maxScrolls = opts.maxScrolls ?? DEFAULT_ENTRY_MAX_SCROLLS;
  const pauseMs = opts.pauseMs ?? DEFAULT_ENTRY_SCROLL_PAUSE_MS;
  const comparisons = candidates.map(name => {
    const safe = escapePredicateString(name);
    const operator = exact ? '==' : 'CONTAINS[c]';
    return `(name ${operator} "${safe}" OR label ${operator} "${safe}")`;
  });
  const selector =
    '-ios predicate string:' +
    '(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton" OR ' +
    'type == "XCUIElementTypeOther" OR type == "XCUIElementTypeCell") AND ' +
    `(${comparisons.join(' OR ')})`;
  await waitForConnectivity(driver, { timeout: opts.connectivityTimeout });
  const deadline = Date.now() + timeout;

  for (let scrolls = 0; Date.now() < deadline; scrolls++) {
    const title = await driver.$(selector);
    if (await title.isDisplayed().catch(() => false)) {
      const name = await title.getAttribute('name').catch(() => '');
      const label = await title.getAttribute('label').catch(() => '');
      const roomTitle = (name && String(name).trim()) || (label && String(label).trim()) || candidates[0];
      if (scrolls > 0) console.log(`waitForConversationRow: found "${roomTitle}" after ${scrolls} scroll(s)`);
      return { el: title, roomTitle };
    }
    if (scrolls >= maxScrolls) break;
    await swipeConversationList(driver, 'up');
    // The list must settle before XCTest can return a fresh, non-stale row.
    await driver.pause(pauseMs);
  }

  throw new Error(`None of [${candidates.join(', ')}] became visible after ${maxScrolls} list scroll(s)`);
}

async function scrollUntilConversationEntryVisible(driver, opts = {}) {
  const maxScrolls = opts.maxScrolls ?? DEFAULT_ENTRY_MAX_SCROLLS;
  const pauseMs = opts.pauseMs ?? DEFAULT_ENTRY_SCROLL_PAUSE_MS;
  const peoplePlus = await driver.$(SELECTORS.peoplePlusButton);
  const newConversationButton = await driver.$(SELECTORS.newConversationButton);

  for (let i = 0; i < maxScrolls; i++) {
    if ((await peoplePlus.isDisplayed().catch(() => false)) || (await newConversationButton.isDisplayed().catch(() => false))) {
      if (i > 0) console.log(`scrollUntilConversationEntryVisible: entry control visible after ${i} scroll(s) down`);
      return;
    }
    await swipeConversationList(driver, 'up');
    await driver.pause(pauseMs);
  }
  throw new Error(`Neither ~peoplePlusButton nor ~newConversationButton appeared after ${maxScrolls} downward scrolls`);
}

module.exports = {
  getConversationListRoomsHeader,
  scrollConversationListToTop,
  scrollUntilConversationEntryVisible,
  waitForConversationRow,
};
