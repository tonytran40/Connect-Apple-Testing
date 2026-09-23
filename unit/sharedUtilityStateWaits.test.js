const test = require('node:test');
const assert = require('node:assert/strict');

process.env.IOS_DOCUMENT_PERMISSION_CHECKS = '0';
process.env.IOS_PHOTO_PERMISSION_CHECKS = '0';

const { waitForDocumentPicker } = require('../utils/attachmentFilePicker');
const { waitForPhotoPicker } = require('../utils/attachmentPhotoPicker');
const { findMessageBubble } = require('../utils/conversationFeatureFlows');
const { allowNotificationPromptIfNeeded } = require('../utils/permissions');

function pollingDriver(overrides = {}) {
  return {
    async waitUntil(predicate, options = {}) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (await predicate()) return true;
      }
      throw new Error(options.timeoutMsg || 'waitUntil timed out');
    },
    async pause() {
      throw new Error('fixed pause should not be used');
    },
    ...overrides,
  };
}

test('shared file-picker wait resolves from observable picker state without a fixed pause', async () => {
  let checks = 0;
  const hidden = { isDisplayed: async () => false };
  const driver = pollingDriver({
    $: async () => hidden,
    $$: async () => [{ isDisplayed: async () => ++checks >= 3 }],
  });

  assert.equal(await waitForDocumentPicker(driver, 1000), 'Cancel');
  assert.equal(checks, 3);
});

test('shared photo-picker wait resolves from picker chrome without a fixed pause', async () => {
  let checks = 0;
  const driver = pollingDriver({
    $: async () => ({ isExisting: async () => ++checks >= 2 }),
  });

  await waitForPhotoPicker(driver, 1000);
  assert.equal(checks, 2);
});

test('shared conversation wait returns as soon as the message bubble is visible', async () => {
  let checks = 0;
  const bubble = { isDisplayed: async () => ++checks >= 3 };
  const driver = pollingDriver({ $$: async () => [bubble] });

  assert.equal(await findMessageBubble(driver, 'state marker', 1000), bubble);
  assert.equal(checks, 3);
});

test('notification permission waits for the accepted prompt to disappear', async () => {
  let clicked = false;
  const allowButton = {
    isDisplayed: async () => !clicked,
    click: async () => {
      clicked = true;
    },
  };
  const driver = pollingDriver({ $: async () => allowButton });

  assert.equal(await allowNotificationPromptIfNeeded(driver), true);
  assert.equal(clicked, true);
});
