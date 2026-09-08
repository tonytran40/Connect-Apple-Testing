require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  ensureRoomsSectionReady,
  runWithOptionalDriver,
} = require('../utils/testSession');
const {
  buildUniqueRoomName,
  longPressElement,
  readClipboardText,
} = require('../utils/conversationFeatureFlows');
const { SELECTORS } = require('../utils/selectors');
const {
  escapePredicateString,
  getElementRect,
  openRoomsPlusMenu,
  tapByText,
} = require('../utils/uiActions');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'BrowseRooms';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.BROWSE_ROOMS_TIMEOUT_MS, 10) || 20000;
const DEFAULT_INVITEE = process.env.BROWSE_ROOMS_INVITEE || 'Jonathan Levy';
const DEFAULT_INVITEE_SEARCH = process.env.BROWSE_ROOMS_INVITEE_SEARCH || 'Levy';
const DEFAULT_CURRENT_USER = process.env.BROWSE_ROOMS_CURRENT_USER || 'Tony Tran';
const SEARCH_RESULTS_PAUSE_MS =
  Number.parseInt(process.env.BROWSE_ROOMS_USER_SEARCH_PAUSE_MS, 10) || 800;
const SEARCH_FIELD_SELECTOR = '-ios predicate string:type == "XCUIElementTypeTextField"';
const EDIT_MEMBERS_SELECTOR =
  '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
  'type == "XCUIElementTypeStaticText") AND ' +
  '(name == "Edit" OR label == "Edit" OR ' +
  'name == "Edit Members" OR label == "Edit Members")';
const NITRO_ROOM_LINK_PREFIX = 'https://connect.powerhrg.com/room/';

function qaOnlyBlockedError(testName, serverName) {
  const configured = String(serverName || '').trim() || '(not set)';
  const error = new Error(
    `BLOCKED: ${testName} is QA-only. ` +
    `CONNECT_SERVER_NAME must identify QA; received "${configured}".`
  );
  error.name = 'QaOnlyBlockedError';
  error.code = 'BLOCKED_QA_ONLY';
  error.status = 'BLOCKED';
  return error;
}

function isQaServerName(serverName) {
  return String(serverName || '')
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes('qa');
}

function requireQaServer(env = process.env, testName = TEST_NAME) {
  if (!isQaServerName(env.CONNECT_SERVER_NAME)) {
    throw qaOnlyBlockedError(testName, env.CONNECT_SERVER_NAME);
  }
  return String(env.CONNECT_SERVER_NAME).trim();
}

function compactRoomBrowserCapabilities() {
  return {
    copyLink: true,
    sortingDirection: false,
    sortingLimitation:
      'The base app hides sortOptionsView when horizontalSizeClassIsCompact is true.',
  };
}

function isExpectedNitroRoomLink(value) {
  return String(value || '').trim().startsWith(NITRO_ROOM_LINK_PREFIX);
}

function exactVisibleTextSelector(text) {
  const safe = escapePredicateString(text);
  return (
    '-ios predicate string:(type == "XCUIElementTypeStaticText" OR ' +
    'type == "XCUIElementTypeButton") AND ' +
    `(name == "${safe}" OR label == "${safe}")`
  );
}

async function isDisplayed(driver, selector) {
  const element = await driver.$(selector);
  return element.isDisplayed().catch(() => false);
}

async function waitForBrowseRoomsReady(driver, timeout = DEFAULT_TIMEOUT) {
  const title = await driver.$(exactVisibleTextSelector('Browse Rooms'));
  await title.waitForDisplayed({ timeout });

  const searchField = await driver.$(SEARCH_FIELD_SELECTOR);
  await searchField.waitForDisplayed({ timeout });
  return searchField;
}

async function tapTopLeadingBack(driver) {
  const windowRect = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.round(windowRect.width * 0.055),
    y: Math.round(windowRect.height * 0.09),
  });
}

async function waitForExactTextHidden(driver, text, timeout = DEFAULT_TIMEOUT) {
  const selector = exactVisibleTextSelector(text);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await isDisplayed(driver, selector))) return;
    await driver.pause(250);
  }
  throw new Error(`Expected "${text}" to disappear within ${timeout}ms`);
}

