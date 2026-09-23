const path = require('path');

const { TESTS } = require('../Tests/testManifest');
const { readJsonIfExists } = require('./runnerArtifacts');

const DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS = TESTS
  .filter(test => test.balanceTarget === 'main')
  .map(test => test.name)
  .join(',');
const DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS = TESTS
  .filter(test => test.balanceTarget === 'conversationList')
  .map(test => test.name)
  .join(',');
const PHOTO_READY_TESTS = new Set(TESTS.filter(test => test.photoReady).map(test => test.name));
const SAFE_CONVERSATION_VIEW_BALANCE_TESTS = new Set(
  TESTS.filter(test => test.balanceSafe).map(test => test.name)
);
const EXCLUSIVE_TESTS = new Set(TESTS.filter(test => test.exclusive).map(test => test.name));
const DEFAULT_DURATION_ESTIMATES = Object.fromEntries(
  TESTS.map(test => [test.name, test.estimatedDurationMs])
);
const SPLIT_LANES = ['main', 'conversationList', 'conversationView'];

function listCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function assignment(name, logicalCategory) {
  return { name, logicalCategory };
}

function defaultRunId(runId, env = process.env) {
  return env.PARALLEL_DRY_RUN === '1' ? `${runId}-dry-run` : runId;
}

function durationEstimate(name, estimates = {}) {
  const value = estimates instanceof Map ? estimates.get(name) : estimates[name];
  if (Number.isFinite(value) && value > 0) return Math.round(value);
  return DEFAULT_DURATION_ESTIMATES[name] || 45000;
}

function loadHistoricalDurationEstimates({
  file = process.env.SPLIT_DURATION_HISTORY_FILE || path.resolve(
    __dirname,
    '..',
    'reports',
    'runs',
    'split3-combined',
    'summary.json'
  ),
  enabled = process.env.SPLIT_DURATION_HISTORY !== '0',
} = {}) {
  if (!enabled) return {};
  const summary = readJsonIfExists(file);
  if (!summary || !Array.isArray(summary.results)) return {};

  return Object.fromEntries(
    summary.results
      .filter(result =>
        result &&
        typeof result.name === 'string' &&
        Number.isFinite(result.durationMs) &&
        result.durationMs > 0 &&
        !['BLOCKED', 'DRY_RUN', 'SKIPPED'].includes(result.status)
      )
      .map(result => [result.name, Math.round(result.durationMs)])
  );
}

function estimatedLaneDurations(groups, estimates) {
  return Object.fromEntries(
    SPLIT_LANES.map(lane => [
      lane,
      groups[lane].reduce((total, name) => total + durationEstimate(name, estimates), 0),
    ])
  );
}

function assertUniqueTests(groups) {
  const seen = new Map();
  for (const [group, tests] of Object.entries(groups)) {
    for (const name of tests) {
      if (seen.has(name)) {
        throw new Error(`Split test "${name}" is assigned to both ${seen.get(name)} and ${group}`);
      }
      seen.set(name, group);
    }
  }
}

