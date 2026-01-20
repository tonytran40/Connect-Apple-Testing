require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

/* ==================== CONFIG ==================== */

const DEBUG_DUMP_SOURCE = false; // flip to true when debugging UI issues

/* ==================== HELPERS ==================== */

function ensureArtifactsDir() {
  const dir = path.resolve(__dirname, '../screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function screenshot(driver, name) {
  const file = path.join(ensureArtifactsDir(), name);
  await driver.saveScreenshot(file);
  console.log(`📸 Screenshot: ${file}`);
}

async function step(driver, label, shotName) {
  console.log(`➡️  ${label}`);
  if (shotName) await screenshot(driver, shotName);
}

async function dumpSource(driver, filename = 'page_source.xml') {
  if (!DEBUG_DUMP_SOURCE) return;

  const file = path.join(ensureArtifactsDir(), filename);
  const xml = await driver.getPageSource();
  fs.writeFileSync(file, xml, 'utf8');
  console.log(`🧾 Page source saved: ${file}`);
}

/**
 * Generic text finder for SwiftUI (very forgiving)
 */
function containsAnyTextPredicate(text) {
  const safe = text.replace(/"/g, '\\"');
  return (
    `(type == "XCUIElementTypeStaticText" OR ` +
    `type == "XCUIElementTypeButton" OR ` +
    `type == "XCUIElementTypeOther" OR ` +
    `type == "XCUIElementTypeCell") AND ` +
    `(name CONTAINS "${safe}" OR label CONTAINS "${safe}" OR value CONTAINS "${safe}")`
  );
}

/**
 * Scroll until text appears
 */
async function scrollToText(driver, text, maxScrolls = 6) {
  const predicate = containsAnyTextPredicate(text);

  for (let i = 0; i < maxScrolls; i++) {
    const el = await driver.$(`-ios predicate string:${predicate}`);
    if (await el.isExisting().catch(() => false)) return;

    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
    } catch {}
    await driver.pause(400);
  }

  throw new Error(`❌ Could not find "${text}" after scrolling`);
}

/**
 * Tap by visible text (best default click helper)
 */
async function tapByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  const el = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND ` +
    `(label == "${safe}" OR name == "${safe}")`
  );

  if (await el.isExisting().catch(() => false)) {
    await el.waitForDisplayed({ timeout });
    await el.click();
    return;
  }

  const fallback = await driver.$(`-ios predicate string:${containsAnyTextPredicate(text)}`);
  await fallback.waitForDisplayed({ timeout });
  await fallback.click();
}

/**
 * Loose toggle / radio / switch tap (works for PBRadio, toggles, flags)
 */
async function tapLoose(driver, text, timeout = 20000) {
  const el = await driver.$(`-ios predicate string:${containsAnyTextPredicate(text)}`);
  await el.waitForDisplayed({ timeout });
  await el.click();
  console.log(`✅ Tapped: ${text}`);
}

/* ==================== TEST ==================== */

async function run() {
  let driver;

  try {
    driver = await createDriver();

    // 1️⃣ Ensure login
    await ensureLoggedIn(driver);
    await driver.pause(1200);
    await step(driver, 'Logged in / app ready', '00_ready.png');

    /* ==================== YOUR TEST STARTS HERE ==================== */

    // Example:
    // const settingsBtn = await driver.$('~settingsButton');
    // await settingsBtn.click();
    // await tapByText(driver, 'Conversation Layout');
    // await tapLoose(driver, 'Cozy');

    /* ==================== YOUR TEST ENDS HERE ==================== */

    console.log('🎉 Test completed successfully');

  } catch (err) {
    console.error('❌ Test failed:', err);
    if (driver) {
      try { await screenshot(driver, 'ERROR.png'); } catch {}
    }
    throw err;
  } finally {
    // Leave open while developing
    // if (driver) await driver.deleteSession();
  }
}

run().catch(() => process.exit(1));