async function addInviteeFromCreateRoom(
  driver,
  invitee,
  searchTerm = DEFAULT_INVITEE_SEARCH,
  timeout = DEFAULT_TIMEOUT
) {
  const addMembersTitle = await driver.$(exactVisibleTextSelector('Add Members'));
  await addMembersTitle.waitForDisplayed({ timeout });

  const field = await driver.$(
    '//XCUIElementTypeStaticText[@name="Add Individuals" or @label="Add Individuals"]' +
    '/following::XCUIElementTypeTextField[1]'
  );
  await field.waitForDisplayed({ timeout });
  await field.click();
  await field.clearValue().catch(() => {});
  for (const character of searchTerm) {
    const activeField = await driver.$(
      '//XCUIElementTypeStaticText[@name="Add Individuals" or @label="Add Individuals"]' +
      '/following::XCUIElementTypeTextField[1]'
    );
    await activeField.addValue(character);
    await driver.pause(120);
  }
  await driver.waitUntil(async () => {
    const activeField = await driver.$(
      '//XCUIElementTypeStaticText[@name="Add Individuals" or @label="Add Individuals"]' +
      '/following::XCUIElementTypeTextField[1]'
    );
    const value = String((await activeField.getAttribute('value').catch(() => '')) || '').trim();
    return value === searchTerm;
  }, {
    timeout,
    interval: 200,
    timeoutMsg: `Add Members search field did not contain "${searchTerm}"`,
  });
  await driver.pause(SEARCH_RESULTS_PAUSE_MS);

  await tapByText(driver, invitee, timeout);
  await driver.waitUntil(async () => {
    const value = String((await field.getAttribute('value').catch(() => '')) || '').trim();
    return value === '' || value === 'Select';
  }, {
    timeout,
    interval: 250,
    timeoutMsg: `Add Members did not select "${invitee}"`,
  });

  await tapByText(driver, 'Save', timeout);
}

async function openRoomSettings(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const roomSettings = await driver.$(SELECTORS.openRoomSettingsButton);
  if (await roomSettings.isDisplayed().catch(() => false)) {
    await roomSettings.click();
    return;
  }

  const safeRoomName = escapePredicateString(roomName);
  const titleButton = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
    `(name CONTAINS "${safeRoomName}" OR label CONTAINS "${safeRoomName}")`
  );
  await titleButton.waitForDisplayed({ timeout });
  await titleButton.click();
}

async function openMembers(driver, roomName, invitee, timeout = DEFAULT_TIMEOUT) {
  await openRoomSettings(driver, roomName, timeout);

  const membersButton = await driver.$(SELECTORS.membersButton);
  await membersButton.waitForDisplayed({ timeout });
  await membersButton.click();

  const inviteeRow = await driver.$(exactVisibleTextSelector(invitee));
  await inviteeRow.waitForDisplayed({ timeout });
  return inviteeRow;
}

async function findMemberActionButton(driver, memberName, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  const safeMemberName = escapePredicateString(memberName);

  while (Date.now() < deadline) {
    const memberRowButton = await driver.$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
      `(name BEGINSWITH "${safeMemberName}," OR label BEGINSWITH "${safeMemberName},")`
    );
    if (await memberRowButton.isDisplayed().catch(() => false)) {
      const rowRect = await getElementRect(memberRowButton);
      return {
        click: () => driver.execute('mobile: tap', {
          // The nested SwiftUI Menu is collapsed into the row's accessibility
          // element, so tap the visible three-dot control at the trailing edge.
          x: Math.round(rowRect.x + rowRect.width - 12),
          y: Math.round(rowRect.y + rowRect.height / 2),
        }),
      };
    }

    const member = await driver.$(exactVisibleTextSelector(memberName));
    if (await member.isDisplayed().catch(() => false)) {
      const memberRect = await getElementRect(member).catch(() => null);
      const windowRect = await driver.getWindowRect();
      if (memberRect) {
        const memberCenterY = memberRect.y + memberRect.height / 2;
        const candidates = [];
        for (const button of await driver.$$('//XCUIElementTypeButton')) {
          if (!(await button.isDisplayed().catch(() => false))) continue;
          const rect = await getElementRect(button).catch(() => null);
          if (!rect) continue;
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          if (
            centerX >= windowRect.width * 0.72 &&
            rect.width <= windowRect.width * 0.28 &&
            Math.abs(centerY - memberCenterY) <= Math.max(30, memberRect.height)
          ) {
            candidates.push({ button, rect });
          }
        }

        candidates.sort((left, right) => right.rect.x - left.rect.x || left.rect.width - right.rect.width);
        if (candidates[0]) return candidates[0].button;
      }
    }
    await driver.pause(250);
  }

  throw new Error(`Could not find the member actions button for "${memberName}"`);
}

