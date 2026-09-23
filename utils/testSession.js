// Compatibility facade for existing scenario and runner imports.
const {
  ensureRoomsSectionReady,
  goBack,
  resetToHome,
  runWithOptionalDriver,
} = require('./sessionNavigation');
const { waitForConnectivity } = require('./sessionConnectivity');
const {
  scrollConversationListToTop,
  scrollUntilConversationEntryVisible,
  waitForConversationRow,
} = require('./conversationListNavigation');
const {
  clipRectToViewport,
  scopedSwipeCoordinates,
  swipeConversationList,
} = require('./gestureNavigation');

module.exports = {
  runWithOptionalDriver,
  resetToHome,
  ensureRoomsSectionReady,
  goBack,
  clipRectToViewport,
  scopedSwipeCoordinates,
  scrollConversationListToTop,
  scrollUntilConversationEntryVisible,
  swipeConversationList,
  waitForConnectivity,
  waitForConversationRow,
};
