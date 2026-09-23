require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { defineTest } = require('../utils/testHarness');
const {
  resetToHome,
  ensureRoomsSectionReady,
  waitForConversationRow,
} = require('../utils/testSession');
const { escapePredicateString, getElementRect } = require('../utils/uiActions');
const { createPublicRoom, generateRoomName } = require('./CreateRoom');

const TEST_NAME = 'favoriteRoom';
const CONFIGURED_FAVORITE_ROOM_NAME = process.env.FAVORITE_ROOM_NAME || '';

function intEnv(name, fallback, min, max) {
  const n = parseInt(process.env[name], 10);
  const v = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

const WAIT_TIMEOUT_MS = intEnv('FAVORITE_ROOM_WAIT_TIMEOUT_MS', 30000, 5000, 120000);
const WAIT_INTERVAL_MS = intEnv('FAVORITE_ROOM_WAIT_INTERVAL_MS', 400, 150, 2000);
const MAX_LIST_SCROLLS = intEnv('FAVORITE_ROOM_MAX_SCROLLS', 12, 0, 30);
const SWIPE_HOLD_MS = intEnv('FAVORITE_ROOM_SWIPE_HOLD_MS', 120, 40, 800);
const SWIPE_MOVE_MS = intEnv('FAVORITE_ROOM_SWIPE_MOVE_MS', 200, 80, 600);

async function holdThenSwipeRight(driver, fromX, toX, y) {
  try {
    await driver.performActions([
      {
        type: 'pointer',
        id: 'favoriteRoomFinger',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: fromX, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: SWIPE_HOLD_MS },
          { type: 'pointerMove', duration: SWIPE_MOVE_MS, x: toX, y },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
  } finally {
    await driver.releaseActions().catch(() => {});
  }
}

async function swipeRightOnElement(driver, el) {
  const rect = await getElementRect(el);
  const win = await driver.getWindowRect();
  const y = Math.round(rect.y + rect.height / 2);
  const fromX = Math.max(8, Math.round(win.width * 0.08));
  const toX = Math.min(win.width - 8, Math.round(win.width * 0.55));

  try {
    await holdThenSwipeRight(driver, fromX, toX, y);
    return;
  } catch (err) {
    console.warn(`favoriteRoom: hold+drag failed (${err?.message || err}), trying drag only`);
  }

  const safeToX = Math.max(fromX + 2, toX);
  await driver.execute('mobile: dragFromToForDuration', {
    fromX,
    fromY: y,
    toX: safeToX,
    toY: y,
    duration: 0.28,
  });
}

async function waitForFavoriteRow(driver, roomName) {
  const { el } = await waitForConversationRow(driver, roomName, {
    exact: true,
    timeout: WAIT_TIMEOUT_MS,
    maxScrolls: MAX_LIST_SCROLLS,
    pauseMs: WAIT_INTERVAL_MS,
  });
  return el;
}

async function waitForRevealedFavorite(driver, roomName) {
  const esc = escapePredicateString(roomName);
  const candidate = await driver.$(
    `//XCUIElementTypeStaticText[@name="${esc}" or @label="${esc}"]/preceding::XCUIElementTypeButton[@name="favoritesButton" or @label=""][1]`
  );
  await candidate.waitForDisplayed({ timeout: 8000 });
  return candidate;
}

async function tapRevealedFavorite(driver, roomName) {
  const candidate = await waitForRevealedFavorite(driver, roomName);
  await candidate.click();
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const roomName = CONFIGURED_FAVORITE_ROOM_NAME || generateRoomName('00-Favorite', 'A');

  if (!skipLogin) {
    await ensureLoggedIn(driver);
  }

  await resetToHome(driver);
  if (!CONFIGURED_FAVORITE_ROOM_NAME) {
    console.log(`favoriteRoom: creating isolated room "${roomName}"`);
    await createPublicRoom(driver, roomName);
    await resetToHome(driver);
  }
  await ensureRoomsSectionReady(driver);

  const row = await waitForFavoriteRow(driver, roomName);
  console.log(`favoriteRoom: found "${roomName}"`);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe.png');
  await swipeRightOnElement(driver, row);
  await waitForRevealedFavorite(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_right.png');
  await tapRevealedFavorite(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '03_after_click_favorites.png');

  // Toggle off: same row action again (swipe actions usually collapse after tap).
  const rowAgain = await waitForFavoriteRow(driver, roomName);
  await swipeRightOnElement(driver, rowAgain);
  await tapRevealedFavorite(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '04_after_unfavorite.png');
}

const test = defineTest({ name: TEST_NAME, execute: runTest });
const { run } = test;

module.exports = { run };

test.runIfMain(module);
