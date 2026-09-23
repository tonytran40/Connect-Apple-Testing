const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildSplitThreeSchedule,
  defaultRunId,
  loadHistoricalDurationEstimates,
} = require('../utils/splitSchedule');
const {
  buildSplitThreeSchedule: runnerBuildSplitThreeSchedule,
  defaultRunId: runnerDefaultRunId,
  loadHistoricalDurationEstimates: runnerLoadHistoricalDurationEstimates,
  shouldFailSplitCommand,
} = require('../Tests/runSplitParallel');

test('split runner preserves the scheduling compatibility exports', () => {
  assert.equal(runnerBuildSplitThreeSchedule, buildSplitThreeSchedule);
  assert.equal(runnerDefaultRunId, defaultRunId);
  assert.equal(runnerLoadHistoricalDurationEstimates, loadHistoricalDurationEstimates);
});

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

function durationAwareSchedule(overrides = {}) {
  return buildSplitThreeSchedule({
    mainTests: ['CreateRoom', 'newMessage'],
    conversationListTests: ['favoriteRoom', 'markAsRead', 'removeRoom'],
    conversationViewTests: [
      'PinnedMessageEditFlow',
      'Reactions',
      'markdowns',
      'attachments',
      'editRoom',
      'membersRoom',
      'ComposerTypeahead',
      'MessageActions',
      'ConversationSearch',
      'RoomNotificationPreferences',
    ],
    durationEstimates: {
      CreateRoom: 45,
      newMessage: 35,
      favoriteRoom: 40,
      markAsRead: 65,
      removeRoom: 55,
      PinnedMessageEditFlow: 65,
      Reactions: 70,
      markdowns: 95,
      attachments: 105,
      editRoom: 50,
      membersRoom: 45,
      ComposerTypeahead: 40,
      MessageActions: 35,
      ConversationSearch: 65,
      RoomNotificationPreferences: 70,
    },
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

test('duration-aware balancing lowers the longest estimated lane deterministically', () => {
  const first = durationAwareSchedule();
  const second = durationAwareSchedule();
  const all = [first.main, first.conversationList, first.conversationView].flat();
  const laneDurations = Object.values(first.estimatedLaneDurationMs);

  assert.deepEqual(first, second);
  assert.deepEqual(first.movedToMain, [
    'PinnedMessageEditFlow',
    'markdowns',
    'membersRoom',
  ]);
  assert.deepEqual(first.movedToConversationList, [
    'editRoom',
    'MessageActions',
    'RoomNotificationPreferences',
  ]);
  assert.equal(new Set(all.map(item => item.name)).size, all.length);
  assert.equal(all.length, 15);
  assert.ok(Math.max(...laneDurations) - Math.min(...laneDurations) <= 55);
});

test('duration-aware balancing preserves logical categories and the newMessage ordering rule', () => {
  const schedule = durationAwareSchedule();
  const moved = [schedule.main, schedule.conversationList]
    .flat()
    .filter(item => schedule.movedTests.includes(item.name));

  assert.ok(moved.length > 0);
  assert.ok(moved.every(item => item.logicalCategory === 'ConversationView'));
  assert.equal(schedule.main.at(-1).name, 'newMessage');
  assert.deepEqual(
    schedule.conversationView.find(item => item.name === 'attachments'),
    { name: 'attachments', logicalCategory: 'ConversationView' }
  );
});

test('explicit target lists override duration-aware placement for backward compatibility', () => {
  const schedule = durationAwareSchedule({
    selectedConversationViewTests: ['Reactions'],
    selectedConversationListTests: ['MessageActions'],
  });

  assert.deepEqual(schedule.movedToMain, ['Reactions']);
  assert.deepEqual(schedule.movedToConversationList, ['MessageActions']);
  assert.equal(schedule.conversationView.some(item => item.name === 'PinnedMessageEditFlow'), true);
});

test('historical estimates accept completed durations and ignore unusable outcomes', t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'split-duration-history-'));
  const historyFile = path.join(tempDir, 'summary.json');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.writeFileSync(historyFile, JSON.stringify({
    results: [
      { name: 'Reactions', durationMs: 71234, status: 'PASS' },
      { name: 'markdowns', durationMs: 90500, status: 'FAIL' },
      { name: 'attachments', durationMs: 0, status: 'PASS' },
      { name: 'AudienceFilters', durationMs: 120000, status: 'BLOCKED' },
    ],
  }));

  assert.deepEqual(loadHistoricalDurationEstimates({ file: historyFile }), {
    Reactions: 71234,
    markdowns: 90500,
  });
  assert.deepEqual(loadHistoricalDurationEstimates({ file: historyFile, enabled: false }), {});
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
