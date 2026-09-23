const test = require('node:test');
const assert = require('node:assert/strict');

const {
  firstVisible,
  visibleButtonSelector,
  visibleTextSelector,
  waitForVisibleButton,
  waitForVisibleText,
} = require('../utils/qaNavigation');

function pollingDriver(elementsBySelector = new Map()) {
  return {
    async $$(selector) {
      return elementsBySelector.get(selector) || [];
    },
    async waitUntil(predicate, options = {}) {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (await predicate()) return true;
      }
      throw new Error(options.timeoutMsg || 'waitUntil timed out');
    },
  };
}

test('QA navigation builds escaped exact and contains text selectors', () => {
  const exact = visibleTextSelector('A "quoted" \\ value');
  const contains = visibleTextSelector('A "quoted" \\ value', false);

  assert.match(exact, /name == "A \\"quoted\\" \\\\ value"/);
  assert.match(contains, /label CONTAINS "A \\"quoted\\" \\\\ value"/);
});

test('QA navigation restricts button selectors to tappable elements', () => {
  const selector = visibleButtonSelector('JONATHAN LEVY', false);

  assert.match(selector, /type == "XCUIElementTypeButton"/);
  assert.match(selector, /name CONTAINS "JONATHAN LEVY"/);
  assert.doesNotMatch(selector, /XCUIElementTypeStaticText/);
});

test('firstVisible safely skips stale and hidden elements', async () => {
  const visible = { isDisplayed: async () => true };
  const driver = pollingDriver(new Map([[
    'selector',
    [
      { isDisplayed: async () => { throw new Error('stale element'); } },
      { isDisplayed: async () => false },
      visible,
    ],
  ]]));

  assert.equal(await firstVisible(driver, 'selector'), visible);
});

test('visible text and button waits return the matching displayed element', async () => {
  const textSelector = visibleTextSelector('Automate test 1');
  const buttonSelector = visibleButtonSelector('CORPORATE AUTOMATE ROOM');
  const text = { isDisplayed: async () => true };
  const button = { isDisplayed: async () => true };
  const driver = pollingDriver(new Map([
    [textSelector, [text]],
    [buttonSelector, [button]],
  ]));

  assert.equal(await waitForVisibleText(driver, 'Automate test 1'), text);
  assert.equal(await waitForVisibleButton(driver, 'CORPORATE AUTOMATE ROOM'), button);
});

test('visible waits preserve scenario-specific timeout diagnostics', async () => {
  const driver = pollingDriver();

  await assert.rejects(
    waitForVisibleText(driver, 'Missing fixture', {
      timeoutMsg: 'Corporate Events fixture was missing',
    }),
    /Corporate Events fixture was missing/
  );
});
