require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');

const TEST_NAME = 'markAsRead';
const CANDIDATES = (
  process.env.MARK_AS_READ_CANDIDATES ||
  process.env.MARKDOWN_ROOM_NAME ||
  'Message Room,Markdown room'
)
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
    await driver.releaseActions();
  } catch (e) {
    console.warn(`markAsRead: performActions swipe failed (${e?.message || e}), using drag`);
    await driver.execute('mobile: dragFromToForDuration', {
      fromX,
      fromY: y,
      toX: Math.max(fromX + 2, toX),
      toY: y,
      duration: 0.28,
    });
  }
}

async function waitForTargetRow(driver, names) {
  const parts = names.map(n => {
    const q = esc(n);
    return `(name CONTAINS[c] "${q}" OR label CONTAINS[c] "${q}")`;
  });
  const title = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (${parts.join(' OR ')})`
  );
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await title.isDisplayed().catch(() => false)) {
      const n = await title.getAttribute('name').catch(() => '');
      const l = await title.getAttribute('label').catch(() => '');
      const roomTitle = (n && String(n).trim()) || (l && String(l).trim()) || names[0];
      return { el: title, roomTitle };
    }
    await driver.pause(POLL_MS);
  }
  throw new Error(`markAsRead: none of [${names.join(', ')}] visible within ${WAIT_MS}ms`);
}

async function tapMarkAsUnreadBesideTitle(driver, roomTitle) {
  const q = esc(roomTitle);
  const xp = `//XCUIElementTypeStaticText[@name="${q}" or @label="${q}"]/preceding::XCUIElementTypeButton[@name="markAsUnreadButton" or @label="message-dot"][1]`;
  const btn = await driver.$(xp);
  const exists = await btn.isExisting().catch(() => false);
  if (!exists) {
    throw new Error(`markAsRead: markAsUnreadButton not found for "${roomTitle}"`);
  }
  await btn.waitForDisplayed({ timeout: 8000 });
  await btn.click();
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }
  await resetToHome(driver);
  await pause(driver, 450);

  const target = await waitForTargetRow(driver, CANDIDATES);
  console.log(`markAsRead: "${target.roomTitle}"`);

  await saveScreenshot(driver, TEST_NAME, '01_before_swipe_right.png');
  await swipeRightOnRow(driver, target.el);
  await pause(driver, 200);
  await saveScreenshot(driver, TEST_NAME, '02_after_swipe_right.png');
  await tapMarkAsUnreadBesideTitle(driver, target.roomTitle);
  await saveScreenshot(driver, TEST_NAME, '03_after_mark_unread.png');

  // Toggle back to read (same button after second swipe).
  const again = await waitForTargetRow(driver, CANDIDATES);
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
