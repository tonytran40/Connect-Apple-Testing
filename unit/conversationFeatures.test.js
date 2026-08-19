const test = require('node:test');
const assert = require('node:assert/strict');

const {
  accessibleTextContainsParts,
  buildLabelPredicate,
  buildUniqueMessage,
  buildUniqueRoomName,
  clipboardUnavailableReason,
  decodeClipboardText,
  resolveNotificationLabels,
  stableTailSignature,
} = require('../utils/conversationFeatureFlows');
const ComposerTypeahead = require('../Tests/ComposerTypeahead');
const MessageActions = require('../Tests/MessageActions');
const RoomNotificationPreferences = require('../Tests/RoomNotificationPreferences');

test('conversation feature modules expose suite and standalone test entry points', () => {
  for (const module of [ComposerTypeahead, MessageActions, RoomNotificationPreferences]) {
    assert.equal(typeof module.run, 'function');
    assert.equal(typeof module.runTest, 'function');
  }
});

test('builds deterministic A-prefixed room names and unique message markers', () => {
  assert.equal(buildUniqueRoomName('Message Actions', 'abc123'), 'A-Message-Actions-abc123');
  assert.equal(buildUniqueMessage('Composer Typeahead', 'xyz789'), 'Composer-Typeahead message xyz789');
});

test('buildLabelPredicate escapes source labels and supports contains matching', () => {
  const exact = buildLabelPredicate('A "quoted" \\ label');
  const contains = buildLabelPredicate('No notifications', { contains: true });

  assert.match(exact, /name == "A \\"quoted\\" \\\\ label"/);
  assert.match(contains, /name CONTAINS "No notifications"/);
});

test('decodes Appium base64 clipboard values without changing ordinary text', () => {
  const message = 'Message-Actions message abc-123';
  assert.equal(decodeClipboardText(Buffer.from(message).toString('base64')), message);
  assert.equal(decodeClipboardText('plain text'), 'plain text');
  assert.equal(decodeClipboardText(Buffer.from(message)), message);
});

test('only classifies capability-level clipboard failures as unavailable', () => {
  assert.match(
    clipboardUnavailableReason(new Error('Unknown command: get clipboard')),
    /Unknown command/
  );
  assert.equal(clipboardUnavailableReason(new Error('clipboard text did not match')), null);
});

test('validates deterministic notification target and restore labels', () => {
  assert.deepEqual(resolveNotificationLabels({}), {
    target: 'No notifications',
    restore: 'Notify me for all messages',
  });
  assert.deepEqual(resolveNotificationLabels({
    ROOM_NOTIFICATION_TEST_LABEL: 'Notify me for mentions only',
    ROOM_NOTIFICATION_RESTORE_LABEL: 'Notify me for direct mentions only',
  }), {
    target: 'Notify me for mentions only',
    restore: 'Notify me for direct mentions only',
  });
  assert.throws(
    () => resolveNotificationLabels({ ROOM_NOTIFICATION_TEST_LABEL: 'Sometimes' }),
    /Unknown room notification target label/
  );
  assert.throws(
    () => resolveNotificationLabels({
      ROOM_NOTIFICATION_TEST_LABEL: 'No notifications',
      ROOM_NOTIFICATION_RESTORE_LABEL: 'No notifications',
    }),
    /must differ/
  );
});

test('matches message parts across accessibility attributes', () => {
  const attributes = {
    name: '@greg.blake',
    label: '😀 Typeahead message token',
    value: '',
  };
  assert.equal(
    accessibleTextContainsParts(attributes, ['greg.blake', '😀', 'Typeahead message token']),
    true
  );
  assert.equal(accessibleTextContainsParts(attributes, ['missing']), false);
});

test('returns only a repeated settled visual signature', () => {
  assert.equal(stableTailSignature(['old', 'new'], 2), null);
  assert.equal(stableTailSignature(['old', 'new', 'new'], 2), 'new');
  assert.equal(stableTailSignature(['old', 'old'], 2, 'old'), null);
});
