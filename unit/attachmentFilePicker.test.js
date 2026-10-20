const test = require('node:test');
const assert = require('node:assert/strict');

process.env.IOS_DOCUMENT_PERMISSION_CHECKS = '0';

const {
  documentPickerPath,
  selectConnectDocument,
} = require('../utils/attachmentFilePicker');

function pickerDriver(initialLabels) {
  let visible = new Set(initialLabels);
  const clicks = [];

  function labelFromSelector(selector) {
    const exact = selector.match(/name == "([^"]+)" OR label == "\1"/) ||
      selector.match(/label == "([^"]+)" OR name == "\1"/);
    if (exact) return exact[1];
    const accessibility = selector.match(/^~(.+)$/);
    return accessibility?.[1] || '';
  }

  function element(label) {
    return {
      isDisplayed: async () => visible.has(label),
      isExisting: async () => visible.has(label),
      waitForDisplayed: async () => {
        assert.equal(visible.has(label), true, `${label} should be visible`);
      },
      click: async () => {
        clicks.push(label);
        if (label === 'Browse') visible = new Set(['On My iPhone']);
        if (label === 'On My iPhone') visible = new Set(['Connect iOS']);
        if (label === 'Connect iOS') visible = new Set(['draft-messages.plist']);
        if (label === 'draft-messages.plist') visible.add('Open');
      },
    };
  }

  return {
    clicks,
    $: async selector => element(labelFromSelector(selector)),
    $$: async selector => {
      const label = labelFromSelector(selector);
      return visible.has(label) ? [element(label)] : [];
    },
    pause: async () => {},
    waitUntil: async condition => {
      if (!(await condition())) throw new Error('mock picker condition was not ready');
    },
  };
}

test('documentPickerPath follows the Connect iOS attachment hierarchy', () => {
  assert.deepEqual(documentPickerPath(), [
    'Browse',
    'On My iPhone',
    'Connect iOS',
    'draft-messages.plist',
  ]);
});

test('documentPickerPath supports alternate app folders and files', () => {
  assert.deepEqual(
    documentPickerPath({
      locationName: 'iCloud Drive',
      appFolderName: 'Connect Preview',
      fileName: 'fixture.pdf',
    }),
    ['Browse', 'iCloud Drive', 'Connect Preview', 'fixture.pdf']
  );
});

test('selectConnectDocument uses a target file already visible in the current folder', async () => {
  const driver = pickerDriver(['Connect iOS', 'draft-messages.plist']);
  const steps = [];

  await selectConnectDocument(driver, { onStep: async step => steps.push(step) });

  assert.deepEqual(driver.clicks, ['draft-messages.plist', 'Open']);
  assert.deepEqual(steps, ['app-folder', 'file-selected']);
});

test('selectConnectDocument traverses Browse only when the picker starts outside the folder', async () => {
  const driver = pickerDriver(['Browse']);

  await selectConnectDocument(driver);

  assert.deepEqual(driver.clicks, [
    'Browse',
    'On My iPhone',
    'Connect iOS',
    'draft-messages.plist',
    'Open',
  ]);
});
