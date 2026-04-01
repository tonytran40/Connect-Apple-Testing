require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { runWithOptionalDriver, goBack } = require('../utils/testSession');

const DEBUG_DUMP_SOURCE = true;

function ensureArtifactsDir() {
  const dir = path.resolve(__dirname, '../screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function screenshot(driver, name) {
  const file = path.join(ensureArtifactsDir(), name);
  await driver.saveScreenshot(file);
  console.log(`Screenshot: ${file}`);
}

async function step(driver, label, shotName) {
  console.log(label);
  if (shotName) await screenshot(driver, shotName);
}

async function dumpSource(driver, filename = 'page_source.xml') {
  if (!DEBUG_DUMP_SOURCE) return;

  const file = path.join(ensureArtifactsDir(), filename);
  const xml = await driver.getPageSource();
  fs.writeFileSync(file, xml, 'utf8');
  console.log(`Page source saved: ${file}`);
}

function containsAnyTextPredicate(text) {
  const safe = text.replace(/"/g, '\\"');
  return (
    `(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton" OR type == "XCUIElementTypeOther" OR type == "XCUIElementTypeCell") ` +
    `AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}" OR value CONTAINS "${safe}")`
  );
}

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

  throw new Error(`Could not find "${text}" after ${maxScrolls} scrolls`);
}

async function tapByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  const parentButton = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeButton[1]`
  );

  if (await parentButton.isExisting().catch(() => false)) {
    await parentButton.waitForDisplayed({ timeout });
    await parentButton.click();
    return;
  }

  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );

  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
}

async function tapRadioLoose(driver, title, timeout = 20000) {
  const predicate = containsAnyTextPredicate(title);
  const el = await driver.$(`-ios predicate string:${predicate}`);

  await el.waitForDisplayed({ timeout });
  await el.click();
}

async function toggleSectionItems(driver, sectionTitle, itemLabels, timeout = 10000) {
  await tapByText(driver, sectionTitle, timeout);

  for (const label of itemLabels) {
    await tapRadioLoose(driver, label, timeout);
  }

  await tapByText(driver, sectionTitle, timeout);
}

async function runTest(driver) {
  const closeButton = await driver.$('~closeButton');

  await ensureLoggedIn(driver);
  await driver.pause(1200);
  await step(driver, 'Logged in / app ready', '00_ready.png');

  const userSettings = await driver.$('~settingsButton');
  await userSettings.waitForDisplayed({ timeout: 15000 });
  await userSettings.click();
  await driver.pause(800);
  await step(driver, 'Opened User Settings', '01_settings.png');

  await tapByText(driver, 'Corporate Directory', 10000);
  await driver.pause(1200);
  await tapByText(driver, 'Departments', 10000);
  await tapByText(driver, 'Territories', 10000);
  await driver.pause(1200);
  await goBack(driver);

  await tapByText(driver, 'Conversation Layout', 10000);
  await driver.pause(800);
  await step(driver, 'Conversation Layout View', '02_Conversation Layout View.png');

  await dumpSource(driver, '02_layout_expanded_source.xml');
  await scrollToText(driver, 'Cozy', 6);
  await tapRadioLoose(driver, 'Cozy', 10000);
  await driver.pause(800);
  await closeButton.click();
  await step(driver, 'After Cozy tap', '03_after_tap_cozy.png');

  await userSettings.click();
  await tapByText(driver, 'Conversation Layout', 10000);
  await tapRadioLoose(driver, 'Classic', 10000);
  await closeButton.click();
  await step(driver, 'After Classic tap', '04_after_tap_classic.png');
  await driver.pause(800);

  await userSettings.click();
  await tapByText(driver, 'Conversation Sorting', 10000);
  await tapRadioLoose(driver, 'Recent Activity', 10000);
  await tapRadioLoose(driver, 'Alphabetically', 10000);
  await tapRadioLoose(driver, 'Self-Managed', 10000);
  await tapByText(driver, 'Conversation Sorting', 10000);

  await tapByText(driver, 'Help & Diagnostics', 10000);
  await tapByText(driver, 'Help & Diagnostics', 10000);

  const messageFeatureToggles = [
    'Attachments',
    'Reactions',
    'Avatars',
    'Rich Text',
    'Link Previews',
    'Filter Members UI',
    'Show Room ID',
    'Show Last Message Date',
    'Enable Analytics Debug',
  ];

  await toggleSectionItems(driver, 'Message Features', messageFeatureToggles, 10000);
  await step(driver, 'After toggling all off', '05_off_message_features');
  await toggleSectionItems(driver, 'Message Features', messageFeatureToggles, 10000);
}

async function run(driver) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver);
    } catch (err) {
      try { await screenshot(activeDriver, 'ERROR.png'); } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run };

if (require.main === module) {
  run().catch(() => process.exit(1));
}
