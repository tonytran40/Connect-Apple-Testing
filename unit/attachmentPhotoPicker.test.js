const test = require('node:test');
const assert = require('node:assert/strict');

process.env.IOS_PHOTO_PERMISSION_CHECKS = '0';

const photoPicker = require('../utils/attachmentPhotoPicker');
const {
  firstRowPhotoItems,
  getPickerGridBounds,
  gridTapPoints,
  isPickerChrome,
} = require('../utils/attachmentPhotoPickerNavigation');
const {
  getSelectedPhotoCount,
  parseSelectedPhotoCount,
} = require('../utils/attachmentPhotoPickerState');

test('attachmentPhotoPicker preserves its compatibility exports', () => {
  assert.deepEqual(Object.keys(photoPicker).sort(), [
    'logPickerDiagnostics',
    'sendComposerDraft',
    'tapAllPhotosInPicker',
    'tapDoneInPhotoPicker',
    'waitForAttachmentDraftInComposer',
    'waitForPhotoPicker',
  ]);
});

test('gridTapPoints returns row-major cell centers', () => {
  assert.deepEqual(gridTapPoints({ left: 0, right: 300, top: 100, bottom: 300, cols: 3, rows: 2 }), [
    { x: 50, y: 150 },
    { x: 150, y: 150 },
    { x: 250, y: 150 },
    { x: 50, y: 250 },
    { x: 150, y: 250 },
    { x: 250, y: 250 },
  ]);
});

test('getPickerGridBounds derives the existing safe picker region', async () => {
  const bounds = await getPickerGridBounds({ getWindowRect: async () => ({ width: 400, height: 800 }) });
  assert.deepEqual(bounds, { left: 28, right: 372, top: 256, bottom: 624, cols: 3, rows: 2 });
});

test('picker chrome filtering and first-row grouping retain photo tiles', () => {
  assert.equal(isPickerChrome('Photos', ''), true);
  assert.equal(isPickerChrome('', 'Select up to 3 items'), true);
  assert.equal(isPickerChrome('Photo, 12 September', ''), false);

  const items = [
    { key: 'a', rect: { x: 0, y: 100 } },
    { key: 'b', rect: { x: 100, y: 110 } },
    { key: 'c', rect: { x: 0, y: 160 } },
  ];
  assert.deepEqual(firstRowPhotoItems(items, 3).map(item => item.key), ['a', 'b']);
  assert.deepEqual(firstRowPhotoItems(items, 1).map(item => item.key), ['a']);
});

test('selected photo count parsing accepts singular/plural and rejects picker chrome', () => {
  assert.equal(parseSelectedPhotoCount('1 Photo'), 1);
  assert.equal(parseSelectedPhotoCount('12 Photos'), 12);
  assert.equal(parseSelectedPhotoCount('Select up to 3 Photos'), 3);
  assert.equal(parseSelectedPhotoCount('Photos'), null);
});

test('getSelectedPhotoCount scans candidates and falls back to zero', async () => {
  const elements = [
    { getAttribute: async name => name === 'name' ? 'Done' : '' },
    { getAttribute: async name => name === 'label' ? '3 Photos' : '' },
  ];
  assert.equal(await getSelectedPhotoCount({ $$: async () => elements }), 3);
  assert.equal(await getSelectedPhotoCount({ $$: async () => [] }), 0);
});
