require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');
const { getElementRect } = require('../utils/uiActions');

const TEST_NAME = 'notifications';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.NOTIFICATION_WAIT_TIMEOUT_MS, 10) || 30000;
const BANNER_TIMEOUT = Number.parseInt(process.env.NOTIFICATION_BANNER_TIMEOUT_MS, 10) || 6000;
const BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';
const SIM_UDID = process.env.SIMULATOR_UDID || 'booted';

const NOTIFICATION_TITLE = process.env.NOTIFICATION_TITLE || 'Connect';
const NOTIFICATION_BODY =
  process.env.NOTIFICATION_BODY || 'New message in Message Room';
const NOTIFICATION_PAYLOAD_PATH =
  process.env.NOTIFICATION_PAYLOAD_PATH ||
  path.join(__dirname, 'fixtures', 'connect-notification.apns');
const ROUTE_MODE = 'route';
const BANNER_MODE = 'banner';

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

function buildPayloadFromEnv(env = process.env) {
  const custom = {};
  if (env.NOTIFICATION_ROOM_ID) {
    custom.room_id = env.NOTIFICATION_ROOM_ID;
  }
  if (env.NOTIFICATION_EVENT_TYPE) {
    custom.event_type = env.NOTIFICATION_EVENT_TYPE;
  }

  return {
    aps: {
      alert: {
        title: env.NOTIFICATION_TITLE || NOTIFICATION_TITLE,
        body: env.NOTIFICATION_BODY || NOTIFICATION_BODY,
      },
      badge: Number.parseInt(env.NOTIFICATION_BADGE, 10) || 1,
      sound: env.NOTIFICATION_SOUND || 'default',
    },
    ...custom,
  };
}

function isMissingDeterministicValue(value) {
  const normalized = String(value || '').trim();
  return !normalized || /^(automation-|replace-|your-)/i.test(normalized);
}

function resolveNotificationPlan(payload, env = process.env) {
  const mode = String(env.NOTIFICATION_MODE || ROUTE_MODE).trim().toLowerCase();
  if (![ROUTE_MODE, BANNER_MODE].includes(mode)) {
    throw new Error(
      `notifications: NOTIFICATION_MODE must be "${ROUTE_MODE}" or "${BANNER_MODE}" (received "${mode}")`
    );
  }

  if (mode === BANNER_MODE) {
    return { mode };
  }

  const roomId = String(payload?.room_id || '').trim();
  const targetRoomName = String(
    env.NOTIFICATION_TARGET_ROOM_NAME || payload?.automation_target_room_name || ''
  ).trim();
  const missing = [];
  if (isMissingDeterministicValue(roomId)) missing.push('payload room_id / NOTIFICATION_ROOM_ID');
  if (isMissingDeterministicValue(targetRoomName)) {
    missing.push('NOTIFICATION_TARGET_ROOM_NAME');
  }
  if (missing.length) {
    const error = new Error(
      `notifications: deterministic route coverage requires ${missing.join(' and ')}. ` +
        'Configure a real QA room ID and its exact visible name, or explicitly set ' +
        'NOTIFICATION_MODE=banner for banner-delivery-only coverage.'
    );
    error.status = 'BLOCKED';
    throw error;
  }

  return { mode, roomId, targetRoomName };
}

function loadPayload() {
  if (process.env.NOTIFICATION_USE_ENV_PAYLOAD === '1') {
    return buildPayloadFromEnv();
  }

  if (fs.existsSync(NOTIFICATION_PAYLOAD_PATH)) {
    const raw = fs.readFileSync(NOTIFICATION_PAYLOAD_PATH, 'utf8');
    return JSON.parse(raw);
  }

  return buildPayloadFromEnv();
}

