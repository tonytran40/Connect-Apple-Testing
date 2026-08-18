const test = require('node:test');
const assert = require('node:assert/strict');

const { escapePredicateString, getElementRect, tapByText } = require('../utils/uiActions');

test('escapePredicateString protects quotes and backslashes', () => {
  assert.equal(escapePredicateString('A\\B "Room"'), 'A\\\\B \\"Room\\"');
});

test('getElementRect prefers WebdriverIO getRect', async () => {
  const expected = { x: 1, y: 2, width: 3, height: 4 };
  assert.deepEqual(await getElementRect({ getRect: async () => expected }), expected);
});

test('getElementRect supports older location and size element APIs', async () => {
  const rect = await getElementRect({
    getLocation: async () => ({ x: 5, y: 6 }),
    getSize: async () => ({ width: 7, height: 8 }),
  });
  assert.deepEqual(rect, { x: 5, y: 6, width: 7, height: 8 });
});

test('tapByText falls back to the parent button when the text node is not clickable', async () => {
  let parentClicked = false;
  const primary = {
    waitForDisplayed: async () => {},
    click: async () => {
      throw new Error('not hittable');
    },
  };
  const parent = {
    isExisting: async () => true,
    waitForDisplayed: async () => {},
    click: async () => {
      parentClicked = true;
    },
  };
  const driver = {
    $: async selector => (selector.includes('ancestor::XCUIElementTypeButton') ? parent : primary),
  };

  assert.equal(await tapByText(driver, 'Favorite Room'), parent);
  assert.equal(parentClicked, true);
});
