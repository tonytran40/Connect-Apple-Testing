const { createDriver } = require('../Login_Flow/Open_App');
const { SELECTORS, PREDICATES } = require('./selectors');
const { boundedInt, escapePredicateString, getElementRect } = require('./uiActions');

const ROOMS_HEADER_SELECTOR = PREDICATES.roomsHeaderButton;
const LOST_CONNECTIVITY_SELECTOR =
  '-ios predicate string:(name CONTAINS "Lost connection" OR label CONTAINS "Lost connection")';
const DEFAULT_CONNECTIVITY_RECOVERY_TIMEOUT_MS = boundedInt(
  process.env.CONNECT_CONNECTION_RECOVERY_TIMEOUT_MS,
  120000,
  5000,
  300000
);
// A room's navigation Back button can also be labeled "Rooms". The real
// conversation-list disclosure header is lower in the viewport.
const ROOMS_HEADER_MIN_Y = boundedInt(process.env.CONNECT_ROOMS_HEADER_MIN_Y, 120, 100, 240);

async function isDisplayed(driver, selector, timeout = 1000) {
  try {
    const el = await driver.$(selector);
    await el.waitForDisplayed({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function getVisibleRoomsHeader(driver, timeout = 800) {
  const selectors = [ROOMS_HEADER_SELECTOR, SELECTORS.roomsSectionHeader];

  for (const selector of selectors) {
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

async function connectivityToastVisible(driver) {
  const toast = await driver.$(LOST_CONNECTIVITY_SELECTOR);
  return toast.isDisplayed().catch(() => false);
}

async function waitForConnectivity(driver, options = {}) {
  if (!(await connectivityToastVisible(driver))) return false;

  const timeout = options.timeout ?? DEFAULT_CONNECTIVITY_RECOVERY_TIMEOUT_MS;
  const interval = options.interval ?? 1000;
  console.log(`Connectivity toast visible; waiting up to ${timeout}ms for recovery`);
  await driver.waitUntil(async () => !(await connectivityToastVisible(driver)), {
    timeout,
    interval,
    timeoutMsg: `Connect remained offline for ${timeout}ms`,
  });
  console.log('Connect connectivity recovered');
  return true;
}

async function runWithOptionalDriver(runTest, providedDriver) {
  const ownsDriver = !providedDriver;
  const driver = providedDriver || await createDriver();

  try {
    return await runTest(driver);
  } finally {
    if (ownsDriver && driver) {
      await driver.deleteSession();
    }
  }
}

async function tapBackLikeControl(driver) {
  const selectors = [
    SELECTORS.backButton,
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "Back" OR label CONTAINS "Back")`,
    '//XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]',
  ];

  for (const selector of selectors) {
    try {
      const el = await driver.$(selector);
      if (await el.isExisting().catch(() => false)) {
        if (await el.isDisplayed().catch(() => false)) {
          await el.click();
          return true;
        }
      }
    } catch {}
  }

  // Some SwiftUI navigation destinations render only the Font Awesome chevron
  // glyph, without the shared backButton identifier or a "Back" label. Restrict
  // this fallback to the top-leading navigation area so we never tap the first
  // content button (for example, a notification preference radio row).
  try {
    const windowRect = await driver.getWindowRect();
    const buttons = await driver.$$('//XCUIElementTypeButton');
    const maxX = windowRect.x + Math.max(80, windowRect.width * 0.2);
    const maxY = windowRect.y + Math.max(160, windowRect.height * 0.2);

    for (const button of buttons) {
      if (!(await button.isDisplayed().catch(() => false))) continue;
      const rect = await getElementRect(button).catch(() => null);
      if (!rect) continue;
      if (rect.x <= maxX && rect.y <= maxY) {
        await button.click();
        return true;
      }
    }
  } catch {}

  try {
    const rect = await driver.getWindowRect();
    await driver.execute('mobile: tap', {
      x: Math.round(rect.width * 0.055),
      y: Math.round(rect.height * 0.09),
    });
    return true;
  } catch {
    return false;
  }
}

async function goBack(driver, pauseMs = 500) {
  const tapped = await tapBackLikeControl(driver);
  if (!tapped) {
    throw new Error('Could not find a back-like control');
  }
  await driver.pause(pauseMs);
}

async function swipeViewport(driver, direction) {
  const rect = await driver.getWindowRect();
  const x = Math.round(rect.width * 0.5);
  const startY = Math.round(rect.height * (direction === 'down' ? 0.35 : 0.75));
  const endY = Math.round(rect.height * (direction === 'down' ? 0.78 : 0.35));

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 100 },
        { type: 'pointerMove', duration: 450, origin: 'viewport', x, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions().catch(() => {});
}

function scopedSwipeCoordinates(rect, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`Unsupported swipe direction: ${direction}`);
  }

  const rawValues = [rect?.x, rect?.y, rect?.width, rect?.height];
  if (rawValues.some(value => value === null || value === undefined || value === '')) {
    return null;
  }

  const values = rawValues.map(Number);
  if (values.some(value => !Number.isFinite(value)) || values[2] < 2 || values[3] < 40) {
    return null;
  }

  const [left, top, width, height] = values;
  const x = Math.round(left + width * 0.5);
  const upperY = Math.round(top + height * 0.25);
  const lowerY = Math.round(top + height * 0.75);
  return {
    x,
    startY: direction === 'down' ? upperY : lowerY,
    endY: direction === 'down' ? lowerY : upperY,
  };
}

function clipRectToViewport(rect, viewport) {
  const left = Math.max(Number(rect?.x), Number(viewport?.x || 0));
  const top = Math.max(Number(rect?.y), Number(viewport?.y || 0));
  const right = Math.min(
    Number(rect?.x) + Number(rect?.width),
    Number(viewport?.x || 0) + Number(viewport?.width)
  );
  const bottom = Math.min(
    Number(rect?.y) + Number(rect?.height),
    Number(viewport?.y || 0) + Number(viewport?.height)
  );

  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    return null;
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function performScopedSwipe(driver, coordinates) {
  try {
    await driver.performActions([
      {
        type: 'pointer',
        id: 'conversationListSwipe',
        parameters: { pointerType: 'touch' },
        actions: [
          {
            type: 'pointerMove',
            duration: 0,
            origin: 'viewport',
            x: coordinates.x,
            y: coordinates.startY,
          },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          {
            type: 'pointerMove',
            duration: 450,
            origin: 'viewport',
            x: coordinates.x,
            y: coordinates.endY,
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
  } finally {
    await driver.releaseActions().catch(() => {});
  }
}

/**
 * Swipe within the conversation-list accessibility element when possible.
 * Returns true for a scoped gesture and false when the viewport fallback was used.
 */
async function swipeConversationList(driver, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`Unsupported swipe direction: ${direction}`);
  }

  try {
    const container = await driver.$(SELECTORS.bookmarksScrollView);
    if (await container.isDisplayed().catch(() => false)) {
      const visibleRect = clipRectToViewport(
        await getElementRect(container),
        await driver.getWindowRect()
      );
      const coordinates = scopedSwipeCoordinates(visibleRect, direction);
      if (coordinates) {
        await performScopedSwipe(driver, coordinates);
        return true;
      }
    }
  } catch {}

  await swipeViewport(driver, direction);
  return false;
}

async function dismissGifPickerIfVisible(driver) {
  const gifTab = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND ' +
      '(label == "All GIFs" OR name == "All GIFs")'
  );
  if (!(await gifTab.isDisplayed().catch(() => false))) return false;

  const rect = await driver.getWindowRect();
  const x = Math.round(rect.width * 0.5);
  await driver.performActions([
    {
      type: 'pointer',
      id: 'dismissGifPicker',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x, y: Math.round(rect.height * 0.1) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 100 },
        { type: 'pointerMove', duration: 450, origin: 'viewport', x, y: Math.round(rect.height * 0.78) },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions().catch(() => {});
  await driver.pause(500);
  console.log('resetToHome: dismissed unfinished GIF picker');
  return true;
}

async function resetToHome(driver, maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    // Never use generic navigation fallbacks on the login screen.
    if (await isDisplayed(driver, SELECTORS.loginView, 300)) {
      return;
    }

    if (
      (await isDisplayed(driver, SELECTORS.peoplePlusButton)) ||
      (await getConversationListRoomsHeader(driver)) ||
      (await isDisplayed(driver, SELECTORS.settingsButton))
    ) {
      return true;
    }

    if (await dismissGifPickerIfVisible(driver)) {
      continue;
    }

    const skipForNow = await driver.$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Skip for now"'
    );
    if (await skipForNow.isDisplayed().catch(() => false)) {
      await skipForNow.click();
      await driver.pause(500);
      continue;
    }

    if (await tapBackLikeControl(driver)) {
      await driver.pause(500);
      continue;
    }

    if (await isDisplayed(driver, SELECTORS.closeButton, 500)) {
      await (await driver.$(SELECTORS.closeButton)).click();
      await driver.pause(500);
      continue;
    }

    if (await isDisplayed(driver, SELECTORS.sendMessageButton, 300)) {
      try {
        await driver.execute('mobile: pressButton', { name: 'return' });
        await driver.pause(300);
      } catch {}
    }

    await driver.activateApp(process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug');
    await driver.pause(800);
  }

  throw new Error('Could not return Connect to the conversation list');
}

const DEFAULT_ENTRY_MAX_SCROLLS = boundedInt(process.env.CONNECT_CONVERSATION_ENTRY_MAX_SCROLLS, 24, 4, 40);
const DEFAULT_ENTRY_SCROLL_PAUSE_MS = boundedInt(process.env.CONNECT_CONVERSATION_ENTRY_SCROLL_PAUSE_MS, 250, 120, 600);

async function scrollConversationListDown(driver) {
  await swipeConversationList(driver, 'up');
}

/**
 * Find a room title even when it is outside the current list viewport.
 * A fresh element query is used after every scroll to avoid stale XCTest references.
 */
async function waitForConversationRow(driver, names, opts = {}) {
  const candidates = (Array.isArray(names) ? names : [names])
    .map(name => String(name || '').trim())
    .filter(Boolean);
  if (!candidates.length) {
    throw new Error('waitForConversationRow requires at least one room name');
  }

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
      if (scrolls > 0) {
        console.log(`waitForConversationRow: found "${roomTitle}" after ${scrolls} scroll(s)`);
      }
      return { el: title, roomTitle };
    }

    if (scrolls >= maxScrolls) {
      break;
    }
    await scrollConversationListDown(driver);
    await driver.pause(pauseMs);
  }

  throw new Error(
    `None of [${candidates.join(', ')}] became visible after ${maxScrolls} list scroll(s)`
  );
}

/**
 * Scroll the main list down until ~peoplePlusButton or ~newConversationButton is visible (long room lists).
 * Env: CONNECT_CONVERSATION_ENTRY_MAX_SCROLLS, CONNECT_CONVERSATION_ENTRY_SCROLL_PAUSE_MS
 */
async function scrollUntilConversationEntryVisible(driver, opts = {}) {
  const maxScrolls = opts.maxScrolls ?? DEFAULT_ENTRY_MAX_SCROLLS;
  const pauseMs = opts.pauseMs ?? DEFAULT_ENTRY_SCROLL_PAUSE_MS;
  const peoplePlus = await driver.$(SELECTORS.peoplePlusButton);
  const newConversationButton = await driver.$(SELECTORS.newConversationButton);

  for (let i = 0; i < maxScrolls; i++) {
    const plus = await peoplePlus.isDisplayed().catch(() => false);
    const newConv = await newConversationButton.isDisplayed().catch(() => false);
    if (plus || newConv) {
      if (i > 0) {
        console.log(`scrollUntilConversationEntryVisible: entry control visible after ${i} scroll(s) down`);
      }
      return;
    }
    await swipeConversationList(driver, 'up');
    await driver.pause(pauseMs);
  }

  throw new Error(
    `Neither ~peoplePlusButton nor ~newConversationButton appeared after ${maxScrolls} downward scrolls`
  );
}

async function ensureRoomsSectionReady(driver, maxScrolls = 8) {
  await waitForConnectivity(driver);
  await resetToHome(driver);

  for (let i = 0; i < maxScrolls; i++) {
    if (await getConversationListRoomsHeader(driver, 800)) return;

    if (
      !(await isDisplayed(driver, SELECTORS.peoplePlusButton, 500)) &&
      !(await isDisplayed(driver, SELECTORS.newConversationButton, 500)) &&
      !(await isDisplayed(driver, SELECTORS.settingsButton, 500))
    ) {
      await resetToHome(driver);
    }

    await swipeConversationList(driver, 'down');
    await driver.pause(500);
  }

  throw new Error('Rooms section header was not visible from the conversation list');
}

module.exports = {
  runWithOptionalDriver,
  resetToHome,
  ensureRoomsSectionReady,
  goBack,
  clipRectToViewport,
  scopedSwipeCoordinates,
  scrollUntilConversationEntryVisible,
  swipeConversationList,
  waitForConnectivity,
  waitForConversationRow,
};