async function promoteMemberToAdmin(driver, memberName, timeout = DEFAULT_TIMEOUT) {
  const actionsButton = await findMemberActionButton(driver, memberName, timeout);
  await actionsButton.click();
  await tapByText(driver, 'Make admin', timeout);

  await driver.pause(1000);
  const refreshedActionsButton = await findMemberActionButton(driver, memberName, timeout);
  await refreshedActionsButton.click();
  const removeAdmin = await driver.$(exactVisibleTextSelector('Remove as admin'));
  await removeAdmin.waitForDisplayed({ timeout });
}

async function removeMemberAsAdmin(driver, memberName, timeout = DEFAULT_TIMEOUT) {
  const editMembers = await driver.$(EDIT_MEMBERS_SELECTOR);
  await editMembers.waitForDisplayed({ timeout });

  const actionsButton = await findMemberActionButton(driver, memberName, timeout);
  await actionsButton.click();
  await tapByText(driver, 'Remove as admin', timeout);

  await driver.waitUntil(async () => !(await isDisplayed(driver, EDIT_MEMBERS_SELECTOR)), {
    timeout,
    interval: 250,
    timeoutMsg: `Edit Members remained visible after removing admin access from "${memberName}"`,
  });
}

async function dismissMemberMenu(driver) {
  const windowRect = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.round(windowRect.width * 0.12),
    y: Math.round(windowRect.height * 0.22),
  });
}

async function leaveMembersScreen(driver, timeout = DEFAULT_TIMEOUT) {
  // The members toolbar is rebuilt when the current user loses admin access.
  // This view's custom chevron has no identifier, so align the tap with its
  // dynamic "Members (n)" toolbar title instead of using a fixed screen row.
  await driver.pause(750);
  const membersTitle = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND ' +
    '(name == "Members" OR label == "Members" OR ' +
    'name BEGINSWITH "Members (" OR label BEGINSWITH "Members (")'
  );
  await membersTitle.waitForDisplayed({ timeout });
  const titleRect = await getElementRect(membersTitle);
  const windowRect = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.round(windowRect.width * 0.055),
    y: Math.round(titleRect.y + titleRect.height / 2),
  });
}

async function leaveRoomFromSettings(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  await leaveMembersScreen(driver, timeout);
  const leaveRoom = await driver.$(exactVisibleTextSelector('Leave Room'));
  await leaveRoom.waitForDisplayed({ timeout });
  console.log('BrowseRooms: returned to Room Settings; tapping Leave Room');
  await tapByText(driver, 'Leave Room', timeout);

  await driver.waitUntil(async () => {
    const leaveStillVisible = await isDisplayed(driver, exactVisibleTextSelector('Leave Room'));
    const listVisible =
      (await isDisplayed(driver, SELECTORS.settingsButton)) ||
      (await isDisplayed(driver, SELECTORS.newConversationButton)) ||
      (await isDisplayed(driver, SELECTORS.peoplePlusButton));
    return !leaveStillVisible && listVisible;
  }, {
    timeout,
    interval: 250,
    timeoutMsg: `Leaving "${roomName}" did not return to the conversation list`,
  });
}

async function openBrowseRooms(driver, timeout = DEFAULT_TIMEOUT) {
  await openRoomsPlusMenu(driver, timeout);

  const browseRoomsButton = await driver.$(SELECTORS.browseRoomsButton);
  if (await browseRoomsButton.isDisplayed().catch(() => false)) {
    await browseRoomsButton.click();
  } else {
    await tapByText(driver, 'Browse Rooms', timeout);
  }

  return waitForBrowseRoomsReady(driver, timeout);
}

async function verifySortingDirectionIfExposed(driver, timeout = DEFAULT_TIMEOUT) {
  const ascending = await driver.$(exactVisibleTextSelector('A-Z'));
  const descending = await driver.$(exactVisibleTextSelector('Z-A'));
  const ascendingVisible = await ascending.isDisplayed().catch(() => false);
  const descendingVisible = await descending.isDisplayed().catch(() => false);

  if (!ascendingVisible && !descendingVisible) {
    const { sortingLimitation } = compactRoomBrowserCapabilities();
    console.log(`BrowseRooms: sorting direction not checked on compact iOS. ${sortingLimitation}`);
    return { checked: false, reason: sortingLimitation };
  }

  const initialLabel = ascendingVisible ? 'A-Z' : 'Z-A';
  const toggledLabel = initialLabel === 'A-Z' ? 'Z-A' : 'A-Z';
  await tapByText(driver, initialLabel, timeout);
  const toggled = await driver.$(exactVisibleTextSelector(toggledLabel));
  await toggled.waitForDisplayed({ timeout });
  await tapByText(driver, toggledLabel, timeout);
  const restored = await driver.$(exactVisibleTextSelector(initialLabel));
  await restored.waitForDisplayed({ timeout });
  return { checked: true, initialLabel, toggledLabel };
}

