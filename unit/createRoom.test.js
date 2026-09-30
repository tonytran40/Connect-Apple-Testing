const test = require('node:test');
const assert = require('node:assert/strict');

const { completeRoomCreationTransition } = require('../Tests/CreateRoom');
const { SELECTORS } = require('../utils/selectors');

function testDriver({ roomInitiallyOpen, skipInitiallyVisible }) {
  let roomOpen = roomInitiallyOpen;
  let skipVisible = skipInitiallyVisible;
  let skipClicks = 0;
  const visible = () => ({
    waitForDisplayed: async () => {},
    isDisplayed: async () => true,
  });
  const hidden = () => ({
    waitForDisplayed: async () => { throw new Error('not displayed'); },
    isDisplayed: async () => false,
  });

  return {
    driver: {
      $: async selector => {
        if (selector.includes('Skip for now')) {
          return {
            isDisplayed: async () => skipVisible,
            click: async () => {
              skipClicks++;
              skipVisible = false;
              roomOpen = true;
            },
          };
        }
        if (selector === SELECTORS.openRoomSettingsButton) return roomOpen ? visible() : hidden();
        if (selector.includes('Room Under Test')) return roomOpen ? visible() : hidden();
        throw new Error(`Unexpected selector: ${selector}`);
      },
      waitUntil: async (condition, options = {}) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (await condition()) return true;
        }
        throw new Error(options.timeoutMsg || 'waitUntil timed out');
      },
    },
    skipClicks: () => skipClicks,
  };
}

test('room creation accepts the room opening without an Add Members sheet', async () => {
  const state = testDriver({ roomInitiallyOpen: true, skipInitiallyVisible: false });

  await completeRoomCreationTransition(state.driver, 'Room Under Test');

  assert.equal(state.skipClicks(), 0);
});

test('room creation skips Add Members when the optional sheet appears', async () => {
  const state = testDriver({ roomInitiallyOpen: false, skipInitiallyVisible: true });

  await completeRoomCreationTransition(state.driver, 'Room Under Test');

  assert.equal(state.skipClicks(), 1);
});
