require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot, ensureTestArtifactsDir } = require('../utils/screenshots');
const {
  runWithOptionalDriver,
  ensureRoomsSectionReady,
  waitForConversationRow,
} = require('../utils/testSession');
const { SELECTORS } = require('../utils/selectors');
const {
  escapePredicateString,
  openRoomsPlusMenu: tapRoomsPlusMenu,
  tapByText,
  typeComposerMessage,
} = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'CreateRoom';

const CREATE_ROOM_SMOKE = process.env.CREATE_ROOM_MODE === 'smoke';
const CREATE_ROOM_SEND_MESSAGES = process.env.CREATE_ROOM_SEND_MESSAGES === '1';

async function saveCreateRoomScreenshot(driver, fileName) {
  await saveScreenshot(driver, TEST_NAME, fileName);
}

async function tapBackButton(driver, timeout = DEFAULT_TIMEOUT) {
  const backButton = await driver.$(SELECTORS.backButton);
  if (await backButton.waitForDisplayed({ timeout: 500 }).then(() => true).catch(() => false)) {
    await backButton.click();
    return;
  }

  const win = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.round(win.width * 0.055),
    y: Math.round(win.height * 0.09),
  });
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

async function isConversationTitleVisible(driver, roomName, timeout = 1200) {
  const safe = escapePredicateString(roomName);
  const title = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );
  return title.waitForDisplayed({ timeout }).then(() => true).catch(() => false);
}

async function isRoomConversationOpen(driver, roomName, timeout = 1200) {
  const settingsButton = await driver.$(SELECTORS.openRoomSettingsButton);
  const inConversation = await settingsButton.waitForDisplayed({ timeout }).then(() => true).catch(() => false);
  return inConversation && (await isConversationTitleVisible(driver, roomName, timeout));
}

async function openRoomFromRoomsList(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  await ensureRoomsSectionReady(driver);
  const { el: roomTitle } = await waitForConversationRow(driver, roomName, {
    exact: true,
    timeout,
  });
  await roomTitle.click();

  if (!(await isRoomConversationOpen(driver, roomName, timeout))) {
    throw new Error(`Created room "${roomName}" did not open from the Rooms list`);
  }
}

async function ensureCreatedRoomOpen(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  if (await isRoomConversationOpen(driver, roomName, 5000)) {
    return;
  }

  console.log(`Created room "${roomName}" was not active; opening it from Rooms list`);
  await openRoomFromRoomsList(driver, roomName, timeout);
}

async function openRoomsPlusMenu(driver, timeout = DEFAULT_TIMEOUT) {
  await ensureRoomsSectionReady(driver);
  await tapRoomsPlusMenu(driver, timeout);
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

async function waitForRoomsListReady(driver) {
  await ensureRoomsSectionReady(driver);
}

async function maybeSendStarterMessage(driver, screenshotName) {
  if (!CREATE_ROOM_SEND_MESSAGES) {
    return;
  }

  await typeComposerMessage(driver, generateRandomMessage());
  const sendBtn = await driver.$(SELECTORS.sendMessageButton);
  await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
  await sendBtn.click();
  await saveCreateRoomScreenshot(driver, screenshotName);
}

/**
 * From the main list (Rooms visible): open Rooms +, create a **private** room named `roomName`, then **Create**.
 * By default: Skip for now → optional starter message → tap backButton to list.
 * With `skipAddMembersSheet: true`: stops on **Add Members** (caller adds invitees + Save).
 * Does not call `ensureRoomsSectionReady`.
 */
async function createPrivateRoom(driver, roomName, options = {}) {
  const { sendStarterMessage = false, skipAddMembersSheet = false } = options;

  await openRoomsPlusMenu(driver);

  const createRoomBtn = await driver.$(SELECTORS.createRoomButton);
  await createRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await createRoomBtn.click();

  const roomField = await driver.$(SELECTORS.roomNameText);
  await roomField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await roomField.click();
  await roomField.setValue(roomName);

  await togglePrivateRoom(driver, DEFAULT_TIMEOUT);

  const creationStarted = performance.now();
  await tapByText(driver, 'Create', DEFAULT_TIMEOUT);

  if (skipAddMembersSheet) {
    console.log(`createPrivateRoom: ${roomName} (Add Members sheet — add invitees then Save)`);
    return { roomName, roomCreationMs: Math.round(performance.now() - creationStarted) };
  }

  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);
  await ensureCreatedRoomOpen(driver, roomName);
  const roomCreationMs = Math.round(performance.now() - creationStarted);

  if (sendStarterMessage) {
    await typeComposerMessage(driver, generateRandomMessage());
    const sendBtn = await driver.$(SELECTORS.sendMessageButton);
    await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
    await sendBtn.click();
    await driver.pause(400);
  }

  await tapBackButton(driver);
  await driver.pause(600);
  console.log(`createPrivateRoom: ${roomName}`);
  return { roomName, roomCreationMs };
}

