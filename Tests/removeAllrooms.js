require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, ensureRoomsSectionReady } = require('../utils/testSession');

const TEST_NAME = 'removeAllrooms';

function intEnv(name, fallback, min, max) {
  const n = Number.parseInt(process.env[name], 10);
  const v = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

const PREFIXES = (process.env.REMOVE_ALL_ROOMS_PREFIXES || 'A-,B-,M-,E-')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const MAX_REMOVALS = intEnv('REMOVE_ALL_ROOMS_MAX_REMOVALS', 200, 1, 1000);
const MAX_SCROLLS = intEnv('REMOVE_ALL_ROOMS_MAX_SCROLLS', 80, 1, 300);
const POLL_MS = intEnv('REMOVE_ALL_ROOMS_POLL_MS', 250, 100, 2000);
const WAIT_MS = intEnv('REMOVE_ALL_ROOMS_WAIT_TIMEOUT_MS', 12000, 2000, 60000);
const SCREENSHOT_EVERY_REMOVAL = process.env.REMOVE_ALL_ROOMS_SCREENSHOTS === '1';

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function targetPredicate() {
  const parts = PREFIXES.map(prefix => {
    const q = esc(prefix);
    return `(name BEGINSWITH[c] "${q}" OR label BEGINSWITH[c] "${q}")`;
  });
  return `type == "XCUIElementTypeStaticText" AND (${parts.join(' OR ')})`;
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

async function getRectCompat(el) {
  if (typeof el.getRect === 'function') {
    return el.getRect();
  }

  const loc = await el.getLocation();
  const size = await el.getSize();
  return { x: loc.x, y: loc.y, width: size.width, height: size.height };
}

async function rowMidY(el) {
  const rect = await getRectCompat(el);
  return Math.round(rect.y + rect.height / 2);
}

async function findVisibleTargetRow(driver, viewport) {
  const titles = await driver.$$(`-ios predicate string:${targetPredicate()}`);

  for (const el of titles) {
    if (!(await el.isDisplayed().catch(() => false))) {
      continue;
    }

    const name = await el.getAttribute('name').catch(() => '');
    const label = name ? '' : await el.getAttribute('label').catch(() => '');
    const roomTitle = String(name || label || '').trim();
    if (!roomTitle) {
      continue;
    }

    const y = await rowMidY(el).catch(() => null);
    if (y == null || y < 110 || y > viewport.height - 45) {
      continue;
    }

    return { el, roomTitle, y };
  }

  return null;
}

async function swipeLeftOnRow(driver, el, knownY, viewport) {
  const y = knownY || await rowMidY(el);
  const fromX = Math.min(viewport.width - 8, Math.round(viewport.width * 0.92));
  const toX = Math.max(8, Math.round(viewport.width * 0.45));

  try {
    await driver.performActions([
      {
        type: 'pointer',
        id: 'removeAllRoomsSwipe',
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
  } catch (err) {
    console.warn(`removeAllrooms: performActions swipe failed (${err?.message || err}), using drag`);
    await driver.execute('mobile: dragFromToForDuration', {
      fromX,
      fromY: y,
      toX: Math.min(fromX - 2, toX),
      toY: y,
      duration: 0.28,
    });
  }
}

async function tapVisibleRemoveButton(driver, target) {
  const buttons = await driver.$$(
    '-ios predicate string:type == "XCUIElementTypeButton" AND (name == "" OR label == "")'
  );

  for (const btn of buttons) {
    if (!(await btn.isDisplayed().catch(() => false))) {
      continue;
    }

    const y = await rowMidY(btn).catch(() => null);
    if (y == null || Math.abs(y - target.y) > 44) {
      continue;
    }

    await btn.click();
    return true;
  }

  return false;
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

  throw new Error(`removeAllrooms: no remove button for "${roomTitle}"`);
}

async function waitUntilTitleGone(driver, roomTitle) {
  const q = esc(roomTitle);
  const title = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name == "${q}" OR label == "${q}")`
  );

  await driver.waitUntil(async () => !(await title.isDisplayed().catch(() => false)), {
    timeout: WAIT_MS,
    interval: POLL_MS,
    timeoutMsg: `removeAllrooms: "${roomTitle}" still visible after remove`,
  });
}

async function scrollDownList(driver) {
  try {
    await driver.execute('mobile: scroll', {
      direction: 'down',
      predicateString: targetPredicate(),
    });
    await pause(driver, POLL_MS);
    return true;
  } catch {
    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
      await pause(driver, POLL_MS);
      return true;
    } catch {
      await driver.execute('mobile: swipe', { direction: 'up' }).catch(() => {});
    }
  }
  await pause(driver, POLL_MS);
  return false;
}

async function removeOne(driver, target, count, viewport) {
  console.log(`removeAllrooms: removing #${count + 1} "${target.roomTitle}"`);
  await swipeLeftOnRow(driver, target.el, target.y, viewport);
  await pause(driver, 180);
  if (!(await tapVisibleRemoveButton(driver, target))) {
    await tapRemoveBesideTitle(driver, target.roomTitle);
  }
  await waitUntilTitleGone(driver, target.roomTitle);

  if (SCREENSHOT_EVERY_REMOVAL) {
    await saveScreenshot(driver, TEST_NAME, `removed_${String(count + 1).padStart(3, '0')}.png`);
  }
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }

  await ensureRoomsSectionReady(driver);
  await saveScreenshot(driver, TEST_NAME, '01_start.png');

  const viewport = await driver.getWindowRect();
  let removed = 0;
  let scrolls = 0;

  while (removed < MAX_REMOVALS && scrolls <= MAX_SCROLLS) {
    const target = await findVisibleTargetRow(driver, viewport);
    if (target) {
      await removeOne(driver, target, removed, viewport);
      removed += 1;
      await pause(driver, POLL_MS);
      continue;
    }

    const didScroll = await scrollDownList(driver);
    scrolls += 1;
    if (!didScroll) {
      break;
    }
  }

  await saveScreenshot(driver, TEST_NAME, '02_finished.png');
  console.log(`removeAllrooms: removed ${removed} room(s) matching [${PREFIXES.join(', ')}]`);

  if (removed >= MAX_REMOVALS) {
    throw new Error(`removeAllrooms: stopped at REMOVE_ALL_ROOMS_MAX_REMOVALS=${MAX_REMOVALS}`);
  }
  if (scrolls > MAX_SCROLLS) {
    throw new Error(`removeAllrooms: stopped at REMOVE_ALL_ROOMS_MAX_SCROLLS=${MAX_SCROLLS}`);
  }
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
  runCliTimed(TEST_NAME, run).catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}
