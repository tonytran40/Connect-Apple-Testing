require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot, ensureTestArtifactsDir } = require('../utils/screenshots');
const { runWithOptionalDriver, goBack } = require('../utils/testSession');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'CreateRoom';

async function typeComposerMessage(driver, message, timeout = DEFAULT_TIMEOUT) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    console.log('Typed message by accessibility id');
    return;
  }

  const placeholder = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND 
     (label CONTAINS "Start a new message" OR name CONTAINS "Start a new message" OR
      label CONTAINS "Message" OR name CONTAINS "Message")`
  );

  if (await placeholder.isExisting().catch(() => false)) {
    await placeholder.waitForDisplayed({ timeout });
    await placeholder.click();
    await driver.pause(300);
  }

  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      await tv.click();
      await driver.pause(150);
      await tv.setValue(message);
      console.log('Typed message in composer');
      return;
    }
  }

  throw new Error('Could not find message composer TextView');
}

function artifactsPath(fileName) {
  return path.join(ensureTestArtifactsDir(TEST_NAME), fileName);
}

async function dumpSource(driver, name) {
  const file = artifactsPath(name);
  const xml = await driver.getPageSource();
  fs.writeFileSync(file, xml, 'utf8');
  console.log(`Page source saved: ${file}`);
}

const LETTERS_AZ = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const SORT_SYMBOL_KEYS = ['$', '#', '!', '%', '_'];

/** Random sort bucket when you do not pass `sortKey`: symbols (often before letters) + full A–Z. */
const DEFAULT_SORT_KEYS = [...SORT_SYMBOL_KEYS, ...LETTERS_AZ];

function pickSortKey() {
  return DEFAULT_SORT_KEYS[Math.floor(Math.random() * DEFAULT_SORT_KEYS.length)];
}

/**
 * Full room name for lists/sort tests: "{key}-Public Room-{rand}" or "{key}-Private Room-{rand}".
 * @param {'Public'|'Private'} kind
 * @param {string} [sortKey] one leading character, e.g. "M", "Z", "$" (omit for random A–Z or symbol from DEFAULT_SORT_KEYS)
 */
function generateRoomName(kind, sortKey) {
  const rand = Math.random().toString(36).slice(2, 10);
  const key =
    typeof sortKey === 'string' && sortKey.trim().length > 0
      ? sortKey.trim().charAt(0)
      : pickSortKey();
  return `${key}-${kind} Room-${rand}`;
}

function generateRandomMessage(prefix = 'Message test') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix} - ${rand}`;
}

async function tapByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = text.replace(/"/g, '\\"');
  const el = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "${safe}" OR name == "${safe}")`
  );
  await el.waitForDisplayed({ timeout });
  await el.click();
}

async function openRoomsPlusMenu(driver, timeout = DEFAULT_TIMEOUT) {
  const roomsHeader = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS "Rooms"`
  );
  await roomsHeader.waitForDisplayed({ timeout });

  const roomsPlus = await driver.$(
    `//XCUIElementTypeButton[contains(@label,"Rooms")]/following-sibling::XCUIElementTypeButton[1]`
  );
  await roomsPlus.waitForDisplayed({ timeout });
  await roomsPlus.click();
  console.log('Clicked Rooms plus');
}

async function togglePrivateRoom(driver, timeout = DEFAULT_TIMEOUT) {
  const labeledSwitch = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeSwitch" AND (label == "Create private room" OR name == "Create private room")`
  );

  if (await labeledSwitch.isExisting().catch(() => false)) {
    await labeledSwitch.waitForDisplayed({ timeout });
    await labeledSwitch.click();
    console.log('Toggled private room');
    return;
  }

  const switches = await driver.$$('XCUIElementTypeSwitch');
  for (const sw of switches) {
    if (await sw.isDisplayed().catch(() => false)) {
      await sw.click();
      console.log('Toggled private room');
      return;
    }
  }

  throw new Error('Could not locate private room switch');
}

async function waitForRoomsListReady(driver, timeout = DEFAULT_TIMEOUT) {
  const roomsHeader = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS "Rooms"`
  );
  await roomsHeader.waitForDisplayed({ timeout });
  await driver.pause(400);
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await driver.pause(1200);
  }

  await openRoomsPlusMenu(driver);

  const createRoomBtn = await driver.$('~createRoomButton');
  await createRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await createRoomBtn.click();
  console.log('Opened Create a Room screen');
  await saveScreenshot(driver, TEST_NAME, 'public_create_room.png');

  const publicRoomField = await driver.$('~roomNameText');
  await publicRoomField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await publicRoomField.click();

  const publicRoomName = generateRoomName('Public', 'A');
  console.log(`Public room name: ${publicRoomName}`);
  await publicRoomField.setValue(publicRoomName);
  await saveScreenshot(driver, TEST_NAME, 'public_room_name.png');

  await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);

  await typeComposerMessage(driver, generateRandomMessage());
  const publicSendBtn = await driver.$('~sendMessageButton');
  await publicSendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
  await publicSendBtn.click();
  await saveScreenshot(driver, TEST_NAME, 'public_room_sent.png');

  await driver.pause(800);
  await goBack(driver);
  await saveScreenshot(driver, TEST_NAME, 'rooms_list_after_public.png');

  await waitForRoomsListReady(driver);
  await openRoomsPlusMenu(driver);

  const privateCreateRoomBtn = await driver.$('~createRoomButton');
  await privateCreateRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await privateCreateRoomBtn.click();
  await saveScreenshot(driver, TEST_NAME, 'private_create_room.png');

  const privateRoomField = await driver.$('~roomNameText');
  await privateRoomField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await privateRoomField.click();

  const privateRoomName = generateRoomName('Private', 'B');
  console.log(`Private room name: ${privateRoomName}`);
  await privateRoomField.setValue(privateRoomName);

  await togglePrivateRoom(driver, DEFAULT_TIMEOUT);
  await saveScreenshot(driver, TEST_NAME, 'private_room_toggle.png');

  await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);

  await typeComposerMessage(driver, generateRandomMessage());
  const privateSendBtn = await driver.$('~sendMessageButton');
  await privateSendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
  await privateSendBtn.click();
  await saveScreenshot(driver, TEST_NAME, 'private_room_sent.png');

  await goBack(driver);
  console.log('Returned to Rooms list after private room');
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver, options);
    } catch (err) {
      try {
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
        await dumpSource(activeDriver, 'ERROR_source.xml');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run, generateRoomName };

if (require.main === module) {
  run().catch(() => process.exit(1));
}
