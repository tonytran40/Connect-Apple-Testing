const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.IOS_PHOTO_PERMISSION_CHECKS;
delete process.env.ATTACHMENT_PHOTO_PERMISSION_CHECKS;

const {
  allowNativePhotoLibraryAlertIfNeeded,
  allowPhotoLibraryPromptIfNeeded,
} = require('../utils/permissions');
const { waitForPhotoPicker } = require('../utils/attachmentPhotoPicker');

test('photo permission remains detectable when the prompt appears after an earlier probe', async () => {
  let promptVisible = false;
  let clicked = false;
  const hidden = { isDisplayed: async () => false };
  const prompt = { isDisplayed: async () => promptVisible && !clicked };
  const allow = {
    isDisplayed: async () => promptVisible && !clicked,
    click: async () => { clicked = true; },
  };
  const driver = {
    $: async selector => {
      if (selector.includes('Allow Full Access')) return allow;
      if (selector.includes('Photo Library')) return prompt;
      return hidden;
    },
    pause: async () => new Promise(resolve => setTimeout(resolve, 1)),
  };

  assert.equal(await allowPhotoLibraryPromptIfNeeded(driver, { timeout: 1 }), false);

  promptVisible = true;
  assert.equal(await allowPhotoLibraryPromptIfNeeded(driver, { timeout: 20 }), true);
  assert.equal(clicked, true);
});

test('photo permission uses the native alert API when the system sheet is outside the app tree', async () => {
  const calls = [];
  const hidden = { isDisplayed: async () => false };
  const driver = {
    $: async () => hidden,
    updateSettings: async settings => calls.push(['settings', settings]),
    execute: async (command, options) => {
      calls.push([command, options]);
      if (options.action === 'getButtons') {
        return ['Limit Access...', 'Allow Full Access', 'Don’t Allow'];
      }
    },
  };

  assert.equal(await allowNativePhotoLibraryAlertIfNeeded(driver), true);
  assert.deepEqual(calls, [
    ['settings', { respectSystemAlerts: true }],
    ['mobile: alert', { action: 'getButtons' }],
    ['mobile: alert', { action: 'accept', buttonLabel: 'Allow Full Access' }],
  ]);
});

test('photo picker readiness accepts iOS 26 labels regardless of element type', async () => {
  const driver = {
    $: async selector => ({
      isExisting: async () => selector.includes('Select up to'),
    }),
    waitUntil: async condition => {
      if (!(await condition())) throw new Error('photo picker was not detected');
    },
  };

  await waitForPhotoPicker(driver, 100);
});
