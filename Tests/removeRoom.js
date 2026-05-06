require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');

const TEST_NAME = 'removeRoom';
const CANDIDATES = (process.env.REMOVE_ROOM_CANDIDATES || 'A-Public,B-Private')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const WAIT_MS = Number.parseInt(process.env.REMOVE_ROOM_WAIT_TIMEOUT_MS, 10) || 30000;
const POLL_MS = Number.parseInt(process.env.REMOVE_ROOM_POLL_MS, 10) || 400;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

/** Row mid-Y for a horizontal swipe (getRect is unreliable on some WDIO elements). */
async function rowMidY(el) {
  const loc = await el.getLocation();
  const size = await el.getSize();
  return Math.round(loc.y + size.height / 2);
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
    await driver.releaseActions();
  } catch (e) {
    console.warn(`removeRoom: performActions swipe failed (${e?.message || e}), using drag`);
    await driver.execute('mobile: dragFromToForDuration', {
      fromX,
      fromY: y,
      toX: Math.min(fromX - 2, toX),
      toY: y,
      duration: 0.28,
    });
  }
}

/** First visible title matching any candidate substring; returns element + full title for XPath. */
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
  throw new Error(`removeRoom: none of [${names.join(', ')}] visible within ${WAIT_MS}ms`);
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
  const title = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name == "${q}" OR label == "${q}")`
  );
  await driver.waitUntil(async () => !(await title.isDisplayed().catch(() => false)), {
    timeout: WAIT_MS,
    interval: POLL_MS,
    timeoutMsg: `removeRoom: "${roomTitle}" still visible`,
  });
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }
  await resetToHome(driver);
  await pause(driver, 450);

  const { el, roomTitle } = await waitForTargetRow(driver, CANDIDATES);
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
