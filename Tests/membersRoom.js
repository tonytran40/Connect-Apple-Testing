require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');
const { generateRoomName, createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'membersRoom';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.MEMBERS_ROOM_TIMEOUT_MS, 10) || 20000;
const INVITEE = process.env.MEMBERS_ROOM_INVITEE || process.env.RECIPIENT || 'greg.blake';
const SEARCH_AFTER_TYPE_MS =
  Number.parseInt(process.env.MEMBERS_ROOM_SEARCH_PAUSE_MS, 10) || 800;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function containsAnyTextPredicate(text) {
  const safe = esc(text);
  return (
    `(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeButton" OR type == "XCUIElementTypeOther" OR type == "XCUIElementTypeCell") ` +
    `AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}" OR value CONTAINS "${safe}")`
  );
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
    console.log('membersRoom: tapped ~openRoomSettingsButton');
    return;
  }

  const safe = esc(roomName);
  const titleBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  await titleBtn.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await titleBtn.click();
  console.log('membersRoom: tapped conversation header via title fallback');
}

async function tapMembersRow(driver, timeout = DEFAULT_TIMEOUT) {
  const membersBtn = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label CONTAINS "Members" OR name CONTAINS "Members")`
  );
  if (await membersBtn.isExisting().catch(() => false)) {
    await membersBtn.waitForDisplayed({ timeout });
    await membersBtn.click();
    console.log('membersRoom: tapped Members row');
    return;
  }

  const cell = await driver.$(
    `//XCUIElementTypeStaticText[contains(@name,"Members") or contains(@label,"Members")]/ancestor::XCUIElementTypeCell[1]`
  );
  await cell.waitForDisplayed({ timeout });
  await cell.click();
  console.log('membersRoom: tapped Members cell');
}

async function tapByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = esc(text);
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

async function tapNavBarButton(driver, label, timeout = DEFAULT_TIMEOUT) {
  const safe = esc(label);
  const navBtn = await driver.$(
    `//XCUIElementTypeNavigationBar//XCUIElementTypeButton[(@name="${safe}" or @label="${safe}")]`
  );
  if (await navBtn.isExisting().catch(() => false)) {
    await navBtn.waitForDisplayed({ timeout });
    await navBtn.click();
    console.log(`membersRoom: tapped nav bar ${label}`);
    return;
  }
  await tapByText(driver, label, timeout);
  console.log(`membersRoom: tapped ${label}`);
}

/**
 * TypeaheadSingleSelectionThenClear (title: "Add Individuals"):
 * - title → StaticText "Add Individuals"
 * - searchString → XCUIElementTypeTextField (focus via click)
 * - placeholder "Select" → StaticText overlay (not hittable)
 * - showDropdown options → StaticText or Button with username (e.g. "greg.blake")
 */
async function typeInAddIndividualsTypeahead(driver, text, timeout = DEFAULT_TIMEOUT) {
  const fieldSelectors = [
    `//XCUIElementTypeStaticText[@name="Add Individuals" or @label="Add Individuals"]/following::XCUIElementTypeTextField[1]`,
    `//XCUIElementTypeStaticText[contains(@name,"ADD INDIVIDUALS") or contains(@label,"ADD INDIVIDUALS")]/following::XCUIElementTypeTextField[1]`,
  ];

  for (const selector of fieldSelectors) {
    const field = await driver.$(selector);
    if (!(await field.isExisting().catch(() => false))) continue;
    await field.waitForDisplayed({ timeout });
    await field.click();
    await pause(driver, 200);
    try {
      await field.clearValue();
    } catch {}
    await field.setValue(text);
    console.log(`membersRoom: typed "${text}" in Add Individuals TextField`);
    return;
  }

  const fields = await driver.$$('XCUIElementTypeTextField');
  for (const field of fields) {
    if (!(await field.isDisplayed().catch(() => false))) continue;
    const value = ((await field.getAttribute('value').catch(() => '')) || '').trim();
    const placeholder = ((await field.getAttribute('placeholderValue').catch(() => '')) || '').trim();
    if (value === 'Search' || placeholder === 'Search') continue;
    await field.click();
    await pause(driver, 200);
    try {
      await field.clearValue();
    } catch {}
    await field.setValue(text);
    console.log(`membersRoom: typed "${text}" in Add Individuals TextField (fallback)`);
    return;
  }

  throw new Error('membersRoom: could not find Add Individuals TextField');
}

