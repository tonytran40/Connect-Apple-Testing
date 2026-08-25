const test = require('node:test');
const assert = require('node:assert/strict');

const {
  documentPickerPath,
} = require('../utils/attachmentFilePicker');

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
