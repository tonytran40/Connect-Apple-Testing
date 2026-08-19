const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSplitThreeSchedule,
  defaultRunId,
  shouldFailSplitCommand,
} = require('../Tests/runSplitParallel');

function defaultSchedule(overrides = {}) {
  return buildSplitThreeSchedule({
    mainTests: ['CreateRoom', 'newMessage'],
    conversationListTests: ['favoriteRoom', 'markAsRead'],
    conversationViewTests: [
      'PinnedMessageEditFlow',
      'Reactions',
      'markdowns',
      'attachments',
      'editRoom',
      'membersRoom',
    ],
    selectedConversationViewTests: ['PinnedMessageEditFlow', 'Reactions'],
    selectedConversationListTests: [],
    ...overrides,
  });
}

test('split-three balances safe ConversationView tests while preserving logical category', () => {
  const schedule = defaultSchedule();
  const moved = schedule.main.filter(item => schedule.movedTests.includes(item.name));
  const all = [schedule.main, schedule.conversationList, schedule.conversationView].flat();

  assert.deepEqual(schedule.movedTests, ['PinnedMessageEditFlow', 'Reactions']);
  assert.deepEqual(moved.map(item => item.logicalCategory), ['ConversationView', 'ConversationView']);
  assert.deepEqual(schedule.main.map(item => item.name), [
    'CreateRoom',
    'PinnedMessageEditFlow',
    'Reactions',
    'newMessage',
  ]);
  assert.equal(new Set(all.map(item => item.name)).size, all.length);
});

test('attachments remain pinned to the photo-ready ConversationView lane', () => {
  const schedule = defaultSchedule({
    mainTests: ['CreateRoom', 'attachments'],
    conversationViewTests: ['PinnedMessageEditFlow', 'Reactions'],
    selectedConversationViewTests: ['attachments', 'PinnedMessageEditFlow'],
  });

  assert.equal(schedule.main.some(item => item.name === 'attachments'), false);
  assert.deepEqual(
    schedule.conversationView.find(item => item.name === 'attachments'),
    { name: 'attachments', logicalCategory: 'ConversationView' }
  );
});

test('balancing can be disabled without changing configured defaults', () => {
  const schedule = defaultSchedule({ balancingEnabled: false });
  assert.deepEqual(schedule.movedTests, []);
  assert.equal(schedule.main.some(item => item.name === 'Reactions'), false);
  assert.equal(schedule.conversationView.some(item => item.name === 'Reactions'), true);
});

test('safe ConversationView tests can use the otherwise idle conversation-list lane', () => {
  const schedule = defaultSchedule({
    conversationViewTests: [
      'PinnedMessageEditFlow',
      'Reactions',
      'ComposerTypeahead',
      'MessageActions',
      'RoomNotificationPreferences',
      'attachments',
    ],
    selectedConversationListTests: [
      'ComposerTypeahead',
      'MessageActions',
      'RoomNotificationPreferences',
    ],
  });

  assert.deepEqual(schedule.movedToConversationList, [
    'ComposerTypeahead',
    'MessageActions',
    'RoomNotificationPreferences',
  ]);
  assert.deepEqual(
    schedule.conversationList.slice(-3).map(item => item.logicalCategory),
    ['ConversationView', 'ConversationView', 'ConversationView']
  );
  assert.equal(schedule.conversationView.some(item => item.name === 'attachments'), true);
});

test('a test cannot be selected for both balancing destinations', () => {
  assert.throws(
    () => defaultSchedule({
      selectedConversationViewTests: ['Reactions'],
      selectedConversationListTests: ['Reactions'],
    }),
    /balance targets overlap/
  );
});

test('unsafe and duplicate split assignments are rejected or left in place', () => {
  const schedule = defaultSchedule({ selectedConversationViewTests: ['attachments', 'unknown'] });
  assert.deepEqual(schedule.movedTests, []);

  assert.throws(
    () => defaultSchedule({ mainTests: ['CreateRoom', 'Reactions'] }),
    /assigned to both main and conversationView/
  );
});

test('cleanup only fails the command in strict mode and never hides product failure', () => {
  assert.equal(shouldFailSplitCommand([0, 0], { strict: false, status: 'FAIL' }), false);
  assert.equal(shouldFailSplitCommand([0, 0], { strict: true, status: 'FAIL' }), true);
  assert.equal(shouldFailSplitCommand([1, 0], { strict: false, status: 'PASS' }), true);
});

test('dry runs use isolated default report IDs', () => {
  assert.equal(defaultRunId('split3-combined', {}), 'split3-combined');
  assert.equal(
    defaultRunId('split3-combined', { PARALLEL_DRY_RUN: '1' }),
    'split3-combined-dry-run'
  );
});