async function waitForAndTapTypeaheadUserOption(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = esc(text);
  const addIndividualsField =
    `//XCUIElementTypeStaticText[@name="Add Individuals" or @label="Add Individuals"]/following::XCUIElementTypeTextField[1]`;
  const selectors = [
    `${addIndividualsField}/following::XCUIElementTypeStaticText[(@name="${safe}" or @label="${safe}")][1]`,
    `${addIndividualsField}/following::XCUIElementTypeStaticText[contains(@name,"${safe}") or contains(@label,"${safe}")][1]`,
    `${addIndividualsField}/following::XCUIElementTypeButton[contains(@name,"${safe}") or contains(@label,"${safe}")][1]`,
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`,
  ];

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const el = await driver.$(selector);
      if (!(await el.isExisting().catch(() => false))) continue;
      if (!(await el.isDisplayed().catch(() => false))) continue;
      const name = ((await el.getAttribute('name').catch(() => '')) || '').slice(0, 100);
      await el.click();
      console.log(`membersRoom: tapped typeahead result "${name}"`);
      return;
    }
    await pause(driver, 400);
  }

  throw new Error(`membersRoom: typeahead result for "${text}" not found`);
}

/** Tap  beside a member name, or the first remove control on the edit screen. */
async function tapRemoveMemberX(driver, memberName, timeout = DEFAULT_TIMEOUT) {
  if (memberName) {
    const q = esc(memberName);
    const xpaths = [
      `//XCUIElementTypeStaticText[contains(@name,"${q}") or contains(@label,"${q}")]/following::XCUIElementTypeButton[@name="" or @label=""][1]`,
      `//XCUIElementTypeStaticText[contains(@name,"${q}") or contains(@label,"${q}")]/preceding::XCUIElementTypeButton[@name="" or @label=""][1]`,
    ];
    for (const xp of xpaths) {
      const btn = await driver.$(xp);
      if (await btn.isExisting().catch(() => false)) {
        await btn.waitForDisplayed({ timeout });
        await btn.click();
        console.log(`membersRoom: tapped  beside "${memberName}"`);
        return;
      }
    }
  }

  const clearBtn = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (label == "" OR name == "")`
  );
  if (!(await clearBtn.isExisting().catch(() => false))) {
    console.log('membersRoom: no remove control — skipping ');
    return;
  }
  if (!(await clearBtn.isDisplayed().catch(() => false))) {
    console.log('membersRoom:  not visible — skipping remove');
    return;
  }
  await clearBtn.click();
  console.log('membersRoom: tapped  remove control');
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const memberToRemove = process.env.MEMBERS_ROOM_REMOVE_MEMBER || '';

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }
  await resetToHome(driver);
  await pause(driver, 450);

  const sortKey = process.env.MEMBERS_ROOM_SORT_KEY || 'M';
  const roomName = generateRoomName('Public', sortKey);
  console.log(`membersRoom: creating "${roomName}"`);

  await createPublicRoom(driver, roomName);
  await pause(driver, 600);
  await waitForInRoom(driver);
  await saveScreenshot(driver, TEST_NAME, '01_in_room.png');

  await tapConversationHeader(driver, roomName);
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '02_edit_modal_open.png');

  await tapMembersRow(driver);
  await pause(driver, 500);
  await saveScreenshot(driver, TEST_NAME, '03_members_screen.png');

  await tapNavBarButton(driver, 'Edit');
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '04_edit_members.png');

  await tapRemoveMemberX(driver, memberToRemove);
  await pause(driver, 300);
  await saveScreenshot(driver, TEST_NAME, '05_after_remove_x.png');

  await typeInAddIndividualsTypeahead(driver, INVITEE);
  await pause(driver, SEARCH_AFTER_TYPE_MS);
  await saveScreenshot(driver, TEST_NAME, '06_after_type_invitee.png');

  await waitForAndTapTypeaheadUserOption(driver, INVITEE);
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '07_after_select_invitee.png');

  await tapNavBarButton(driver, 'Cancel');
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '08_after_cancel.png');
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
