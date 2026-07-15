require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');
const {
  logPickerDiagnostics,
  sendComposerDraft,
  tapAllPhotosInPicker,
  tapDoneInPhotoPicker,
  waitForAttachmentDraftInComposer,
  waitForPhotoPicker,
} = require('../utils/attachmentPhotoPicker');
const { SELECTORS } = require('../utils/selectors');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'attachments';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.ATTACHMENT_ROOM_TIMEOUT_MS, 10) || 20000;
const COMPOSER_ATTACHMENT_SETTLE_MS =
  Number.parseInt(process.env.ATTACHMENT_COMPOSER_SETTLE_MS, 10) || 5000;
const DEBUG_PICKER = process.env.ATTACHMENT_DEBUG_PICKER === '1';
const USE_EXISTING_ROOM = process.env.ATTACHMENT_USE_EXISTING_ROOM === '1';
const SHARE_OPTIONS = ['Attach Photos', 'Attach Files', 'Send GIF'];

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function generateAttachmentRoomName(sortKey) {
  const rand = Math.random().toString(36).slice(2, 10);
  const key =
    typeof sortKey === 'string' && sortKey.trim().length > 0 ? sortKey.trim().charAt(0) : 'A';
  return `${key}-AttachmentRoom-${rand}`;
}

function resolveAttachmentRoomName() {
  const explicit = (process.env.ATTACHMENT_ROOM_NAME || '').trim();
  if (explicit) return explicit;
  return generateAttachmentRoomName(process.env.ATTACHMENT_ROOM_SORT_KEY || 'A');
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

async function waitForInRoom(driver, timeout = DEFAULT_TIMEOUT) {
  const header = await driver.$(SELECTORS.openRoomSettingsButton);
  await header.waitForDisplayed({ timeout });
}

async function tapByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = esc(text);
  const textEl = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "${safe}" OR name == "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );
  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
}

async function openExistingRoom(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const maxScrolls = Number.parseInt(process.env.ATTACHMENT_ROOM_MAX_SCROLLS, 10) || 8;
  const deadline = Date.now() + timeout;

  for (let scroll = 0; scroll <= maxScrolls && Date.now() < deadline; scroll += 1) {
    try {
      await tapByText(driver, roomName, Math.min(2500, timeout));
      await waitForInRoom(driver, Math.min(5000, timeout));
      console.log(`attachments: opened existing room "${roomName}"`);
      return;
    } catch {}

    if (scroll < maxScrolls) {
      try {
        await driver.execute('mobile: scroll', { direction: 'down' });
      } catch {
        try {
          await driver.execute('mobile: swipe', { direction: 'down' });
        } catch {}
      }
    }
    await pause(driver, 350);
  }

  throw new Error(`attachments: room "${roomName}" was not visible`);
}

async function enterAttachmentRoom(driver) {
  const roomName = resolveAttachmentRoomName();

  if (USE_EXISTING_ROOM) {
    console.log(`attachments: opening existing room "${roomName}"`);
    await openExistingRoom(driver, roomName);
    return;
  }

  console.log(`attachments: creating "${roomName}"`);
  await createPublicRoom(driver, roomName);
  await pause(driver, 600);
  await waitForInRoom(driver);
}

async function tapShareOptionsButton(driver, timeout = DEFAULT_TIMEOUT) {
  const btn = await driver.$(SELECTORS.shareOptionsButton);
  await btn.waitForDisplayed({ timeout });
  await btn.click();
  console.log(`attachments: tapped ${SELECTORS.shareOptionsButton}`);
}

async function waitForShareOptionsDialog(driver, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const sendGif = await driver.$(SELECTORS.sendGif);
    if (await sendGif.isExisting().catch(() => false) && (await sendGif.isDisplayed().catch(() => false))) {
      return 'Send GIF';
    }

    for (const label of SHARE_OPTIONS) {
      const safe = esc(label);
      const el = await driver.$(
        `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (name == "${safe}" OR label == "${safe}")`
      );
      if (await el.isExisting().catch(() => false) && (await el.isDisplayed().catch(() => false))) {
        return label;
      }
    }
    await pause(driver, 200);
  }

  throw new Error('attachments: share options dialog did not appear');
}

async function tapShareOption(driver, label, timeout = DEFAULT_TIMEOUT) {
  if (label === 'Send GIF') {
    const byId = await driver.$(SELECTORS.sendGif);
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    console.log(`attachments: tapped Send GIF (${SELECTORS.sendGif})`);
    return;
  }

  const safe = esc(label);
  const el = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (name == "${safe}" OR label == "${safe}")`
  );
  await el.waitForDisplayed({ timeout });
  await el.click();
  console.log(`attachments: tapped "${label}"`);
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }

  await resetToHome(driver);
  await pause(driver, 450);
  await enterAttachmentRoom(driver);
  await saveScreenshot(driver, TEST_NAME, '01_in_room.png');

  await tapShareOptionsButton(driver);
  await pause(driver, 400);
  const visibleOption = await waitForShareOptionsDialog(driver);
  console.log(`attachments: share options dialog visible (${visibleOption})`);
  await saveScreenshot(driver, TEST_NAME, '02_share_options_dialog.png');

  await tapShareOption(driver, 'Attach Photos');
  await pause(driver, 800);
  await waitForPhotoPicker(driver);
  await saveScreenshot(driver, TEST_NAME, '03_photo_picker_open.png');

  if (DEBUG_PICKER) {
    await logPickerDiagnostics(driver, 'before_tap_all');
  }

  await tapAllPhotosInPicker(driver);
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '04_after_tap_all_photos.png');

  await tapDoneInPhotoPicker(driver);
  await waitForAttachmentDraftInComposer(driver);
  await pause(driver, COMPOSER_ATTACHMENT_SETTLE_MS);
  await saveScreenshot(driver, TEST_NAME, '05_attachment_in_composer.png');

  await sendComposerDraft(driver);
  await pause(driver, 500);
  await saveScreenshot(driver, TEST_NAME, '06_after_send_attachment.png');
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

module.exports = { run, generateAttachmentRoomName, resolveAttachmentRoomName };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}
