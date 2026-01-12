require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

/* -------------------- helpers -------------------- */

function ensureScreenshotsDir() {
  const dir = path.resolve(__dirname, '../screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function screenshot(driver, name) {
  const dir = ensureScreenshotsDir();
  const file = path.join(dir, name);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

async function step(driver, label, shotName) {
  console.log(`➡️  ${label}`);
  if (shotName) await screenshot(driver, shotName);
}

/**
 * Tap a Settings row by its visible text (works when there is no accessibilityIdentifier).
 * This clicks the text itself if possible, otherwise clicks its parent button/cell.
 */
async function tapByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  // 1) Try static text directly
  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  // 2) Try tapping its parent Button
  const parentButton = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeButton[1]`
  );

  if (await parentButton.isExisting().catch(() => false)) {
    await parentButton.waitForDisplayed({ timeout });
    await parentButton.click();
    return;
  }

  // 3) Try tapping its parent Cell
  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );

  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
}

/**
 * PBRadio / SwiftUI row tap (NO coordinate math):
 * - Finds the StaticText label (e.g. "Cozy")
 * - Taps the nearest XCUIElementTypeOther row container (most common in SwiftUI)
 * - If that fails, taps a Button ancestor
 * - Final fallback: uses a native tap on the label elementId (sometimes works better than .click)
 */
async function tapPBRadioOption(driver, title, timeout = 20000) {
  const safe = title.replace(/"/g, '\\"');

  // 1) Find the label
  const label = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );
  await label.waitForDisplayed({ timeout });

  // 2) Prefer tapping the SwiftUI row container (usually XCUIElementTypeOther)
  const rowOther = await driver.$(
    `//XCUIElementTypeStaticText[@name="${title}" or @label="${title}"]/ancestor::XCUIElementTypeOther[1]`
  );

  if (await rowOther.isExisting().catch(() => false)) {
    try {
      // Try normal click first
      await rowOther.click();
      console.log(`✅ Clicked radio row container (Other): ${title}`);
      return;
    } catch {
      // If click doesn't trigger SwiftUI gesture, do a native tap on the element
      await driver.execute('mobile: tap', { elementId: rowOther.elementId });
      console.log(`✅ Native-tapped radio row container (Other): ${title}`);
      return;
    }
  }

  // 3) Fallback: try a Button ancestor
  const rowButton = await driver.$(
    `//XCUIElementTypeStaticText[@name="${title}" or @label="${title}"]/ancestor::XCUIElementTypeButton[1]`
  );

  if (await rowButton.isExisting().catch(() => false)) {
    try {
      await rowButton.click();
      console.log(`✅ Clicked radio row container (Button): ${title}`);
      return;
    } catch {
      await driver.execute('mobile: tap', { elementId: rowButton.elementId });
      console.log(`✅ Native-tapped radio row container (Button): ${title}`);
      return;
    }
  }

  // 4) Last resort: native tap the label itself
  await driver.execute('mobile: tap', { elementId: label.elementId });
  console.log(`✅ Native-tapped radio label: ${title}`);
}

/* -------------------- test -------------------- */

async function run() {
  let driver;

  try {
    driver = await createDriver();
    const backButton = await driver.$('~backButton');

    // 1) Ensure login (handles “already logged in” too)
    await ensureLoggedIn(driver);
    await driver.pause(1200);
    await step(driver, 'Logged in / app ready', '00_ready.png');

    // 2) Open Settings
    const userSettings = await driver.$('~settingsButton');
    await userSettings.waitForDisplayed({ timeout: 15000 });
    await userSettings.click();
    await driver.pause(800);
    await step(driver, 'Opened User Settings', '01_settings.png');

    // 3) Corporate Directory
    await tapByText(driver, 'Corporate Directory', 25000);
    await driver.pause(1200);
    await tapByText(driver, 'Departments', 25000);
    await tapByText(driver, 'Territories', 25000);
    await driver.pause(1200);
    await backButton.click();

    // 4) Conversation Sorting
    await tapByText(driver, 'Conversation Sorting', 25000);
    await driver.pause(1200)
    await tapByText(driver, 'Conversation Sorting', 25000); //close

    // 5) Conversation Layout
    await tapByText(driver, 'Conversation Layout', 25000);
    await driver.pause(800);
    await tapByText(driver, 'Conversation Layout', 25000); //close

    // 6) Help & Diagnostics
    await tapByText(driver, 'Help & Diagnostics', 25000);
    await driver.pause(800);
    await tapByText(driver, 'Help & Diagnostics', 25000); //close

    // 7) Message Features
    await tapByText(driver, 'Message Features', 25000);
    await driver.pause(800);
    await tapByText(driver, 'Message Features', 25000); //close

    // ✅ Instead of tapByText("Cozy"), use the SwiftUI/PBRadio row tap
    //await tapPBRadioOption(driver, 'Cozy', 25000);

    //await driver.pause(800);
    //await step(driver, 'Selected Cozy', '02_selected_cozy.png');

    //console.log('✅ Corporate Directory + Conversation Layout done');

  } catch (err) {
    console.error('❌ Test failed:', err);
    if (driver) {
      try { await screenshot(driver, 'ERROR.png'); } catch {}
    }
    throw err;

  } finally {
    // Keep open while you’re building the test
    // if (driver) {
    //   await driver.terminateApp('com.powerhrg.connect.v3.debug');
    //   await driver.deleteSession();
    // }
  }
}

run().catch(() => process.exit(1));