function buildSplitThreeSchedule({
  mainTests,
  conversationListTests,
  conversationViewTests,
  selectedConversationViewTests,
  selectedConversationListTests,
  balancingEnabled = true,
  durationEstimates = DEFAULT_DURATION_ESTIMATES,
}) {
  const groups = {
    main: [...mainTests],
    conversationList: [...conversationListTests],
    conversationView: [...conversationViewTests],
  };
  assertUniqueTests(groups);

  for (const photoTest of PHOTO_READY_TESTS) {
    const source = Object.keys(groups).find(group => groups[group].includes(photoTest));
    if (source && source !== 'conversationView') {
      groups[source] = groups[source].filter(name => name !== photoTest);
      groups.conversationView.push(photoTest);
    }
  }

  const hasExplicitTargets = selectedConversationViewTests !== undefined ||
    selectedConversationListTests !== undefined;
  const selectedMain = new Set(
    selectedConversationViewTests === undefined
      ? listCsv(DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS)
      : selectedConversationViewTests
  );
  const selectedList = new Set(
    selectedConversationListTests === undefined
      ? listCsv(DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS)
      : selectedConversationListTests
  );
  const overlappingSelections = [...selectedMain].filter(name => selectedList.has(name));
  if (overlappingSelections.length) {
    throw new Error(
      `ConversationView balance targets overlap: ${overlappingSelections.join(', ')}`
    );
  }

  let movedToMain = [];
  let movedToConversationList = [];

  if (balancingEnabled && hasExplicitTargets) {
    movedToMain = groups.conversationView.filter(
      name => selectedMain.has(name) &&
        SAFE_CONVERSATION_VIEW_BALANCE_TESTS.has(name) &&
        !EXCLUSIVE_TESTS.has(name) &&
        !PHOTO_READY_TESTS.has(name)
    );
    movedToConversationList = groups.conversationView.filter(
      name => selectedList.has(name) &&
        SAFE_CONVERSATION_VIEW_BALANCE_TESTS.has(name) &&
        !EXCLUSIVE_TESTS.has(name) &&
        !PHOTO_READY_TESTS.has(name)
    );
  } else if (balancingEnabled) {
    const movable = groups.conversationView
      .filter(name =>
        SAFE_CONVERSATION_VIEW_BALANCE_TESTS.has(name) &&
        !EXCLUSIVE_TESTS.has(name) &&
        !PHOTO_READY_TESTS.has(name)
      )
      .map((name, index) => ({ name, index, durationMs: durationEstimate(name, durationEstimates) }))
      .sort((a, b) => b.durationMs - a.durationMs || a.index - b.index || a.name.localeCompare(b.name));
    const movableNames = new Set(movable.map(test => test.name));
    const fixedGroups = {
      main: [...groups.main],
      conversationList: [...groups.conversationList],
      conversationView: groups.conversationView.filter(name => !movableNames.has(name)),
    };
    const laneDurations = estimatedLaneDurations(fixedGroups, durationEstimates);
    const targetByName = new Map();

    for (const test of movable) {
      const target = SPLIT_LANES.reduce((best, lane) =>
        laneDurations[lane] < laneDurations[best] ? lane : best
      );
      targetByName.set(test.name, target);
      laneDurations[target] += test.durationMs;
    }

    movedToMain = groups.conversationView.filter(name => targetByName.get(name) === 'main');
    movedToConversationList = groups.conversationView.filter(
      name => targetByName.get(name) === 'conversationList'
    );
  }

  const moved = new Set([...movedToMain, ...movedToConversationList]);
  const mainAssignments = [
    ...groups.main.map(name => assignment(name, 'main-suite')),
    ...movedToMain.map(name => assignment(name, 'ConversationView')),
  ];
  const schedule = {
    main: [
      ...mainAssignments.filter(item => item.name !== 'newMessage'),
      ...mainAssignments.filter(item => item.name === 'newMessage'),
    ],
    conversationList: [
      ...groups.conversationList.map(name => assignment(name, 'Conversation-List')),
      ...movedToConversationList.map(name => assignment(name, 'ConversationView')),
    ],
    conversationView: groups.conversationView
      .filter(name => !moved.has(name))
      .map(name => assignment(name, 'ConversationView')),
    movedTests: [...movedToMain, ...movedToConversationList],
    movedToMain,
    movedToConversationList,
  };
  schedule.estimatedLaneDurationMs = estimatedLaneDurations({
    main: schedule.main.map(item => item.name),
    conversationList: schedule.conversationList.map(item => item.name),
    conversationView: schedule.conversationView.map(item => item.name),
  }, durationEstimates);
  return schedule;
}

module.exports = {
  DEFAULT_BALANCED_CONVERSATION_VIEW_TESTS,
  DEFAULT_LIST_BALANCED_CONVERSATION_VIEW_TESTS,
  buildSplitThreeSchedule,
  defaultRunId,
  loadHistoricalDurationEstimates,
};
