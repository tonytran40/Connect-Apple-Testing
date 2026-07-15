require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');

const TEST_NAME = 'notifications';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.NOTIFICATION_WAIT_TIMEOUT_MS, 10) || 15000;
const BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';
const SIM_UDID = process.env.SIMULATOR_UDID || 'booted';

const NOTIFICATION_TITLE = process.env.NOTIFICATION_TITLE || 'Connect';
const NOTIFICATION_BODY =
  process.env.NOTIFICATION_BODY || 'New message in Message Room';
const NOTIFICATION_PAYLOAD_PATH =
  process.env.NOTIFICATION_PAYLOAD_PATH ||
  path.join(__dirname, 'fixtures', 'connect-notification.apns');

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

function buildPayloadFromEnv() {
  const custom = {};
  if (process.env.NOTIFICATION_ROOM_ID) {
    custom.roomId = process.env.NOTIFICATION_ROOM_ID;
  }
  if (process.env.NOTIFICATION_EVENT_TYPE) {
    custom.eventType = process.env.NOTIFICATION_EVENT_TYPE;
  }

  return {
    aps: {
      alert: {
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
      },
      badge: Number.parseInt(process.env.NOTIFICATION_BADGE, 10) || 1,
      sound: process.env.NOTIFICATION_SOUND || 'default',
    },
    ...custom,
  };
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

async function tapNotificationBanner(driver, title, body) {
  const safeTitle = esc(title);
  const safeBody = esc(body);

  const selectors = [
    `-ios predicate string:(label CONTAINS "${safeBody}" OR name CONTAINS "${safeBody}")`,
    `-ios predicate string:(label CONTAINS "${safeTitle}" OR name CONTAINS "${safeTitle}")`,
  ];

  for (const selector of selectors) {
    const el = await driver.$(selector);
    if (await el.isDisplayed().catch(() => false)) {
      await el.click();
      console.log('notifications: tapped notification banner by text');
      return true;
    }
  }

  const win = await driver.getWindowRect();
  const x = Math.round(win.width / 2);
  const y = Math.max(24, Math.round(win.height * 0.06));
  await driver.execute('mobile: tap', { x, y });
  console.log(`notifications: tapped notification banner via coordinates (${x}, ${y})`);
  return true;
}

async function waitForInAppAfterNotification(driver, hints = [], timeout = DEFAULT_TIMEOUT) {
  const checks = [
    SELECTORS.openRoomSettingsButton,
    SELECTORS.sendMessageButton,
    SELECTORS.peoplePlusButton,
    SELECTORS.roomsSectionHeader,
    ...hints.map(h => `~${h}`),
  ];

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of checks) {
      const el = await driver.$(selector);
      if (await el.isDisplayed().catch(() => false)) {
        console.log(`notifications: in-app UI visible (${selector})`);
        return selector;
      }
    }
    await pause(driver, 400);
  }

  throw new Error(
    `notifications: expected in-app UI after tapping notification within ${timeout}ms`
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

  await tapNotificationBanner(driver, title, body);
  await pause(driver, 800);
  await saveScreenshot(driver, TEST_NAME, '03_after_tap_notification.png');

  await waitForInAppAfterNotification(driver);
  await saveScreenshot(driver, TEST_NAME, '04_in_app_after_notification.png');
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver, options);
    } catch (err) {
      try {
        await foregroundApp(activeDriver);
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run, pushSimulatorNotification, loadPayload };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
