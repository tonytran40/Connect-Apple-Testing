require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  ensureRoomsSectionReady,
  goBack,
  resetToHome,
  runWithOptionalDriver,
  waitForConversationRow,
} = require('../utils/testSession');
const { escapePredicateString: esc, getElementRect, pauseIfNeeded: pause } = require('../utils/uiActions');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'removeRoom';
const CANDIDATES = (process.env.REMOVE_ROOM_CANDIDATES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const WAIT_MS = Number.parseInt(process.env.REMOVE_ROOM_WAIT_TIMEOUT_MS, 10) || 30000;
const POLL_MS = Number.parseInt(process.env.REMOVE_ROOM_POLL_MS, 10) || 400;

/** Row mid-Y for a horizontal swipe (getRect is unreliable on some WDIO elements). */
async function rowMidY(el) {
  const rect = await getElementRect(el);
  return Math.round(rect.y + rect.height / 2);
}

async function swipeLeftOnRow(driver, el) {
  const y = await rowMidY(el);
  const win = await driver.getWindowRect();
  const fromX = Math.min(win.width - 8, Math.round(win.width * 0.92));
  const toX = Math.max(8, Math.round(win.width * 0.45));

  try {
    await driver.performActions([
      {
        type: 'pointer',
        id: 'removeRoomSwipe',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: fromX, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 120 },
          { type: 'pointerMove', duration: 220, x: toX, y },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
  } catch (e) {
    console.warn(`removeRoom: performActions swipe failed (${e?.message || e}), using drag`);
    await driver.releaseActions().catch(() => {});
    await driver.execute('mobile: dragFromToForDuration', {
      fromX,
      fromY: y,
      toX: Math.min(fromX - 2, toX),
      toY: y,
      duration: 0.28,
    });
  } finally {
    await driver.releaseActions().catch(() => {});
  }
}

/** First visible title matching any candidate substring; returns element + full title for XPath. */
async function waitForTargetRow(driver, names, exact = false) {
  return waitForConversationRow(driver, names, {
    exact,
    timeout: WAIT_MS,
    pauseMs: POLL_MS,
  });
}

async function tapRemoveBesideTitle(driver, roomTitle) {
  const q = esc(roomTitle);
  const xpaths = [
    `//XCUIElementTypeStaticText[@name="${q}" or @label="${q}"]/preceding::XCUIElementTypeButton[@name="" or @label=""][1]`,
    `//XCUIElementTypeStaticText[@name="${q}" or @label="${q}"]/following::XCUIElementTypeButton[@name="" or @label=""][1]`,
  ];
  for (const xp of xpaths) {
    const btn = await driver.$(xp);
    if (await btn.isDisplayed().catch(() => false)) {
      await btn.click();
      return;
    }
  }
  throw new Error(`removeRoom: no  button for "${roomTitle}"`);
}

async function waitUntilTitleGone(driver, roomTitle) {
  const q = esc(roomTitle);
  await driver.waitUntil(async () => {
    const title = await driver.$(
      `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name == "${q}" OR label == "${q}")`
    );
    return !(await title.isDisplayed().catch(() => false));
  }, {
    timeout: WAIT_MS,
    interval: POLL_MS,
    timeoutMsg: `removeRoom: "${roomTitle}" still visible`,
  });
}

async function prepareTargetRoom(driver) {
  if (CANDIDATES.length) return CANDIDATES;

  const roomName = `A-00-E-RemoveRoom-${Math.random().toString(36).slice(2, 10)}`;
  console.log(`removeRoom: creating isolated room "${roomName}"`);
  await createPublicRoom(driver, roomName);
  await goBack(driver, 500);
  await ensureRoomsSectionReady(driver);
  return [roomName];
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }
  await resetToHome(driver);
  await pause(driver, 450);

  const candidates = await prepareTargetRoom(driver);
  const { el, roomTitle } = await waitForTargetRow(driver, candidates, CANDIDATES.length === 0);
  console.log(`removeRoom: "${roomTitle}"`);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe_left.png');
  await swipeLeftOnRow(driver, el);
  await pause(driver, 200);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_left.png');
  await tapRemoveBesideTitle(driver, roomTitle);
  await saveScreenshot(driver, TEST_NAME, '03_after_tap_remove.png');
  await waitUntilTitleGone(driver, roomTitle);
  await saveScreenshot(driver, TEST_NAME, '04_after_room_removed.png');
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