async function verifyCompactCopyLink(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const roomResult = await waitForRoomResult(driver, roomName, timeout);
  await longPressElement(driver, roomResult);

  const copyLink = await driver.$(exactVisibleTextSelector('Copy Link'));
  await copyLink.waitForDisplayed({
    timeout,
    timeoutMsg:
      `Browse Rooms did not expose the source-backed Copy Link context action for "${roomName}"`,
  });
  await saveScreenshot(driver, TEST_NAME, '07a_copy_link_context_menu.png');
  await tapByText(driver, 'Copy Link', timeout);

  const deadline = Date.now() + timeout;
  let lastClipboardText = '';
  while (Date.now() < deadline) {
    const clipboard = await readClipboardText(driver);
    if (!clipboard.available) {
      throw new Error(
        `Copy Link was tapped for "${roomName}", but Appium could not verify the clipboard: ` +
        clipboard.reason
      );
    }
    lastClipboardText = clipboard.text;
    if (isExpectedNitroRoomLink(lastClipboardText)) return lastClipboardText.trim();
    await driver.pause(200);
  }

  throw new Error(
    `Copy Link did not place a Nitro room URL on the clipboard. ` +
    `Expected prefix "${NITRO_ROOM_LINK_PREFIX}"; received "${lastClipboardText}".`
  );
}

async function setSearchTerm(driver, term, timeout = DEFAULT_TIMEOUT) {
  const searchField = await driver.$(SEARCH_FIELD_SELECTOR);
  await searchField.waitForDisplayed({ timeout });
  await searchField.click();
  await searchField.clearValue().catch(() => searchField.setValue(''));
  if (term) await searchField.setValue(term);

  await driver.waitUntil(async () => {
    const activeField = await driver.$(SEARCH_FIELD_SELECTOR);
    const value = String((await activeField.getAttribute('value').catch(() => '')) || '');
    return value === term;
  }, {
    timeout,
    interval: 200,
    timeoutMsg: `Browse Rooms search field did not contain "${term}"`,
  });
  return searchField;
}

async function waitForRoomResult(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const result = await driver.$(exactVisibleTextSelector(roomName));
  await result.waitForDisplayed({ timeout });
  return result;
}

async function waitForRoomResultHidden(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const selector = exactVisibleTextSelector(roomName);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (!(await isDisplayed(driver, selector))) return;
    await driver.pause(200);
  }

  throw new Error(`Browse Rooms result "${roomName}" remained visible after filtering`);
}

async function waitForSelectedRoom(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const browserTitle = exactVisibleTextSelector('Browse Rooms');
  const roomTitle = exactVisibleTextSelector(roomName);
  const peekingFooter =
    '-ios predicate string:(type == "XCUIElementTypeStaticText" OR ' +
    'type == "XCUIElementTypeButton") AND ' +
    '(name ==[c] "You are viewing this room" OR label ==[c] "You are viewing this room")';
  const joinButton = exactVisibleTextSelector('Join');
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const leftBrowser = !(await isDisplayed(driver, browserTitle));
    const titleVisible = await isDisplayed(driver, roomTitle);
    const composerVisible = await isDisplayed(driver, SELECTORS.roomComposerTextView);
    const peekingVisible = await isDisplayed(driver, peekingFooter);
    const joinVisible = await isDisplayed(driver, joinButton);
    if (leftBrowser && titleVisible && (composerVisible || peekingVisible || joinVisible)) return;
    await driver.pause(250);
  }

  throw new Error(`Browse Rooms did not open "${roomName}" within ${timeout}ms`);
}

async function waitForJoinedRoom(driver, timeout = DEFAULT_TIMEOUT) {
  const composer = await driver.$(SELECTORS.roomComposerTextView);
  await composer.waitForDisplayed({ timeout });
  await waitForExactTextHidden(driver, 'You are viewing this room', timeout);
}

