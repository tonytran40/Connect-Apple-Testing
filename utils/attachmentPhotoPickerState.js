const { SELECTORS } = require('./selectors');
const { allowPhotoLibraryPromptIfNeeded } = require('./permissions');
const { waitForCondition } = require('./uiTransitions');

const DEFAULT_TIMEOUT = Number.parseInt(process.env.ATTACHMENT_ROOM_TIMEOUT_MS, 10) || 20000;
const PHOTO_PICKER_TIMEOUT = Number.parseInt(process.env.ATTACHMENT_PHOTO_PICKER_TIMEOUT_MS, 10) || 20000;
const PHOTO_SELECT_WAIT_MS = Number.parseInt(process.env.ATTACHMENT_PHOTO_SELECT_WAIT_MS, 10) || 900;

async function waitForPhotoPicker(driver, timeout = PHOTO_PICKER_TIMEOUT) {
  const signals = [
    '-ios predicate string:(type == "XCUIElementTypeStaticText") AND (name CONTAINS "Select up to" OR label CONTAINS "Select up to")',
    '-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (name == "Photos" OR label == "Photos")',
    '-ios predicate string:(type == "XCUIElementTypeStaticText") AND (name CONTAINS "Select Items" OR label CONTAINS "Select Items")',
  ];
  await waitForCondition(driver, async () => {
    await allowPhotoLibraryPromptIfNeeded(driver);
    for (const selector of signals) {
      const el = await driver.$(selector);
      if (await el.isExisting().catch(() => false)) return true;
    }
    return false;
  }, { timeout, interval: 250, timeoutMsg: 'attachments: photo picker did not appear' });
}

async function tapDoneInPhotoPicker(driver, timeout = DEFAULT_TIMEOUT) {
  const doneButton = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Done" OR label == "Done")`
  );
  if (await doneButton.isExisting().catch(() => false)) {
    await doneButton.waitForDisplayed({ timeout });
    await doneButton.click();
    console.log('attachments: tapped photo picker Done');
    return;
  }
  const win = await driver.getWindowRect();
  const x = Math.round(win.width * 0.88);
  const y = Math.round(win.height * 0.15);
  await driver.execute('mobile: tap', { x, y });
  console.log(`attachments: tapped photo picker Done at (${x}, ${y})`);
}

async function waitForAttachmentDraftInComposer(driver, timeout = DEFAULT_TIMEOUT) {
  await waitForCondition(driver, async () => {
    const inRoom = await driver.$(SELECTORS.openRoomSettingsButton).isDisplayed().catch(() => false);
    const sendEnabled = await driver.$(SELECTORS.sendMessageButton).isEnabled().catch(() => false);
    const doneVisible = await driver
      .$(`-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Done" OR label == "Done")`)
      .isDisplayed()
      .catch(() => false);
    return inRoom && sendEnabled && !doneVisible;
  }, { timeout, interval: 150, timeoutMsg: 'attachments: attachment draft did not appear in composer' });
}

async function sendComposerDraft(driver, timeout = DEFAULT_TIMEOUT) {
  const sendBtn = await driver.$(SELECTORS.sendMessageButton);
  await sendBtn.waitForEnabled({ timeout });
  await sendBtn.click();
  console.log('attachments: sent attachment draft');
}

function parseSelectedPhotoCount(text) {
  const match = String(text || '').match(/\b(\d+)\s+Photos?\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function getSelectedPhotoCount(driver) {
  const selectors = [
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label MATCHES "^[0-9]+ Photos?$" OR name MATCHES "^[0-9]+ Photos?$")`,
    `//XCUIElementTypeButton[contains(@name,"Photo") or contains(@label,"Photo")]`,
    `//XCUIElementTypeStaticText[contains(@name,"Photo") or contains(@label,"Photo")]`,
  ];
  for (const selector of selectors) {
    const els = await driver.$$(selector);
    for (const el of els) {
      const name = await el.getAttribute('name').catch(() => '');
      const label = await el.getAttribute('label').catch(() => '');
      const count = parseSelectedPhotoCount(label || name);
      if (count != null) return count;
    }
  }
  return 0;
}

async function waitForSelectedPhotoCount(driver, expectedCount, timeout = PHOTO_SELECT_WAIT_MS) {
  try {
    await waitForCondition(
      driver,
      async () => (await getSelectedPhotoCount(driver)) >= expectedCount,
      { timeout, interval: 75, timeoutMsg: `attachments: selected photo count did not reach ${expectedCount}` }
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getSelectedPhotoCount,
  parseSelectedPhotoCount,
  sendComposerDraft,
  tapDoneInPhotoPicker,
  waitForAttachmentDraftInComposer,
  waitForPhotoPicker,
  waitForSelectedPhotoCount,
};
