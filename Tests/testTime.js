/**
 * Private room via `createPrivateRoom({ skipAddMembersSheet })` → tap Select under Add Individuals, type Jakes, Save →
 * Members → Edit → Filter Members: **Department** typeahead only → Create Filter → Save → timed sync.
 * Run: npm run test:time
 */
require('dotenv').config();

const { performance } = require('node:perf_hooks');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot, ensureTestArtifactsDir } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');
const { createPrivateRoom } = require('./CreateRoom');

const DEFAULT_TIMEOUT = 25000;
const TEST_NAME = 'testTime';

const ROOM_NAME = process.env.TEST_TIME_ROOM_NAME || 'Testing events';
const INVITEES = (process.env.TEST_TIME_INVITEES || 'Jake Palladino,Jake Morgan')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const DEPARTMENT_FILTER = process.env.TEST_TIME_DEPARTMENT || 'Business Technology';

const STABLE_MEMBER_MS = Number(process.env.TEST_TIME_STABLE_MS || 3000);
const STABLE_POLL_MS = Number(process.env.TEST_TIME_POLL_MS || 600);
const MAX_SYNC_MS = Number(process.env.TEST_TIME_MAX_WAIT_MS || 600000);

function containsAnyTextPredicate(text) {
  const safe = text.replace(/"/g, '\\"');
  return (
    `(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton" OR type == "XCUIElementTypeOther" OR type == "XCUIElementTypeCell") ` +
    `AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}" OR value CONTAINS "${safe}")`
  );
}

async function scrollToText(driver, text, maxScrolls = 10) {
  const predicate = containsAnyTextPredicate(text);
  for (let i = 0; i < maxScrolls; i++) {
    const el = await driver.$(`-ios predicate string:${predicate}`);
    if (await el.isExisting().catch(() => false)) return;
    try {
      await driver.execute('mobile: scroll', { direction: 'down' });
    } catch {}
    await driver.pause(350);
  }
  throw new Error(`Could not find "${text}" after ${maxScrolls} scrolls`);
}

async function tapByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = text.replace(/"/g, '\\"');
  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );
  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }
  const loose = await driver.$(`-ios predicate string:${containsAnyTextPredicate(text)}`);
  await loose.waitForDisplayed({ timeout });
  await loose.click();
}

async function tapRadioLoose(driver, title, timeout = DEFAULT_TIMEOUT) {
  const el = await driver.$(`-ios predicate string:${containsAnyTextPredicate(title)}`);
  await el.waitForDisplayed({ timeout });
  await el.click();
}

async function tapSearchResultByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = text.replace(/"/g, '\\"');
  const buttonEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await buttonEl.isExisting().catch(() => false)) {
    await buttonEl.waitForDisplayed({ timeout });
    await buttonEl.click();
    return;
  }
  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }
  const cellEl = await driver.$(
    `//XCUIElementTypeStaticText[contains(@name,"${text}") or contains(@label,"${text}")]/ancestor::XCUIElementTypeCell[1]`
  );
  await cellEl.waitForDisplayed({ timeout });
  await cellEl.click();
}

async function tapTopSave(driver, waitForEnabledMs = 120000) {
  const save = await driver.$(
    `//XCUIElementTypeNavigationBar//XCUIElementTypeButton[(@name="Save" or @label="Save")]`
  );
  await save.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await save.waitForEnabled({ timeout: waitForEnabledMs });
  await save.click();
}

function addIndividualsSectionPredicate() {
  return (
    `contains(@name,"ADD INDIVIDUALS") or contains(@label,"ADD INDIVIDUALS") or ` +
    `contains(@name,"Add individuals") or contains(@label,"Add individuals") or ` +
    `contains(@name,"Add Individuals") or contains(@label,"Add Individuals")`
  );
}

/** Tap the “Select” typeahead row under ADD INDIVIDUALS (placeholder + chevron), then caller types into the search UI. */
async function tapSelectUnderAddIndividuals(driver) {
  const sm = addIndividualsSectionPredicate();

  const selectTaps = [
    `//XCUIElementTypeStaticText[${sm}]/following::XCUIElementTypeStaticText[@name="Select" or @label="Select"][1]`,
    `//XCUIElementTypeStaticText[${sm}]/following::XCUIElementTypeButton[(@name="Select" or @label="Select")][1]`,
    `//XCUIElementTypeStaticText[${sm}]/following::XCUIElementTypeCell[.//XCUIElementTypeStaticText[@name="Select" or @label="Select"]][1]`,
    `//XCUIElementTypeStaticText[${sm}]/following::*[(@name="Select" or @label="Select")][1]`,
  ];

  for (const xp of selectTaps) {
    const el = await driver.$(xp);
    if (await el.isExisting().catch(() => false) && (await el.isDisplayed().catch(() => false))) {
      await el.click();
      await driver.pause(500);
      return;
    }
  }

  const loose = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton") AND (name == "Select" OR label == "Select")`
  );
  if (await loose.isExisting().catch(() => false) && (await loose.isDisplayed().catch(() => false))) {
    await loose.click();
    await driver.pause(500);
    return;
  }

  throw new Error('Could not tap “Select” under Add Individuals');
}

