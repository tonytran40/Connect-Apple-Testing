require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');
const { generateRoomName, createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'editRoom';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.EDIT_ROOM_TIMEOUT_MS, 10) || 20000;
const ROOM_TOPIC = process.env.EDIT_ROOM_TOPIC || 'This is a random room topic';
const ROOM_NAME_SUFFIX = process.env.EDIT_ROOM_NAME_SUFFIX || '-EDITED';

function editedRoomName(baseName) {
  return `${baseName}${ROOM_NAME_SUFFIX}`;
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

async function waitForInRoom(driver, timeout = DEFAULT_TIMEOUT) {
  const header = await driver.$('~openRoomSettingsButton');
  await header.waitForDisplayed({ timeout });
}

async function tapConversationHeader(driver, roomName) {
  const settingsBtn = await driver.$('~openRoomSettingsButton');
  if (await settingsBtn.isDisplayed().catch(() => false)) {
    await settingsBtn.click();
    console.log('editRoom: tapped ~openRoomSettingsButton');
    return;
  }

  const safe = esc(roomName);
  const titleBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  await titleBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await titleBtn.click();
  console.log('editRoom: tapped conversation header via title fallback');
}

/** PBCheckbox renders as XCUIElementTypeSwitch name/label "Yes" in the edit modal XML. */
async function togglePrivateRoomInEditModal(driver, timeout = DEFAULT_TIMEOUT) {
  const yesSwitch = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeSwitch" AND (label == "Yes" OR name == "Yes")`
  );
  await yesSwitch.waitForDisplayed({ timeout });
  await yesSwitch.click();
  console.log('editRoom: toggled private via Yes switch');
}

async function setEditedRoomName(driver, baseName, timeout = DEFAULT_TIMEOUT) {
  const edited = editedRoomName(baseName);
  const nameField = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeTextField" AND (name == "setRoomName" OR label == "setRoomName")`
  );
  if (!(await nameField.isExisting().catch(() => false))) {
    const byId = await driver.$('~setRoomName');
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(edited);
    console.log(`editRoom: set room name via ~setRoomName: "${edited}"`);
    return edited;
  }

  await nameField.waitForDisplayed({ timeout });
  await nameField.click();
  await nameField.setValue(edited);
  console.log(`editRoom: set room name: "${edited}"`);
  return edited;
}

async function fillTopicInput(driver, topic, timeout = DEFAULT_TIMEOUT) {
  const topicField = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeTextField" AND (name == "setTopic" OR label == "setTopic")`
  );
  if (!(await topicField.isExisting().catch(() => false))) {
    const byId = await driver.$('~setTopic');
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(topic);
    console.log(`editRoom: set topic via ~setTopic: "${topic}"`);
    return;
  }

  await topicField.waitForDisplayed({ timeout });
  await topicField.click();
  await topicField.setValue(topic);
  console.log(`editRoom: set topic: "${topic}"`);
}

async function tapSaveInEditModal(driver, timeout = DEFAULT_TIMEOUT) {
  const saveNav = await driver.$(
    `//XCUIElementTypeNavigationBar//XCUIElementTypeButton[(@name="Save" or @label="Save")]`
  );
  if (await saveNav.isExisting().catch(() => false)) {
    await saveNav.waitForEnabled({ timeout });
    await saveNav.click();
    console.log('editRoom: tapped Save (navigation bar)');
    return;
  }

  const saveBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (label == "Save" OR name == "Save")`
  );
  await saveBtn.waitForEnabled({ timeout });
  await saveBtn.click();
  console.log('editRoom: tapped Save');
}

async function tapCloseEditModal(driver, timeout = DEFAULT_TIMEOUT) {
  const closeBtn = await driver.$('~closeButton');
  if (await closeBtn.isExisting().catch(() => false)) {
    await closeBtn.waitForDisplayed({ timeout });
    await closeBtn.click();
    console.log('editRoom: tapped ~closeButton');
    return;
  }

  const navClose = await driver.$('//XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]');
  await navClose.waitForDisplayed({ timeout });
  await navClose.click();
  console.log('editRoom: tapped navigation bar close (top-left)');
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }
  await resetToHome(driver);
  await pause(driver, 450);

  const sortKey = process.env.EDIT_ROOM_SORT_KEY || 'E';
  const roomName = generateRoomName('Public', sortKey);
  const savedRoomName = editedRoomName(roomName);
  console.log(`editRoom: creating "${roomName}"`);

  await createPublicRoom(driver, roomName);
  await pause(driver, 600);
  await waitForInRoom(driver);
  await saveScreenshot(driver, TEST_NAME, '01_in_room.png');

  await tapConversationHeader(driver, roomName);
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '02_edit_modal_open.png');

  await togglePrivateRoomInEditModal(driver);
  await pause(driver, 300);
  await saveScreenshot(driver, TEST_NAME, '03_after_toggle_private.png');

  await setEditedRoomName(driver, roomName);
  await pause(driver, 300);
  await saveScreenshot(driver, TEST_NAME, '04_after_name_edited.png');

  await fillTopicInput(driver, ROOM_TOPIC);
  await pause(driver, 300);
  await saveScreenshot(driver, TEST_NAME, '05_after_topic_filled.png');

  await tapSaveInEditModal(driver);
  await pause(driver, 600);
  await saveScreenshot(driver, TEST_NAME, '06_after_save.png');

  await tapCloseEditModal(driver);
  await pause(driver, 400);
  await waitForInRoom(driver);
  await saveScreenshot(driver, TEST_NAME, '07_after_close.png');

  await tapConversationHeader(driver, savedRoomName);
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '08_reopened_saved_settings.png');
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
