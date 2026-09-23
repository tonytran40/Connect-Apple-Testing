const test = require('node:test');
const assert = require('node:assert/strict');

const { SELECTORS, PREDICATES } = require('../utils/selectors');
const testSession = require('../utils/testSession');
const sessionNavigation = require('../utils/sessionNavigation');
const sessionConnectivity = require('../utils/sessionConnectivity');

function hiddenElement() {
  return {
    isDisplayed: async () => false,
    isExisting: async () => false,
    waitForDisplayed: async () => { throw new Error('not displayed'); },
  };
}

test('testSession remains a compatibility facade with the established exports', () => {
  assert.deepEqual(Object.keys(testSession).sort(), [
    'clipRectToViewport',
    'ensureRoomsSectionReady',
    'goBack',
    'resetToHome',
    'runWithOptionalDriver',
    'scopedSwipeCoordinates',
    'scrollConversationListToTop',
    'scrollUntilConversationEntryVisible',
    'swipeConversationList',
    'waitForConnectivity',
    'waitForConversationRow',
  ]);
  assert.equal(testSession.resetToHome, sessionNavigation.resetToHome);
  assert.equal(testSession.waitForConnectivity, sessionConnectivity.waitForConnectivity);
});

test('resetToHome observes Skip for now disappearing instead of pausing', async () => {
  let skipped = false;
  let pauses = 0;
  const hidden = hiddenElement();
  const peoplePlus = {
    waitForDisplayed: async () => {
      if (!skipped) throw new Error('not displayed');
    },
  };
  const skipForNow = {
    isExisting: async () => true,
    isDisplayed: async () => !skipped,
    click: async () => { skipped = true; },
  };
  const driver = {
    $: async selector => {
      if (selector === SELECTORS.peoplePlusButton) return peoplePlus;
      if (selector.includes('Skip for now')) return skipForNow;
      if (selector === PREDICATES.roomsHeaderButton || selector === SELECTORS.roomsSectionHeader) return hidden;
      return hidden;
    },
    waitUntil: async condition => assert.equal(await condition(), true),
    pause: async () => { pauses++; },
  };

  assert.equal(await testSession.resetToHome(driver, 2), true);
  assert.equal(pauses, 0);
});

test('resetToHome observes the GIF picker disappearing after its gesture', async () => {
  let gifVisible = true;
  let homeVisible = false;
  let pauses = 0;
  const hidden = hiddenElement();
  const gifTab = {
    isExisting: async () => true,
    isDisplayed: async () => gifVisible,
  };
  const driver = {
    $: async selector => {
      if (selector === SELECTORS.peoplePlusButton) {
        return { waitForDisplayed: async () => { if (!homeVisible) throw new Error('not displayed'); } };
      }
      if (selector.includes('All GIFs')) return gifTab;
      if (selector === PREDICATES.roomsHeaderButton || selector === SELECTORS.roomsSectionHeader) return hidden;
      return hidden;
    },
    getWindowRect: async () => ({ width: 300, height: 700 }),
    performActions: async () => { gifVisible = false; homeVisible = true; },
    releaseActions: async () => {},
    waitUntil: async condition => assert.equal(await condition(), true),
    pause: async () => { pauses++; },
  };

  assert.equal(await testSession.resetToHome(driver, 2), true);
  assert.equal(pauses, 0);
});
