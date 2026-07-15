const A11Y = Object.freeze({
  mainAppView: 'MainAppView',

  loginView: 'loginView',
  serversButton: 'serversButton',
  loginButton: 'loginButton',

  settingsButton: 'settingsButton',
  logoutButton: 'logoutButton',
  backButton: 'backButton',
  closeButton: 'closeButton',
  closeCorporateDirectoryDrawer: 'closeCorporateDirectoryDrawer',

  roomsSectionHeader: 'Rooms section header',
  peoplePlusButton: 'peoplePlusButton',
  newConversationButton: 'newConversationButton',
  searchInputTextView: 'searchInputTextView',
  conversationSearch: 'conversationSearch',

  createRoomButton: 'createRoomButton',
  plusButton: 'plusButton',
  browseRoomsButton: 'browseRoomsButton',
  roomNameText: 'roomNameText',
  openRoomSettingsButton: 'openRoomSettingsButton',
  chatSearchButton: 'chatSearchButton',

  markAsUnreadButton: 'markAsUnreadButton',
  favoritesButton: 'favoritesButton',

  pinnedMessagesButton: 'pinnedMessagesButton',
  closePinnedMessagesDrawer: 'closePinnedMessagesDrawer',

  setRoomName: 'setRoomName',
  setTopic: 'setTopic',
  notificationPreferencesButton: 'notificationPreferencesButton',
  membersButton: 'membersButton',
  navItemAbout: 'navItemAbout',
  navItemMembers: 'navItemMembers',
  saveButton: 'saveButton',

  searchUsersTextField: 'searchUsersTextField',

  roomComposerPullHandle: 'roomComposerPullHandle',
  roomComposerTextView: 'roomComposerTextView',
  messageComposerTextView: 'messageComposerTextView',
  cancelEditMessageButton: 'cancelEditMessageButton',
  saveEditMessageButton: 'saveEditMessageButton',
  sendMessageButton: 'sendMessageButton',
  messageActionsMore: 'messageActionsMore',

  shareOptionsButton: 'shareOptionsButton',
  sendGif: 'Send GIF',
});

function byId(id) {
  return `~${id}`;
}

const SELECTORS = Object.freeze(
  Object.fromEntries(Object.entries(A11Y).map(([key, id]) => [key, byId(id)]))
);

const PREDICATES = Object.freeze({
  roomsHeaderButton:
    '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS "Rooms"',
});

module.exports = {
  A11Y,
  SELECTORS,
  PREDICATES,
  byId,
};
