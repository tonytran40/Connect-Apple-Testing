require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  runWithOptionalDriver,
  resetToHome,
  scrollUntilConversationEntryVisible,
} = require('../utils/testSession');

const TEST_NAME = 'favoriteRoom';
const FAVORITE_ROOM_NAME = process.env.FAVORITE_ROOM_NAME || 'Favorite Room';

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

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

/** Row bounds for swipe math (WDIO here often has no `getRect()` on elements). */
async function getRowRect(el) {
  if (typeof el.getRect === 'function') {
    return el.getRect();
  }
  const loc = await el.getLocation();
  const size = await el.getSize();
  return { x: loc.x, y: loc.y, width: size.width, height: size.height };
}

/** Hold at (fromX, y), then drag to (toX, y) — avoids opening the row like element-level long-press can. */
async function holdThenSwipeRight(driver, fromX, toX, y) {
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
  await driver.releaseActions();
}

function swipeEndpoints(rect, win) {
  const y = Math.round(rect.y + rect.height / 2);
  const fromX = Math.max(8, Math.round(rect.x + rect.width * 0.06));
  const toX = Math.min(win.width - 8, Math.round(rect.x + rect.width * 0.92));
  return { fromX, toX, y };
}

/**
 * Swipe the row right: coordinate hold+drag first, then one Appium drag fallback.
 */
async function swipeRightOnElement(driver, el) {
  const rect = await getRowRect(el);
  const win = await driver.getWindowRect();
  const { fromX, toX, y } = swipeEndpoints(rect, win);

  try {
    await holdThenSwipeRight(driver, fromX, toX, y);
    return;
  } catch (e) {
    console.warn(`favoriteRoom: hold+drag failed (${e?.message || e}), trying drag only`);
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

async function findRowElementForTitle(driver, title, displayTimeout = 2500) {
  const esc = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const byPredicate = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "${esc}" OR label == "${esc}")`
  );
  if (await byPredicate.isDisplayed().catch(() => false)) {
    return byPredicate;
  }

  const rowBtn = await driver.$(
    `//XCUIElementTypeStaticText[@name="${esc}" or @label="${esc}"]/ancestor::XCUIElementTypeButton[1]`
  );
  if (await rowBtn.isExisting().catch(() => false)) {
    await rowBtn.waitForDisplayed({ timeout: displayTimeout });
    return rowBtn;
  }

  const cell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${esc}" or @label="${esc}"]/ancestor::XCUIElementTypeCell[1]`
  );
  if (await cell.isExisting().catch(() => false)) {
    await cell.waitForDisplayed({ timeout: displayTimeout });
    return cell;
  }

  const other = await driver.$(
    `//XCUIElementTypeStaticText[@name="${esc}" or @label="${esc}"]/ancestor::XCUIElementTypeOther[1]`
  );
  if (await other.isExisting().catch(() => false)) {
    await other.waitForDisplayed({ timeout: displayTimeout });
    return other;
  }

  return null;
}

async function waitForFavoriteRow(driver, roomName) {
  const started = Date.now();
  let scrolls = 0;

  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    const row = await findRowElementForTitle(
      driver,
      roomName,
      Math.min(WAIT_INTERVAL_MS, 2500)
    ).catch(() => null);
    if (row) return row;

    if (scrolls < MAX_LIST_SCROLLS) {
      try {
        await driver.execute('mobile: scroll', { direction: 'down' });
      } catch {
        try {
          await driver.execute('mobile: swipe', { direction: 'down' });
        } catch {}
      }
      scrolls++;
    }

    await driver.pause(WAIT_INTERVAL_MS);
  }

  throw new Error(
    `Room "${roomName}" was not found after ${WAIT_TIMEOUT_MS}ms. ` +
      'Create the room or set FAVORITE_ROOM_NAME. Increase FAVORITE_ROOM_MAX_SCROLLS if it is below the fold.'
  );
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, POST_LOGIN_PAUSE_MS);
  }

  await resetToHome(driver);
  await pause(driver, POST_RESET_PAUSE_MS);
  await scrollUntilConversationEntryVisible(driver);
  await pause(driver, POST_SCROLL_PAUSE_MS);

  const row = await waitForFavoriteRow(driver, FAVORITE_ROOM_NAME);
  console.log(`favoriteRoom: found "${FAVORITE_ROOM_NAME}"`);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe.png');
  await swipeRightOnElement(driver, row);
  await pause(driver, POST_SWIPE_PAUSE_MS);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_right.png');
  
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

module.exports = { run, swipeRightOnElement, findRowElementForTitle, waitForFavoriteRow };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
