const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PINNED_MESSAGES_EMPTY_SELECTOR,
  PINNED_MESSAGES_HEADER_SELECTOR,
  PINNED_MESSAGES_STATE_SELECTOR,
  closePinnedSheet,
  openPinnedMessagesPanel,
} = require('../Tests/PinnedMessageEditFlow');
const { SELECTORS } = require('../utils/selectors');

function panelDriver({ compact = true } = {}) {
  let panelOpen = false;
  let toggleClicks = 0;
  let closeClicks = 0;

  function element(selector) {
    const displayed = () => {
      if (selector === SELECTORS.pinnedMessagesButton) return true;
      if (selector === SELECTORS.closePinnedMessagesDrawer) return panelOpen && !compact;
      if (selector === PINNED_MESSAGES_HEADER_SELECTOR) return panelOpen;
      if (selector === PINNED_MESSAGES_STATE_SELECTOR) return false;
      if (selector === SELECTORS.sendMessageButton) return !panelOpen;
      return false;
    };

    return {
      isExisting: async () => displayed(),
      isDisplayed: async () => displayed(),
      waitForDisplayed: async () => {
        if (!displayed()) throw new Error(`${selector} is not displayed`);
      },
      click: async () => {
        if (selector === SELECTORS.pinnedMessagesButton) {
          toggleClicks += 1;
          panelOpen = !panelOpen;
        } else if (selector === SELECTORS.closePinnedMessagesDrawer) {
          closeClicks += 1;
          panelOpen = false;
        }
      },
    };
  }

  return {
    $: async selector => element(selector),
    waitUntil: async condition => {
      if (!(await condition())) throw new Error('condition was not met');
    },
    state: () => ({ closeClicks, panelOpen, toggleClicks }),
  };
}

test('pinned panel detection uses source-backed visible text instead of requiring a close button', () => {
  assert.match(PINNED_MESSAGES_HEADER_SELECTOR, /Pinned Messages/);
  assert.match(PINNED_MESSAGES_STATE_SELECTOR, /Loading pinned messages/);
  assert.match(PINNED_MESSAGES_STATE_SELECTOR, /No pinned messages/);
  assert.match(PINNED_MESSAGES_EMPTY_SELECTOR, /No pinned messages/);
  assert.doesNotMatch(PINNED_MESSAGES_EMPTY_SELECTOR, /Loading pinned messages/);
});

test('compact iOS opens and closes the pinned panel with the persistent pin-button toggle', async () => {
  const driver = panelDriver({ compact: true });

  await openPinnedMessagesPanel(driver);
  assert.deepEqual(driver.state(), { closeClicks: 0, panelOpen: true, toggleClicks: 1 });

  await closePinnedSheet(driver);
  assert.deepEqual(driver.state(), { closeClicks: 0, panelOpen: false, toggleClicks: 2 });
});

test('regular-width pinned panel prefers its source-backed close control', async () => {
  const driver = panelDriver({ compact: false });

  await openPinnedMessagesPanel(driver);
  await closePinnedSheet(driver);

  assert.deepEqual(driver.state(), { closeClicks: 1, panelOpen: false, toggleClicks: 1 });
});