async function runTest(driver, options = {}) {
  requireQaServer(options.env || process.env);
  if (!options.skipLogin) await ensureLoggedIn(driver);
  await ensureRoomsSectionReady(driver);

  const configuredRoom = process.env.BROWSE_ROOMS_TARGET_ROOM;
  const roomName = configuredRoom || buildUniqueRoomName('Browse-Room');
  let roomCreationMs = 0;

  if (!configuredRoom) {
    const creation = await createPublicRoom(driver, roomName, { skipAddMembersSheet: true });
    roomCreationMs = creation.roomCreationMs;

    await addInviteeFromCreateRoom(driver, DEFAULT_INVITEE, DEFAULT_INVITEE_SEARCH);
    await waitForSelectedRoom(driver, roomName);
    await saveScreenshot(driver, TEST_NAME, '01_room_created_with_invitee.png');

    await openMembers(driver, roomName, DEFAULT_INVITEE);
    await saveScreenshot(driver, TEST_NAME, '02_invitee_in_members.png');
    await promoteMemberToAdmin(driver, DEFAULT_INVITEE);
    await saveScreenshot(driver, TEST_NAME, '03_invitee_verified_as_admin.png');
    await dismissMemberMenu(driver);

    await removeMemberAsAdmin(driver, DEFAULT_CURRENT_USER);
    await saveScreenshot(driver, TEST_NAME, '04_admin_ownership_transferred.png');

    await leaveRoomFromSettings(driver, roomName);
    await saveScreenshot(driver, TEST_NAME, '05_room_left.png');
    await ensureRoomsSectionReady(driver);
  }

  await openBrowseRooms(driver);
  await saveScreenshot(driver, TEST_NAME, '06_browse_rooms_open.png');
  const sorting = await verifySortingDirectionIfExposed(driver);

  await setSearchTerm(driver, roomName);
  await waitForRoomResult(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '07_room_search_result.png');
  const copiedRoomLink = await verifyCompactCopyLink(driver, roomName);

  if (!configuredRoom) {
    await waitForExactTextHidden(driver, 'Joined');
    await saveScreenshot(driver, TEST_NAME, '08_room_not_joined.png');
  }

  const roomResult = await waitForRoomResult(driver, roomName);
  await roomResult.click();
  await waitForSelectedRoom(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '09_room_opened_from_browser.png');

  if (!configuredRoom) {
    const joinButton = await driver.$(exactVisibleTextSelector('Join'));
    await joinButton.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
    await tapByText(driver, 'Join', DEFAULT_TIMEOUT);
    await waitForJoinedRoom(driver);
    await saveScreenshot(driver, TEST_NAME, '10_room_rejoined.png');
  }

  await tapTopLeadingBack(driver);
  await waitForBrowseRoomsReady(driver);
  await waitForRoomResult(driver, roomName);
  if (!configuredRoom) {
    const joined = await driver.$(exactVisibleTextSelector('Joined'));
    await joined.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  }
  await saveScreenshot(driver, TEST_NAME, '11_returned_to_filtered_browser.png');

  const noMatchTerm = `No-Matching-Room-${Date.now().toString(36)}`;
  await setSearchTerm(driver, noMatchTerm);
  await waitForRoomResultHidden(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '12_no_matching_rooms.png');

  await setSearchTerm(driver, roomName);
  await waitForRoomResult(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '13_room_search_restored.png');

  await tapTopLeadingBack(driver);
  await ensureRoomsSectionReady(driver);
  await saveScreenshot(driver, TEST_NAME, '14_returned_to_conversation_list.png');

  return {
    timings: { roomCreationMs },
    qaOnly: true,
    roomName,
    copiedRoomLink,
    sorting,
  };
}

async function run(driver, options = {}) {
  requireQaServer(options.env || process.env);
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = {
  NITRO_ROOM_LINK_PREFIX,
  SEARCH_FIELD_SELECTOR,
  EDIT_MEMBERS_SELECTOR,
  addInviteeFromCreateRoom,
  compactRoomBrowserCapabilities,
  dismissMemberMenu,
  exactVisibleTextSelector,
  findMemberActionButton,
  isExpectedNitroRoomLink,
  isQaServerName,
  leaveMembersScreen,
  leaveRoomFromSettings,
  openBrowseRooms,
  promoteMemberToAdmin,
  qaOnlyBlockedError,
  requireQaServer,
  removeMemberAsAdmin,
  run,
  runTest,
  setSearchTerm,
  tapTopLeadingBack,
  verifyCompactCopyLink,
  verifySortingDirectionIfExposed,
  waitForBrowseRoomsReady,
  waitForRoomResult,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
