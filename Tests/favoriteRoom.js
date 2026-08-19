require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  runWithOptionalDriver,
  resetToHome,
  ensureRoomsSectionReady,
  waitForConversationRow,
} = require('../utils/testSession');
const { escapePredicateString, getElementRect, pauseIfNeeded } = require('../utils/uiActions');
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
const POST_LOGIN_PAUSE_MS = intEnv('FAVORITE_ROOM_POST_LOGIN_PAUSE_MS', 400, 0, 2000);
const POST_RESET_PAUSE_MS = intEnv('FAVORITE_ROOM_POST_RESET_PAUSE_MS', 250, 0, 1500);
const POST_SCROLL_PAUSE_MS = intEnv('FAVORITE_ROOM_POST_SCROLL_PAUSE_MS', 200, 0, 1500);
const POST_SWIPE_PAUSE_MS = intEnv('FAVORITE_ROOM_POST_SWIPE_PAUSE_MS', 200, 0, 1500);

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

async function tapRevealedFavorite(driver, roomName) {
  const esc = escapePredicateString(roomName);
  const candidate = await driver.$(
    `//XCUIElementTypeStaticText[@name="${esc}" or @label="${esc}"]/preceding::XCUIElementTypeButton[@name="favoritesButton" or @label=""][1]`
  );

  const exists = await candidate.isExisting().catch(() => false);
  if (!exists) {
    throw new Error('favoriteRoom: favoritesButton next to room title was not found after swipe');
  }

  await candidate.waitForDisplayed({ timeout: 8000 });
  await candidate.click();
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const roomName = CONFIGURED_FAVORITE_ROOM_NAME || generateRoomName('00-Favorite', 'A');

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pauseIfNeeded(driver, POST_LOGIN_PAUSE_MS);
  }

  await resetToHome(driver);
  await pauseIfNeeded(driver, POST_RESET_PAUSE_MS);
  if (!CONFIGURED_FAVORITE_ROOM_NAME) {
    console.log(`favoriteRoom: creating isolated room "${roomName}"`);
    await createPublicRoom(driver, roomName);
    await resetToHome(driver);
  }
  await ensureRoomsSectionReady(driver);
  await pauseIfNeeded(driver, POST_SCROLL_PAUSE_MS);

  const row = await waitForFavoriteRow(driver, roomName);
  console.log(`favoriteRoom: found "${roomName}"`);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe.png');
  await swipeRightOnElement(driver, row);
  await pauseIfNeeded(driver, POST_SWIPE_PAUSE_MS);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_right.png');
  await tapRevealedFavorite(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '03_after_click_favorites.png');

  // Toggle off: same row action again (swipe actions usually collapse after tap).
  const rowAgain = await waitForFavoriteRow(driver, roomName);
  await pauseIfNeeded(driver, 400);
  await swipeRightOnElement(driver, rowAgain);
  await pauseIfNeeded(driver, POST_SWIPE_PAUSE_MS);
  await tapRevealedFavorite(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '04_after_unfavorite.png');
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver, options);
    } catch (err) {
      try {
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
