const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildPayloadFromEnv,
  exactRoomTitleSelector,
  resolveNotificationPlan,
} = require('../Tests/notifications');
const { elementVisualSignature, visualStateTransition } = require('../Tests/markAsRead');
const { clipboardVerificationMetadata } = require('../Tests/MessageActions');

test('notification env payload uses the Connect room_id contract', () => {
  const payload = buildPayloadFromEnv({
    NOTIFICATION_ROOM_ID: '!qa-room:example.test',
    NOTIFICATION_EVENT_TYPE: 'message',
    NOTIFICATION_TITLE: 'QA Connect',
    NOTIFICATION_BODY: 'Open deterministic room',
  });

  assert.equal(payload.room_id, '!qa-room:example.test');
  assert.equal(payload.event_type, 'message');
  assert.equal(payload.roomId, undefined);
});

test('checked-in APNs fixture uses room_id and contains no misleading fallback target', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '..', 'Tests', 'fixtures', 'connect-notification.apns'),
      'utf8'
    )
  );

  assert.equal(Object.hasOwn(fixture, 'room_id'), true);
  assert.equal(fixture.room_id, '');
  assert.equal(fixture.roomId, undefined);
  assert.equal(fixture.automation_target_room_name, '');
});

test('notification routing requires a real room id and exact visible room name', () => {
  assert.deepEqual(
    resolveNotificationPlan(
      { room_id: '!qa-room:example.test' },
      { NOTIFICATION_TARGET_ROOM_NAME: 'A-QA Notifications' }
    ),
    {
      mode: 'route',
      roomId: '!qa-room:example.test',
      targetRoomName: 'A-QA Notifications',
    }
  );

  assert.throws(
    () => resolveNotificationPlan({ room_id: '' }, {}),
    /deterministic route coverage requires.*room_id.*NOTIFICATION_TARGET_ROOM_NAME/
  );
  assert.throws(
    () =>
      resolveNotificationPlan(
        { room_id: 'automation-room-id' },
        { NOTIFICATION_TARGET_ROOM_NAME: 'replace-with-room-name' }
      ),
    /deterministic route coverage requires/
  );
});

test('banner-only notification coverage must be explicitly configured', () => {
  assert.deepEqual(resolveNotificationPlan({}, { NOTIFICATION_MODE: 'banner' }), {
    mode: 'banner',
  });
  assert.throws(
    () => resolveNotificationPlan({}, { NOTIFICATION_MODE: 'anything' }),
    /must be "route" or "banner"/
  );
});

test('exact notification room selector escapes quotes and backslashes', () => {
  const selector = exactRoomTitleSelector('QA "Room" \\ Name');
  assert.match(selector, /name == "QA \\"Room\\" \\\\ Name"/);
  assert.match(selector, /label == "QA \\"Room\\" \\\\ Name"/);
});

test('mark-as-read transition requires a changed unread style and restored read style', () => {
  assert.deepEqual(visualStateTransition('read', 'unread', 'read'), {
    unreadChanged: true,
    readRestored: true,
  });
  assert.deepEqual(visualStateTransition('read', 'read', 'read'), {
    unreadChanged: false,
    readRestored: true,
  });
  assert.deepEqual(visualStateTransition('read', 'unread', 'other'), {
    unreadChanged: true,
    readRestored: false,
  });
});

test('room-title visual signatures are stable for equal element screenshots', async () => {
  const screenshots = new Map([
    ['read', Buffer.from('read-title').toString('base64')],
    ['unread', Buffer.from('bold-unread-title').toString('base64')],
  ]);
  const driver = {
    takeElementScreenshot: async elementId => screenshots.get(elementId),
  };

  const firstRead = await elementVisualSignature(driver, { elementId: 'read' });
  const secondRead = await elementVisualSignature(driver, { elementId: 'read' });
  const unread = await elementVisualSignature(driver, { elementId: 'unread' });
  assert.equal(firstRead, secondRead);
  assert.notEqual(firstRead, unread);
});

test('clipboard capability gaps return INCONCLUSIVE metadata instead of PASS', () => {
  assert.deepEqual(clipboardVerificationMetadata({ available: true }), {
    status: 'PASS',
    notes: 'Copy placed the exact message body on the clipboard',
  });

  const unavailable = clipboardVerificationMetadata({
    available: false,
    reason: 'Unknown command: get clipboard',
  });
  assert.equal(unavailable.status, 'INCONCLUSIVE');
  assert.equal(unavailable.inconclusiveReason, 'Unknown command: get clipboard');
  assert.match(unavailable.notes, /Clipboard verification unavailable/);
});
