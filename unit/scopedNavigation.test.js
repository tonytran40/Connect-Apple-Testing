const test = require('node:test');
const assert = require('node:assert/strict');

const { PREDICATES, SELECTORS } = require('../utils/selectors');
const {
  ensureRoomsSectionReady,
  clipRectToViewport,
  resetToHome,
  scopedSwipeCoordinates,
  scrollUntilConversationEntryVisible,
  swipeConversationList,
  waitForConversationRow,
} = require('../utils/testSession');

function actionCoordinates(actions) {
  return actions[0].actions.filter(action => action.type === 'pointerMove');
}

function visibleElement(extra = {}) {
  return {
    isDisplayed: async () => true,
    waitForDisplayed: async () => {},
    ...extra,
  };
}

test('scopedSwipeCoordinates keeps both endpoints inside the container rect', () => {
  const rect = { x: 10, y: 20, width: 200, height: 400 };

  assert.deepEqual(scopedSwipeCoordinates(rect, 'up'), {
    x: 110,
    startY: 320,
    endY: 120,
  });
  assert.deepEqual(scopedSwipeCoordinates(rect, 'down'), {
    x: 110,
    startY: 120,
    endY: 320,
  });
  assert.equal(scopedSwipeCoordinates({ x: 0, y: 0, width: 100, height: 20 }, 'up'), null);
  assert.equal(scopedSwipeCoordinates({ x: null, y: 0, width: 100, height: 200 }, 'up'), null);
});

test('clipRectToViewport keeps lazy-list gestures inside the visible screen', () => {
  assert.deepEqual(
    clipRectToViewport(
      { x: 0, y: -800, width: 300, height: 2400 },
      { x: 0, y: 0, width: 300, height: 600 }
    ),
    { x: 0, y: 0, width: 300, height: 600 }
  );
});

test('swipeConversationList performs the gesture inside bookmarksScrollView', async () => {
  const rect = { x: 30, y: 100, width: 240, height: 500 };
  let requestedSelector;
  let performed;
  const driver = {
    $: async selector => {
      requestedSelector = selector;
      return visibleElement({ getRect: async () => rect });
    },
    getWindowRect: async () => ({ x: 0, y: 0, width: 300, height: 700 }),
    performActions: async actions => {
      performed = actions;
    },
    releaseActions: async () => {},
  };

  assert.equal(await swipeConversationList(driver, 'up'), true);
  assert.equal(requestedSelector, SELECTORS.bookmarksScrollView);
  assert.equal(performed[0].id, 'conversationListSwipe');
  for (const point of actionCoordinates(performed)) {
    assert.ok(point.x > rect.x && point.x < rect.x + rect.width);
    assert.ok(point.y > rect.y && point.y < rect.y + rect.height);
  }
});

test('resetToHome rejects an in-room Rooms back button and taps Back', async () => {
  let returnedToList = false;
  let backClicks = 0;
  const hidden = {
    isDisplayed: async () => false,
    waitForDisplayed: async () => {
      throw new Error('not displayed');
    },
    isExisting: async () => false,
  };
  const driver = {
    $: async selector => {
      if (selector === PREDICATES.roomsHeaderButton) {
        return visibleElement({
          getLocation: async () => ({ x: 10, y: returnedToList ? 140 : 40 }),
        });
      }
      if (selector === SELECTORS.backButton) {
        return visibleElement({
          isExisting: async () => true,
          click: async () => {
            backClicks++;
            returnedToList = true;
          },
        });
      }
      return hidden;
    },
    pause: async () => {},
  };

  assert.equal(await resetToHome(driver, 2), true);
  assert.equal(backClicks, 1);
});

test('swipeConversationList falls back to the existing viewport gesture when unavailable', async () => {
  let performed;
  const driver = {
    $: async () => ({ isDisplayed: async () => false }),
    getWindowRect: async () => ({ width: 300, height: 600 }),
    performActions: async actions => {
      performed = actions;
    },
    releaseActions: async () => {},
  };

  assert.equal(await swipeConversationList(driver, 'up'), false);
  assert.equal(performed[0].id, 'finger1');
  assert.deepEqual(actionCoordinates(performed).map(({ x, y }) => ({ x, y })), [
    { x: 150, y: 450 },
    { x: 150, y: 210 },
  ]);
});

test('visible conversation rows return before looking up the scroll container', async () => {
  const requestedSelectors = [];
  const row = visibleElement({
    getAttribute: async name => (name === 'name' ? 'A-Room' : ''),
  });
  const driver = {
    $: async selector => {
      requestedSelectors.push(selector);
      if (selector.includes('Lost connection')) {
        return { isDisplayed: async () => false };
      }
      return row;
    },
  };

  const result = await waitForConversationRow(driver, 'A-Room', { timeout: 100, maxScrolls: 1 });

  assert.equal(result.el, row);
  assert.equal(result.roomTitle, 'A-Room');
  assert.equal(requestedSelectors.length, 2);
  assert.equal(requestedSelectors.some(selector => selector === SELECTORS.bookmarksScrollView), false);
});

test('conversation entry lookup uses a scoped upward list gesture', async () => {
  let peopleChecks = 0;
  let performed;
  const driver = {
    $: async selector => {
      if (selector === SELECTORS.peoplePlusButton) {
        return { isDisplayed: async () => ++peopleChecks > 1 };
      }
      if (selector === SELECTORS.newConversationButton) {
        return { isDisplayed: async () => false };
      }
      if (selector === SELECTORS.bookmarksScrollView) {
        return visibleElement({
          getRect: async () => ({ x: 0, y: 100, width: 300, height: 400 }),
        });
      }
      throw new Error(`Unexpected selector: ${selector}`);
    },
    performActions: async actions => {
      performed = actions;
    },
    getWindowRect: async () => ({ x: 0, y: 0, width: 300, height: 700 }),
    releaseActions: async () => {},
    pause: async () => {},
  };

  await scrollUntilConversationEntryVisible(driver, { maxScrolls: 2, pauseMs: 0 });

  const [start, end] = actionCoordinates(performed);
  assert.equal(performed[0].id, 'conversationListSwipe');
  assert.ok(start.y > end.y);
});

test('room-section readiness pulls down inside the scoped list', async () => {
  let headerLocationChecks = 0;
  let performed;
  const hidden = {
    isDisplayed: async () => false,
    isExisting: async () => false,
    waitForDisplayed: async () => {
      throw new Error('not displayed');
    },
  };
  const header = visibleElement({
    getLocation: async () => ({ y: ++headerLocationChecks > 1 ? 150 : 50 }),
  });
  const driver = {
    $: async selector => {
      if (selector === SELECTORS.loginView) return hidden;
      if (selector === SELECTORS.peoplePlusButton) return visibleElement();
      if (selector === PREDICATES.roomsHeaderButton) return header;
      if (selector === SELECTORS.bookmarksScrollView) {
        return visibleElement({
          getRect: async () => ({ x: 0, y: 100, width: 300, height: 500 }),
        });
      }
      return hidden;
    },
    performActions: async actions => {
      performed = actions;
    },
    getWindowRect: async () => ({ x: 0, y: 0, width: 300, height: 700 }),
    releaseActions: async () => {},
    pause: async () => {},
  };

  await ensureRoomsSectionReady(driver, 2);

  const [start, end] = actionCoordinates(performed);
  assert.equal(performed[0].id, 'conversationListSwipe');
  assert.ok(start.y < end.y);
});
