require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

/*-----------------Helpers----------------------------------------*/
const ARTIFACTS_DIR = path.resolve(__dirname, '../screenshots');

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


function generateRoomName(prefix = 'Connect Testing Squad') {
  const ts = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14); // YYYYMMDDHHMMSS
  return `${prefix} ${ts}`;
}

async function tapByText(driver, text, timeout = 20000) {
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
async function openRoomsPlusMenu(driver, timeout = 20000) {
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
async function togglePrivateRoom(driver, timeout = 20000) {
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

/*--------------------Tests------------------------------------------*/
async function run() {
  let driver;

  try {
    driver = await createDriver();

    await ensureLoggedIn(driver);
    await driver.pause(1200);

    // Open Rooms menu
    await openRoomsPlusMenu(driver);

    // Tap "Create a Room"
    const createRoomBtn = await driver.$('~createRoomButton');
    await createRoomBtn.waitForDisplayed({ timeout: 20000 });
    await createRoomBtn.click();
    console.log('✅ Opened Create a Room screen');

    // Enter room name (unique each run)
    const roomName = await driver.$('~roomNameText');
    await roomName.waitForDisplayed({ timeout: 20000 });
    await roomName.click();

    const newRoomName = generateRoomName();
    console.log(`🆕 Room name for this run: ${newRoomName}`);

    await roomName.setValue(newRoomName);
    console.log('✅ Entered room name');

    // Toggle Private room
    await togglePrivateRoom(driver);

    // Create + skip
    await tapByText(driver, 'Create', 10000);
    console.log('✅ Tapped Create');

    await tapByText(driver, 'Skip for now', 10000);
    console.log('✅ Tapped Skip for now');

    await driver.pause(1500);

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