function writeTempApns(payload) {
  const file = path.join(os.tmpdir(), `connect-notification-${Date.now()}.apns`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

/** Push a simulated remote notification to the booted simulator (xcrun simctl push). */
function pushSimulatorNotification(payload, bundleId = BUNDLE_ID, udid = SIM_UDID) {
  const apnsFile = writeTempApns(payload);
  const result = spawnSync('xcrun', ['simctl', 'push', udid, bundleId, apnsFile], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`simctl push failed (exit ${result.status}): ${detail}`);
  }

  console.log(`notifications: pushed via simctl → ${apnsFile}`);
  console.log(`notifications: title="${payload?.aps?.alert?.title ?? ''}" body="${payload?.aps?.alert?.body ?? ''}"`);
  return apnsFile;
}

async function backgroundApp(driver) {
  await driver.execute('mobile: pressButton', { name: 'home' });
  console.log('notifications: sent app to background (Home)');
}

async function foregroundApp(driver) {
  await driver.activateApp(BUNDLE_ID);
  console.log(`notifications: foregrounded ${BUNDLE_ID}`);
}

function notificationBannerSelectors(title, body) {
  const safeTitle = esc(title);
  const safeBody = esc(body);
  return [
    '-ios predicate string:' +
      '(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND ' +
      `(label CONTAINS "${safeBody}" OR name CONTAINS "${safeBody}")`,
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND ' +
      `(label CONTAINS "${safeTitle}" OR name CONTAINS "${safeTitle}")`,
  ];
}

async function waitForNotificationBanner(driver, title, body) {
  const selectors = notificationBannerSelectors(title, body);

  const deadline = Date.now() + BANNER_TIMEOUT;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const el = await driver.$(selector);
      if (await el.isDisplayed().catch(() => false)) {
        console.log(`notifications: native notification banner visible (${selector})`);
        return { el, selector };
      }
    }
    await pause(driver, 200);
  }

  throw new Error(`notifications: notification banner was not visible within ${BANNER_TIMEOUT}ms`);
}

async function tapNotificationBanner(driver, title, body) {
  const { el } = await waitForNotificationBanner(driver, title, body);
  const rect = await getElementRect(el);
  await driver.execute('mobile: tap', {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  });
  console.log('notifications: tapped notification banner center by text');
}

function exactRoomTitleSelector(roomName) {
  const safe = esc(roomName);
  return (
    '-ios predicate string:' +
    '(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND ' +
    `(name == "${safe}" OR label == "${safe}")`
  );
}

async function waitForExactTargetRoom(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const selector = exactRoomTitleSelector(roomName);
  const composer = await driver.$(SELECTORS.sendMessageButton);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const candidates = await driver.$$(selector);
    const windowRect = await driver.getWindowRect();
    const composerVisible = await composer.isDisplayed().catch(() => false);
    for (const candidate of candidates) {
      if (await candidate.isDisplayed().catch(() => false)) {
        const rect = await getElementRect(candidate);
        const inHeader = rect.y + rect.height / 2 < windowRect.height * 0.35;
        if (inHeader && composerVisible) {
          console.log(`notifications: routed to exact target room "${roomName}"`);
          return candidate;
        }
      }
    }
    await pause(driver, 400);
  }

  throw new Error(
    `notifications: notification did not navigate to exact target room "${roomName}" ` +
      `with a visible composer within ${timeout}ms`
  );
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }
  await resetToHome(driver);
  await pause(driver, 450);

  const payload = loadPayload();
  const plan = resolveNotificationPlan(payload);
  const title = payload?.aps?.alert?.title || NOTIFICATION_TITLE;
  const body =
    typeof payload?.aps?.alert === 'string'
      ? payload.aps.alert
      : payload?.aps?.alert?.body || NOTIFICATION_BODY;

  await saveScreenshot(driver, TEST_NAME, '01_before_push.png');

  await backgroundApp(driver);
  await pause(driver, 600);

  pushSimulatorNotification(payload);
  await pause(driver, 1200);
  await saveScreenshot(driver, TEST_NAME, '02_after_push.png');

  if (plan.mode === BANNER_MODE) {
    await waitForNotificationBanner(driver, title, body);
    await saveScreenshot(driver, TEST_NAME, '03_banner_delivery_verified.png');
    await foregroundApp(driver);
    return {
      status: 'INCONCLUSIVE',
      notes: 'Banner delivery verified; exact room routing was intentionally not exercised',
      coverageMode: BANNER_MODE,
    };
  }

  await tapNotificationBanner(driver, title, body);
  await pause(driver, 800);
  await saveScreenshot(driver, TEST_NAME, '03_after_tap_notification.png');

  await waitForExactTargetRoom(driver, plan.targetRoomName);
  await saveScreenshot(driver, TEST_NAME, '04_in_app_after_notification.png');
  return {
    status: 'PASS',
    notes: `Notification routed to exact room "${plan.targetRoomName}"`,
    coverageMode: ROUTE_MODE,
    targetRoomId: plan.roomId,
    targetRoomName: plan.targetRoomName,
  };
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (err) {
      try {
        await foregroundApp(activeDriver);
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = {
  buildPayloadFromEnv,
  exactRoomTitleSelector,
  loadPayload,
  pushSimulatorNotification,
  resolveNotificationPlan,
  run,
  waitForNotificationBanner,
  waitForExactTargetRoom,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
