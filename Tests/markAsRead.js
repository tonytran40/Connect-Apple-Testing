require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  runWithOptionalDriver,
  resetToHome,
  ensureRoomsSectionReady,
  goBack,
  waitForConversationRow,
} = require('../utils/testSession');
const { A11Y } = require('../utils/selectors');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'markAsRead';
const CONFIGURED_CANDIDATES =
  process.env.MARK_AS_READ_CANDIDATES || process.env.MARKDOWN_ROOM_NAME || '';
const CANDIDATES = CONFIGURED_CANDIDATES
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const WAIT_MS = Number.parseInt(process.env.MARK_AS_READ_WAIT_TIMEOUT_MS, 10) || 30000;
const POLL_MS = Number.parseInt(process.env.MARK_AS_READ_POLL_MS, 10) || 400;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

async function rowMidY(el) {
  const loc = await el.getLocation();
  const size = await el.getSize();
  return Math.round(loc.y + size.height / 2);
}

async function swipeRightOnRow(driver, el) {
  const y = await rowMidY(el);
  const win = await driver.getWindowRect();
  const fromX = Math.max(8, Math.round(win.width * 0.08));
  const toX = Math.min(win.width - 8, Math.round(win.width * 0.55));

  try {
    await driver.performActions([
      {
        type: 'pointer',
        id: 'markAsReadSwipe',
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
    console.warn(`markAsRead: performActions swipe failed (${e?.message || e}), using drag`);
    await driver.releaseActions().catch(() => {});
    await driver.execute('mobile: dragFromToForDuration', {
      fromX,
      fromY: y,
      toX: Math.max(fromX + 2, toX),
      toY: y,
      duration: 0.28,
    });
  } finally {
    await driver.releaseActions().catch(() => {});
  }
}

async function waitForTargetRow(driver, names, exact = false) {
  return waitForConversationRow(driver, names, {
    exact,
    timeout: WAIT_MS,
    pauseMs: POLL_MS,
  });
}

async function tapMarkAsUnreadBesideTitle(driver, roomTitle) {
  const q = esc(roomTitle);
  const xp = `//XCUIElementTypeStaticText[@name="${q}" or @label="${q}"]/preceding::XCUIElementTypeButton[@name="${A11Y.markAsUnreadButton}" or @label="message-dot"][1]`;
  const btn = await driver.$(xp);
  const exists = await btn.isExisting().catch(() => false);
  if (!exists) {
    throw new Error(`markAsRead: markAsUnreadButton not found for "${roomTitle}"`);
  }
  await btn.waitForDisplayed({ timeout: 8000 });
  await btn.click();
}

function isolatedRoomName() {
  return `A-00-M-MarkAsRead-${Math.random().toString(36).slice(2, 10)}`;
}

async function prepareTargetRoom(driver) {
  if (CANDIDATES.length) {
    return CANDIDATES;
  }

  const roomName = isolatedRoomName();
  console.log(`markAsRead: creating isolated room "${roomName}"`);
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
  const exact = CANDIDATES.length === 0;
  const target = await waitForTargetRow(driver, candidates, exact);
  console.log(`markAsRead: "${target.roomTitle}"`);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe_right.png');
  await swipeRightOnRow(driver, target.el);
  await pause(driver, 200);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_right.png');
  await tapMarkAsUnreadBesideTitle(driver, target.roomTitle);
  await saveScreenshot(driver, TEST_NAME, '03_after_mark_unread.png');

  // Toggle back to read (same button after second swipe).
  const again = await waitForTargetRow(driver, candidates, exact);
  await pause(driver, 400);
  await swipeRightOnRow(driver, again.el);
  await pause(driver, 200);
  await tapMarkAsUnreadBesideTitle(driver, again.roomTitle);
  await saveScreenshot(driver, TEST_NAME, '04_after_mark_read.png');
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