/**
 * From the main list (Rooms visible): open Rooms +, create a **public** room named `roomName`, then **Create**.
 * By default: Skip for now → stays in the room (caller taps nav title, etc.).
 * With `sendStarterMessage: true`: sends one message before returning (still in room).
 */
async function createPublicRoom(driver, roomName, options = {}) {
  const { sendStarterMessage = false } = options;

  await openRoomsPlusMenu(driver);

  const createRoomBtn = await driver.$(SELECTORS.createRoomButton);
  await createRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await createRoomBtn.click();

  const roomField = await driver.$(SELECTORS.roomNameText);
  await roomField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await roomField.click();
  await roomField.setValue(roomName);

  const creationStarted = performance.now();
  await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);
  await ensureCreatedRoomOpen(driver, roomName);
  const roomCreationMs = Math.round(performance.now() - creationStarted);

  if (sendStarterMessage) {
    await typeComposerMessage(driver, generateRandomMessage());
    const sendBtn = await driver.$(SELECTORS.sendMessageButton);
    await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
    await sendBtn.click();
    await driver.pause(400);
  }

  console.log(`createPublicRoom: ${roomName}`);
  return { roomName, roomCreationMs };
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await driver.pause(1200);
  }

  await openRoomsPlusMenu(driver);

  const createRoomBtn = await driver.$(SELECTORS.createRoomButton);
  await createRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await createRoomBtn.click();
  console.log('Opened Create a Room screen');
  await saveCreateRoomScreenshot(driver, 'public_create_room.png');

  const publicRoomField = await driver.$(SELECTORS.roomNameText);
  await publicRoomField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await publicRoomField.click();

  const publicRoomName = generateRoomName('Public', 'A');
  console.log(`Public room name: ${publicRoomName}`);
  await publicRoomField.setValue(publicRoomName);
  await saveCreateRoomScreenshot(driver, 'public_room_name.png');

  let roomCreationMs = 0;
  let creationStarted = performance.now();
  await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);
  await ensureCreatedRoomOpen(driver, publicRoomName);
  roomCreationMs += Math.round(performance.now() - creationStarted);

  await maybeSendStarterMessage(driver, 'public_room_sent.png');

  await tapBackButton(driver);
  await waitForRoomsListReady(driver);
  await saveCreateRoomScreenshot(driver, 'rooms_list_after_public.png');

  if (CREATE_ROOM_SMOKE) {
    console.log('CreateRoom: CREATE_ROOM_MODE=smoke — skipping private room flow');
    return { timings: { roomCreationMs } };
  }

  await openRoomsPlusMenu(driver);

  const privateCreateRoomBtn = await driver.$(SELECTORS.createRoomButton);
  await privateCreateRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await privateCreateRoomBtn.click();
  await saveCreateRoomScreenshot(driver, 'private_create_room.png');

  const privateRoomField = await driver.$(SELECTORS.roomNameText);
  await privateRoomField.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await privateRoomField.click();

  const privateRoomName = generateRoomName('Private', 'B');
  console.log(`Private room name: ${privateRoomName}`);
  await privateRoomField.setValue(privateRoomName);

  await togglePrivateRoom(driver, DEFAULT_TIMEOUT);
  await saveCreateRoomScreenshot(driver, 'private_room_toggle.png');

  creationStarted = performance.now();
  await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
  await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);
  await ensureCreatedRoomOpen(driver, privateRoomName);
  roomCreationMs += Math.round(performance.now() - creationStarted);

  await maybeSendStarterMessage(driver, 'private_room_sent.png');

  await tapBackButton(driver);
  console.log('Returned to Rooms list after private room');
  return { timings: { roomCreationMs } };
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (err) {
      try {
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
        await dumpSource(activeDriver, 'ERROR_source.xml');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run, generateRoomName, createPrivateRoom, createPublicRoom };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
