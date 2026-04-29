const { createDriver } = require('../Login_Flow/Open_App');

async function isDisplayed(driver, selector, timeout = 1000) {
  try {
    const el = await driver.$(selector);
    await el.waitForDisplayed({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function runWithOptionalDriver(runTest, providedDriver) {
  const ownsDriver = !providedDriver;
  const driver = providedDriver || await createDriver();

  try {
    await runTest(driver);
  } finally {
    if (ownsDriver && driver) {
      await driver.deleteSession();
    }
  }
}

async function tapBackLikeControl(driver) {
  const selectors = [
    '~backButton',
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "Back" OR label CONTAINS "Back")`,
    '//XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]',
    '(//XCUIElementTypeButton)[1]',
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

  try {
    const rect = await driver.getWindowRect();
    await driver.execute('mobile: tap', {
      x: Math.round(rect.width * 0.08),
      y: Math.round(rect.height * 0.12),
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

async function resetToHome(driver, maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    if (
      (await isDisplayed(driver, '~peoplePlusButton')) ||
      (await isDisplayed(driver, '~Rooms section header')) ||
      (await isDisplayed(driver, '~settingsButton'))
    ) {
      return;
    }

    if (await tapBackLikeControl(driver)) {
      await driver.pause(500);
      continue;
    }

    if (await isDisplayed(driver, '~closeButton', 500)) {
      await (await driver.$('~closeButton')).click();
      await driver.pause(500);
      continue;
    }

    if (await isDisplayed(driver, '~sendMessageButton', 300)) {
      try {
        await driver.execute('mobile: pressButton', { name: 'return' });
        await driver.pause(300);
      } catch {}
    }

    await driver.activateApp('com.powerhrg.connect.v3.debug');
    await driver.pause(800);
  }
}

function boundedInt(envVal, fallback, min, max) {
  const n = parseInt(envVal, 10);
  const v = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

const DEFAULT_ENTRY_MAX_SCROLLS = boundedInt(process.env.CONNECT_CONVERSATION_ENTRY_MAX_SCROLLS, 24, 4, 40);
const DEFAULT_ENTRY_SCROLL_PAUSE_MS = boundedInt(process.env.CONNECT_CONVERSATION_ENTRY_SCROLL_PAUSE_MS, 250, 120, 600);

/**
 * Scroll the main list down until ~peoplePlusButton or ~newConversationButton is visible (long room lists).
 * Env: CONNECT_CONVERSATION_ENTRY_MAX_SCROLLS, CONNECT_CONVERSATION_ENTRY_SCROLL_PAUSE_MS
 */
async function scrollUntilConversationEntryVisible(driver, opts = {}) {
  const maxScrolls = opts.maxScrolls ?? DEFAULT_ENTRY_MAX_SCROLLS;
  const pauseMs = opts.pauseMs ?? DEFAULT_ENTRY_SCROLL_PAUSE_MS;
  const peoplePlus = await driver.$('~peoplePlusButton');
  const newConversationButton = await driver.$('~newConversationButton');

  for (let i = 0; i < maxScrolls; i++) {
    const plus = await peoplePlus.isDisplayed().catch(() => false);
    const newConv = await newConversationButton.isDisplayed().catch(() => false);
    if (plus || newConv) {
      if (i > 0) {
        console.log(`scrollUntilConversationEntryVisible: entry control visible after ${i} scroll(s) down`);
      }
      return;
    }
    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
    } catch {
      try {
        await driver.execute('mobile: swipe', { direction: 'down' });
      } catch {}
    }
    await driver.pause(pauseMs);
  }

  throw new Error(
    `Neither ~peoplePlusButton nor ~newConversationButton appeared after ${maxScrolls} downward scrolls`
  );
}

async function ensureRoomsSectionReady(driver, maxScrolls = 6) {
  for (let i = 0; i < maxScrolls; i++) {
    if (await isDisplayed(driver, '~Rooms section header', 800)) {
      return;
    }

    if (!(await isDisplayed(driver, '~peoplePlusButton', 800))) {
      await resetToHome(driver);
    }

    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
    } catch {}
    await driver.pause(500);
  }

  throw new Error('Rooms section header was not visible from the conversation list');
}

module.exports = {
  runWithOptionalDriver,
  resetToHome,
  ensureRoomsSectionReady,
  goBack,
  scrollUntilConversationEntryVisible,
};
