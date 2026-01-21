require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

/*-----------------Config----------------------------------------*/
const ARTIFACTS_DIR = path.resolve(__dirname, '../screenshots');
const DEFAULT_TIMEOUT = 20000;

/*-----------------Helpers----------------------------------------*/
async function typeComposerMessage(driver, message, timeout = DEFAULT_TIMEOUT) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    console.log('✅ Typed message (by accessibility id)');
    return;
  }

  // 2️⃣ Tap placeholder text
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

  // 3️⃣ Type into first visible TextView
  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      await tv.click();
      await driver.pause(150);
      await tv.setValue(message);
      console.log('✅ Typed message in composer');
      return;
    }
  }

  throw new Error('❌ Could not find message composer TextView');
}

function ensureArtifactsDir() {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  return ARTIFACTS_DIR;
}

async function screenshot(driver, name) {
  const file = path.join(ensureArtifactsDir(), name);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

async function dumpSource(driver, name) {
  const file = path.join(ensureArtifactsDir(), name);
  const xml = await driver.getPageSource();
  fs.writeFileSync(file, xml, 'utf8');
  console.log(`🧾 Page source saved: ${file}`);
}

function generateRoomName(prefix = 'Room') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
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

/**
 * Rooms "+" button is the other button in the same header container
 */
async function openRoomsPlusMenu(driver, timeout = DEFAULT_TIMEOUT) {
  const roomsHeader = await driver.$('~Rooms section header');
  await roomsHeader.waitForDisplayed({ timeout });

  const roomsPlus = await driver.$(
    `//XCUIElementTypeButton[@name="Rooms section header"]/ancestor::XCUIElementTypeOther[1]/XCUIElementTypeButton[@name!="Rooms section header"][1]`
  );

  await roomsPlus.waitForDisplayed({ timeout });
  await roomsPlus.click();
  console.log('✅ Clicked Rooms "+"');
}

/**
 * Private room toggle (keep it simple & reliable):
 * 1) labeled switch if present
 * 2) otherwise first visible switch
 */
async function togglePrivateRoom(driver, timeout = DEFAULT_TIMEOUT) {
  const labeledSwitch = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeSwitch" AND (label == "Create private room" OR name == "Create private room")`
  );

  if (await labeledSwitch.isExisting().catch(() => false)) {
    await labeledSwitch.waitForDisplayed({ timeout });
    await labeledSwitch.click();
    console.log('✅ Toggled Private room (labeled switch)');
    return;
  }

  const switches = await driver.$$('XCUIElementTypeSwitch');
  for (const sw of switches) {
    if (await sw.isDisplayed().catch(() => false)) {
      await sw.click();
      console.log('✅ Toggled Private room (first visible switch)');
      return;
    }
  }

  throw new Error('❌ Could not locate Private room switch');
}

/**
 * Wait until we're safely back on the Rooms list (reduces flake/slow run #2)
 */
async function waitForRoomsListReady(driver, timeout = DEFAULT_TIMEOUT) {
  const roomsHeader = await driver.$('~Rooms section header');
  await roomsHeader.waitForDisplayed({ timeout });
  await driver.pause(400); // let SwiftUI settle
}

/*--------------------Tests------------------------------------------*/
async function run() {
  let driver;

  try {
    driver = await createDriver();

    await ensureLoggedIn(driver);
    await driver.pause(1200);

    /*------------------Creating Public room ------------------*/
    await openRoomsPlusMenu(driver);

    // Re-query each time (avoid stale element refs)
    {
      const createRoomBtn = await driver.$('~createRoomButton');
      await createRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
      await createRoomBtn.click();
    }
    console.log('✅ Opened Create a Room screen');

    {
      const roomName = await driver.$('~roomNameText');
      await roomName.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
      await roomName.click();

      const publicRoomName = `Public ${generateRoomName('Room')}`;
      console.log(`🆕 Room name for this run is Public: ${publicRoomName}`);

      await roomName.setValue(publicRoomName);
      console.log('✅ Entered room name');
    }

    await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
    console.log('✅ Tapped Create');

    await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);
    console.log('✅ Tapped Skip for now');

    await typeComposerMessage(driver, generateRandomMessage());
    {
      const sendBtn = await driver.$('~sendMessageButton');
      await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
      await sendBtn.click();
      console.log('📨 Sent message');
    }

    await driver.pause(800);
    {
      const backButton = await driver.$('~backButton');
      await backButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
      await backButton.click();
    }
    console.log('✅ Returned to Rooms list');

    // ✅ Important: wait for list to be ready before run #2
    await waitForRoomsListReady(driver);

    /*------------------Creating Private room ------------------*/
    await openRoomsPlusMenu(driver);

    {
      const createRoomBtn = await driver.$('~createRoomButton');
      await createRoomBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
      await createRoomBtn.click();
    }
    console.log('✅ Opened Create a Room screen (Private)');

    {
      const roomName = await driver.$('~roomNameText');
      await roomName.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
      await roomName.click();

      // ✅ Generate a NEW name for private room too
      const privateRoomName = `Private ${generateRoomName('Room')}`;
      console.log(`🆕 Room name for this run is Private: ${privateRoomName}`);

      await roomName.setValue(privateRoomName);
      console.log('✅ Entered room name (Private)');
    }

    await togglePrivateRoom(driver, DEFAULT_TIMEOUT);

    await tapByText(driver, 'Create', DEFAULT_TIMEOUT);
    await tapByText(driver, 'Skip for now', DEFAULT_TIMEOUT);

    await typeComposerMessage(driver, generateRandomMessage());
    {
      const sendBtn = await driver.$('~sendMessageButton');
      await sendBtn.waitForEnabled({ timeout: DEFAULT_TIMEOUT });
      await sendBtn.click();
      console.log('📨 Sent message');
    }

    {
      const backButton = await driver.$('~backButton');
      await backButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
      await backButton.click();
    }
    console.log('✅ Returned to Rooms list (after Private)');

  } catch (err) {
    console.error('❌ Test failed:', err);

    if (driver) {
      try {
        await screenshot(driver, 'ERROR.png');
        await dumpSource(driver, 'ERROR_source.xml');
      } catch {}
    }

    throw err;
  } finally {
    if (driver) await driver.deleteSession();
  }
}

run().catch(() => process.exit(1));
