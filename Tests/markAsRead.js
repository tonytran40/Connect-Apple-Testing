require('dotenv').config();

const crypto = require('node:crypto');

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

async function elementVisualSignature(driver, element) {
  if (!element?.elementId || typeof driver.takeElementScreenshot !== 'function') {
    throw new Error(
      'markAsRead: element screenshots are required to verify the unread/read visual state'
    );
  }

  const screenshot = await driver.takeElementScreenshot(element.elementId, true);
  if (!screenshot) {
    throw new Error('markAsRead: Appium returned an empty room-title screenshot');
  }
  return crypto.createHash('sha256').update(Buffer.from(screenshot, 'base64')).digest('hex');
}

function visualStateTransition(initialReadSignature, unreadSignature, restoredReadSignature) {
  return {
    unreadChanged: Boolean(
      initialReadSignature && unreadSignature && unreadSignature !== initialReadSignature
    ),
    readRestored: Boolean(
      initialReadSignature && restoredReadSignature === initialReadSignature
    ),
  };
}

async function waitForTitleVisualSignature(driver, roomTitle, predicate, description) {
  const deadline = Date.now() + WAIT_MS;
  let lastSignature = '';

  while (Date.now() < deadline) {
    try {
      const row = await waitForConversationRow(driver, [roomTitle], {
        exact: true,
        timeout: Math.min(2000, Math.max(250, deadline - Date.now())),
        maxScrolls: 0,
        pauseMs: POLL_MS,
      });
      lastSignature = await elementVisualSignature(driver, row.el);
      if (predicate(lastSignature)) return { ...row, signature: lastSignature };
    } catch (error) {
      if (/element screenshots are required|empty room-title screenshot/.test(error?.message || '')) {
        throw error;
      }
    }
    await pause(driver, POLL_MS);
  }

  throw new Error(
    `markAsRead: ${description} was not visually observable for "${roomTitle}" ` +
      `within ${WAIT_MS}ms (last signature: ${lastSignature || 'unavailable'})`
  );
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
  const initialReadSignature = await elementVisualSignature(driver, target.el);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe_right.png');
  await swipeRightOnRow(driver, target.el);
  await pause(driver, 200);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_right.png');
  await tapMarkAsUnreadBesideTitle(driver, target.roomTitle);
  const unread = await waitForTitleVisualSignature(
    driver,
    target.roomTitle,
    signature => signature !== initialReadSignature,
    'read-to-unread title styling transition'
  );
  await saveScreenshot(driver, TEST_NAME, '03_after_mark_unread.png');

  // Toggle back to read (same button after second swipe).
  await pause(driver, 400);
  await swipeRightOnRow(driver, unread.el);
  await pause(driver, 200);
  await tapMarkAsUnreadBesideTitle(driver, unread.roomTitle);
  const restored = await waitForTitleVisualSignature(
    driver,
    target.roomTitle,
    signature => signature === initialReadSignature,
    'unread-to-read title styling transition'
  );
  const transition = visualStateTransition(
    initialReadSignature,
    unread.signature,
    restored.signature
  );
  if (!transition.unreadChanged || !transition.readRestored) {
    throw new Error(
      `markAsRead: visual state assertion failed (${JSON.stringify(transition)})`
    );
  }
  await saveScreenshot(driver, TEST_NAME, '04_after_mark_read.png');

  return {
    status: 'PASS',
    notes: 'Verified read → unread → read room-title styling transitions',
    evidence: transition,
  };
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (err) {
      try {
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { elementVisualSignature, run, visualStateTransition };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