/**
 * Tap **Select** under Add Individuals, then type into the search field / typeahead (not Territory/Department).
 */
async function typeIntoAddIndividualsTypeahead(driver, textToType) {
  await tapSelectUnderAddIndividuals(driver);

  const sm = addIndividualsSectionPredicate();
  const inputPaths = [
    `//XCUIElementTypeStaticText[${sm}]/following::XCUIElementTypeTextField[1]`,
    `//XCUIElementTypeStaticText[${sm}]/following::XCUIElementTypeTextView[1]`,
    `//XCUIElementTypeStaticText[${sm}]/following::XCUIElementTypeSearchField[1]`,
  ];

  for (const xp of inputPaths) {
    const el = await driver.$(xp);
    if (await el.isExisting().catch(() => false) && (await el.isDisplayed().catch(() => false))) {
      await el.click();
      await driver.pause(200);
      try {
        await el.clearValue();
      } catch {}
      await el.setValue(textToType);
      return;
    }
  }

  for (const pick of [
    () => driver.$('XCUIElementTypeSearchField'),
    () => driver.$('//XCUIElementTypeTextField[1]'),
    () => driver.$('//XCUIElementTypeTextView[1]'),
  ]) {
    const q = pick();
    if (await q.isExisting().catch(() => false) && (await q.isDisplayed().catch(() => false))) {
      await q.click();
      await driver.pause(150);
      try {
        await q.clearValue();
      } catch {}
      await q.setValue(textToType);
      return;
    }
  }

  throw new Error('Could not type into field after tapping Select under Add Individuals');
}

async function addInviteeFromAddMembersSheet(driver, name) {
  await typeIntoAddIndividualsTypeahead(driver, name);
  await driver.pause(800);
  await tapSearchResultByText(driver, name, DEFAULT_TIMEOUT);
  await driver.pause(450);
}

/**
 * Filter Members: open the **Department** row only (label DEPARTMENT → next TextField), not Territory.
 */
async function focusDepartmentTypeaheadOnFilterMembers(driver) {
  try {
    await scrollToText(driver, 'Filter Members', 8);
  } catch {}
  await scrollToText(driver, 'DEPARTMENT', 14);

  const anchored = await driver.$(
    `//XCUIElementTypeStaticText[@name="DEPARTMENT" or @label="DEPARTMENT" or @name="Department" or @label="Department"]/following::XCUIElementTypeTextField[1]`
  );
  if (await anchored.isExisting().catch(() => false)) {
    await anchored.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await anchored.click();
    return anchored;
  }

  const fields = await driver.$$('//XCUIElementTypeTextField');
  if (fields.length >= 2) {
    await fields[1].waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await fields[1].click();
    return fields[1];
  }
  throw new Error('Could not find Department typeahead on Filter Members');
}

function parseMemberCountFromPageSource(xml) {
  const matches = [...xml.matchAll(/(\d+)\s+Members?/gi)];
  if (!matches.length) return null;
  const nums = matches.map(m => parseInt(m[1], 10)).filter(n => !Number.isNaN(n));
  if (!nums.length) return null;
  return Math.max(...nums);
}

async function readMemberCount(driver) {
  try {
    const xml = await driver.getPageSource();
    return parseMemberCountFromPageSource(xml);
  } catch {
    return null;
  }
}

/**
 * After audience Save, member count in UI climbs then stops — treat "same max count for STABLE_MEMBER_MS" as done.
 * `perfStart` = performance.now() captured immediately before Save tap.
 * Returns { durationMs, finalCount }.
 */
