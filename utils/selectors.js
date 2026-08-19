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
  conversationSearchField: 'conversationSearchField',
  // Compatibility alias for callers that used the old key before the source ID was corrected.
  conversationSearch: 'conversationSearchField',
  bookmarksScrollView: 'bookmarksScrollView',

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

// Conversation-view reaction chips should expose `messageReaction-<emoji>` from SwiftUI.
function reactionChip(emoji) {
  return byId(`messageReaction-${emoji}`);
}

const SELECTORS = Object.freeze(
  Object.fromEntries(Object.entries(A11Y).map(([key, id]) => [key, byId(id)]))
);

const PREDICATES = Object.freeze({
  roomsHeaderButton:
    '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS "Rooms"',
});

const SELECTOR_METADATA = Object.freeze({
  conversationSearchField: Object.freeze({
    source: 'exact',
    platforms: Object.freeze(['macOS']),
    note: 'The app currently renders conversation search only on macOS.',
  }),
  conversationSearch: Object.freeze({
    source: 'alias',
    aliasFor: 'conversationSearchField',
    note: 'Legacy selector key retained for existing consumers.',
  }),
  roomsSectionHeader: Object.freeze({
    source: 'dynamic',
    pattern: '<section label> section header',
    note: 'SwiftUI builds this identifier from the visible disclosure-group label.',
  }),
  roomComposerPullHandle: Object.freeze({
    source: 'exact',
    platforms: Object.freeze(['iOS']),
  }),
  messageComposerTextView: Object.freeze({
    source: 'platform',
    platforms: Object.freeze(['legacy iOS builds']),
    note: 'Compatibility fallback; current app source uses roomComposerTextView.',
  }),
  messageActionsMore: Object.freeze({
    source: 'exact',
    platforms: Object.freeze(['macOS']),
  }),
  roomsHeaderButton: Object.freeze({
    source: 'text',
    selectorSet: 'PREDICATES',
    note: 'Fallback for the SwiftUI-generated Rooms disclosure header.',
  }),
  reactionChip: Object.freeze({
    source: 'dynamic',
    selectorFactory: 'reactionChip',
    pattern: 'messageReaction-<emoji>',
    note: 'Reaction identifiers include the runtime emoji value.',
  }),
});

module.exports = {
  A11Y,
  SELECTORS,
  PREDICATES,
  SELECTOR_METADATA,
  byId,
  reactionChip,
};