async function waitForMemberSyncComplete(driver, perfStart) {
  let lastCount = null;
  let stableSince = null;

  while (performance.now() - perfStart < MAX_SYNC_MS) {
    const n = await readMemberCount(driver);
    if (n != null) {
      if (lastCount === n) {
        if (!stableSince) stableSince = performance.now();
        if (performance.now() - stableSince >= STABLE_MEMBER_MS) {
          return { durationMs: Math.round(performance.now() - perfStart), finalCount: n };
        }
      } else {
        lastCount = n;
        stableSince = null;
      }
    }
    await driver.pause(STABLE_POLL_MS);
  }

  throw new Error(
    `Timed out after ${MAX_SYNC_MS}ms waiting for member count to stabilize (last seen: ${String(lastCount)})`
  );
}

async function tapRoomTitle(driver, titleText) {
  const safe = titleText.replace(/"/g, '\\"');
  const titleBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  if (await titleBtn.isExisting().catch(() => false)) {
    await titleBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await titleBtn.click();
    return;
  }
  await tapRadioLoose(driver, titleText, DEFAULT_TIMEOUT);
}

async function openRoomFromList(driver, titleText) {
  await scrollToText(driver, titleText, 12);
  await tapRadioLoose(driver, titleText, DEFAULT_TIMEOUT);
  await driver.pause(600);
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await driver.pause(1000);
  }

  await createPrivateRoom(driver, ROOM_NAME, { skipAddMembersSheet: true, sendStarterMessage: false });
  await driver.pause(600);
  await saveScreenshot(driver, TEST_NAME, '01_add_members_sheet.png');

  for (const person of INVITEES) {
    await addInviteeFromAddMembersSheet(driver, person);
  }
  await saveScreenshot(driver, TEST_NAME, '02_invitees_added.png');

  await tapTopSave(driver);
  await driver.pause(1000);
  await saveScreenshot(driver, TEST_NAME, '03_after_add_members_save.png');

  const alreadyInRoom = await driver.$('~sendMessageButton').isDisplayed().catch(() => false);
  if (!alreadyInRoom) {
    await openRoomFromList(driver, ROOM_NAME);
  }
  await saveScreenshot(driver, TEST_NAME, '04_in_room.png');

  await tapRoomTitle(driver, ROOM_NAME);
  await driver.pause(400);
  await tapByText(driver, 'Members', DEFAULT_TIMEOUT);
  await driver.pause(600);
  await saveScreenshot(driver, TEST_NAME, '05_members.png');

  await tapByText(driver, 'Edit', DEFAULT_TIMEOUT);
  await driver.pause(500);
  await saveScreenshot(driver, TEST_NAME, '06_edit_members.png');

  await scrollToText(driver, 'Add Members by Territory', 12);
  try {
    await tapByText(driver, 'Add Members by Territory, Department, & Title', DEFAULT_TIMEOUT);
  } catch {
    await tapRadioLoose(driver, 'Territory', DEFAULT_TIMEOUT);
  }
  await driver.pause(600);
  await saveScreenshot(driver, TEST_NAME, '07_filter_members_screen.png');

  const deptField = await focusDepartmentTypeaheadOnFilterMembers(driver);
  await driver.pause(300);
  try {
    await deptField.clearValue();
  } catch {}
  await deptField.setValue(DEPARTMENT_FILTER);
  await driver.pause(900);
  await tapSearchResultByText(driver, DEPARTMENT_FILTER, DEFAULT_TIMEOUT);
  await driver.pause(400);

  await tapByText(driver, 'Create Filter', DEFAULT_TIMEOUT);
  await driver.pause(500);
  await saveScreenshot(driver, TEST_NAME, '08_filter_ready.png');

  const perfBeforeAudienceSave = performance.now();
  const wallClockStart = Date.now();
  await tapTopSave(driver);
  console.log('⏱️  Timer started at audience-filter Save (same instant as tap)');

  const { durationMs, finalCount } = await waitForMemberSyncComplete(driver, perfBeforeAudienceSave);
  const wallClockMs = Date.now() - wallClockStart;

  console.log(`✅ Member sync finished. UI-stable window ≈ ${durationMs}ms (perf), wall ≈ ${wallClockMs}ms, final parsed count: ${finalCount}`);
  await saveScreenshot(driver, TEST_NAME, '09_after_sync.png');

  const reportLine = `testTime: member_sync_ms=${durationMs} final_count=${finalCount} room=${ROOM_NAME}\n`;
  const fs = require('fs');
  const reportPath = `${ensureTestArtifactsDir(TEST_NAME)}/timing.txt`;
  fs.writeFileSync(reportPath, reportLine, 'utf8');
  console.log(`Wrote ${reportPath}`);
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
  run().catch(() => process.exit(1));
}
