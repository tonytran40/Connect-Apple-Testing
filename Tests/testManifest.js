const { cclRequirement } = require('./cclRequirements');

const TESTS = Object.freeze([
  entry('CreateRoom', 'Room creation', {
    runAll: true,
    parallel: true,
    splitLane: 'main',
    split2Lane: 'main',
    cleanup: 'generated-room',
    estimatedDurationMs: 45000,
    cclRequirements: ['I-066', 'I-067', 'I-069'],
    cclPartialRequirements: ['I-070'],
  }),
  entry('newMessage', 'Direct messaging', {
    runAll: true,
    parallel: true,
    splitLane: 'main',
    split2Lane: 'main',
    cleanup: 'generated-conversation',
    estimatedDurationMs: 35000,
    cclRequirements: ['I-056', 'I-058', 'I-059'],
    cclPartialRequirements: ['I-061'],
  }),
  entry('favoriteRoom', 'Conversation list', { parallelAll: true, splitLane: 'conversationList', estimatedDurationMs: 40000 }),
  entry('markAsRead', 'Conversation list', { parallelAll: true, splitLane: 'conversationList', estimatedDurationMs: 65000, cclRequirements: ['I-054', 'I-055'] }),
  entry('notifications', 'Notifications', {
    parallelAll: true,
    splitLane: 'conversationList',
    optIn: true,
    requirement: 'partial',
    cleanup: 'external-fixture',
    timeoutClass: 'long',
  }),
  entry('removeRoom', 'Conversation list', { parallelAll: true, splitLane: 'conversationList', estimatedDurationMs: 55000, cclRequirements: ['I-046'] }),
  entry('PinnedMessageEditFlow', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    split2Lane: 'main',
    balanceTarget: 'main',
    balanceSafe: true,
    estimatedDurationMs: 65000,
    cclRequirements: ['I-083', 'I-084', 'I-122'],
  }),
  entry('Reactions', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'main',
    balanceSafe: true,
    estimatedDurationMs: 70000,
    cclRequirements: ['I-113', 'I-114', 'I-115'],
  }),
  entry('markdowns', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    split2Lane: 'main',
    balanceSafe: true,
    timeoutClass: 'long',
    cleanup: 'generated-room',
    estimatedDurationMs: 95000,
    cclPartialRequirements: ['I-102', 'I-103', 'I-104', 'I-105', 'I-106', 'I-107'],
  }),
  entry('LinkPreviews', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    timeoutClass: 'long',
    cleanup: 'generated-room',
    estimatedDurationMs: 55000,
  }),
  entry('attachments', 'Conversation view', {
    parallelAll: true,
    splitLane: 'conversationView',
    photoReady: true,
    timeoutClass: 'long',
    cleanup: 'generated-room-and-files',
    estimatedDurationMs: 105000,
    cclRequirements: ['I-157'],
    cclPartialRequirements: ['I-159'],
  }),
  entry('editRoom', 'Room settings', { parallelAll: true, splitLane: 'conversationView', balanceSafe: true, estimatedDurationMs: 50000, cclRequirements: ['I-128'] }),
  entry('membersRoom', 'Room membership', { parallelAll: true, splitLane: 'conversationView', balanceSafe: true, estimatedDurationMs: 45000, cclPartialRequirements: ['I-129', 'I-130', 'I-131', 'I-132', 'I-141'] }),
  entry('ComposerTypeahead', 'Composer', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'conversationList',
    balanceSafe: true,
    estimatedDurationMs: 40000,
  }),
  entry('MessageActions', 'Message actions', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'conversationList',
    balanceSafe: true,
    estimatedDurationMs: 35000,
    cclRequirements: ['I-118'],
    cclPartialRequirements: ['I-116'],
  }),
  entry('ConversationSearch', 'Conversation search', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceSafe: true,
    estimatedDurationMs: 65000,
    cclRequirements: ['I-093', 'I-094'],
  }),
  entry('RoomNotificationPreferences', 'Room settings', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'conversationList',
    balanceSafe: true,
    estimatedDurationMs: 70000,
    cclRequirements: ['I-095', 'I-134'],
  }),
  entry('ConversationList', 'User settings', {
    runAll: true,
    parallel: true,
    exclusive: true,
    cleanup: 'restore-account-settings',
    cclPartialRequirements: ['I-019', 'I-020', 'I-021', 'I-023', 'I-024'],
  }),
  entry('BrowseRooms', 'Room discovery', {
    parallelAll: true,
    splitLane: 'conversationList',
    environments: ['QA'],
    timeoutClass: 'long',
    cleanup: 'rejoin-generated-room',
    cclRequirements: ['I-076', 'I-078', 'I-079', 'I-080'],
    cclPartialRequirements: ['I-081'],
  }),
  entry('AudienceFilters', 'Room membership', {
    parallelAll: true,
    splitLane: 'main',
    environments: ['QA'],
    timeoutClass: 'long',
    cleanup: 'delete-audience-filter',
    cclRequirements: ['I-070', 'I-071', 'I-073', 'I-074', 'I-075'],
  }),
  entry('CorporateDirectory', 'Corporate directory', {
    parallelAll: true,
    splitLane: 'conversationList',
    environments: ['QA'],
    cleanup: 'read-only',
    cclRequirements: ['I-037', 'I-038', 'I-042'],
  }),
  entry('CorporateEvents', 'Corporate events', {
    splitLane: 'conversationList',
    environments: ['QA'],
    optIn: true,
    timeoutClass: 'long',
    cleanup: 'read-only',
    cclPartialRequirements: ['I-177', 'I-181', 'I-183', 'I-184', 'I-188'],
  }),
  entry('AppointmentCards', 'Appointments', {
    parallelAll: true,
    optIn: true,
    environments: ['QA'],
    timeoutClass: 'long',
    cleanup: 'read-only',
    cclRequirements: ['I-142', 'I-143'],
  }),
  entry('DraftPersistence', 'System lifecycle', { optIn: true, tier: 'system', cleanup: 'clear-draft', cclRequirements: ['I-168'] }),
  entry('Login_Signout', 'Authentication', { runAll: true, optIn: true, exclusive: true, cleanup: 'restore-login', cclRequirements: ['I-017'] }),
  entry('User_Settings', 'User settings', { optIn: true, exclusive: true, cleanup: 'restore-account-settings' }),
  entry('EditMessage', 'Message actions', { optIn: true, cclRequirements: ['I-122'] }),
  entry('PinnedMessages', 'Pinned messages', { optIn: true, cclRequirements: ['I-083', 'I-084'] }),
  entry('removeAllrooms', 'Cleanup', { optIn: true, tier: 'cleanup', cleanup: 'destructive-room-cleanup' }),
]);

function entry(name, feature, options = {}) {
  const optIn = Boolean(options.optIn);
  const requirement = options.requirement ||
    (optIn ? 'opt-in' : options.splitLane || options.exclusive ? 'required' : 'partial');
  const cclRequirements = [
    ...(options.cclRequirements || []).map(id => cclRequirement(id)),
    ...(options.cclPartialRequirements || []).map(id => cclRequirement(id, 'partial')),
  ];
  return Object.freeze({
    name,
    feature,
    tier: options.tier || 'regression',
    environments: Object.freeze(options.environments || ['ANY']),
    runAll: Boolean(options.runAll),
    parallel: Boolean(options.parallel),
    parallelAll: Boolean(options.parallelAll || options.parallel),
    splitLane: options.splitLane || '',
    split2Lane: options.split2Lane || (options.splitLane ? 'standalone' : ''),
    exclusive: Boolean(options.exclusive),
    optIn,
    requirement,
    timeoutClass: options.timeoutClass || 'standard',
    cleanup: options.cleanup || 'self-contained',
    cclRequirements: Object.freeze(cclRequirements),
    photoReady: Boolean(options.photoReady),
    balanceTarget: options.balanceTarget || '',
    balanceSafe: Boolean(options.balanceSafe),
    estimatedDurationMs: Number.isFinite(options.estimatedDurationMs) && options.estimatedDurationMs > 0
      ? Math.round(options.estimatedDurationMs)
      : options.timeoutClass === 'long' ? 90000 : 45000,
  });
}

function normalizeEnvironment(value = process.env.CONNECT_SERVER_NAME) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'UNSPECIFIED';
  if (normalized.includes('QA')) return 'QA';
  if (normalized.includes('PROD')) return 'PRODUCTION';
  if (normalized.includes('STAG')) return 'STAGING';
  if (normalized.includes('LOCAL')) return 'LOCAL';
  return normalized;
}

function supportsEnvironment(test, environment = normalizeEnvironment()) {
  return test.environments.includes('ANY') || test.environments.includes(environment);
}

function testsFor(profile, { environment = normalizeEnvironment(), includeOptIn = false } = {}) {
  return TESTS.filter(test => {
    if (!supportsEnvironment(test, environment)) return false;
    if (test.optIn && !includeOptIn) return false;
    if (profile === 'runAll') return test.runAll;
    if (profile === 'parallel') return test.parallel;
    if (profile === 'parallelAll') return test.parallelAll;
    if (profile === 'split3') return Boolean(test.splitLane) && !test.exclusive;
    if (profile === 'split2') return Boolean(test.split2Lane) && !test.exclusive;
    if (profile === 'exclusive') return test.exclusive && test.parallel;
    return false;
  });
}

function splitLaneTests(lane, options) {
  return testsFor('split3', options).filter(test => test.splitLane === lane);
}

function manifestEntry(name) {
  return TESTS.find(test => test.name === name);
}

function coverageFor(names, { environment = normalizeEnvironment() } = {}) {
  const selected = new Set(names);
  return TESTS.map(test => ({
    name: test.name,
    feature: test.feature,
    tier: test.tier,
    environments: test.environments,
    classification: test.requirement,
    timeoutClass: test.timeoutClass,
    cleanup: test.cleanup,
    cclRequirements: test.cclRequirements,
    eligible: supportsEnvironment(test, environment),
    scheduled: selected.has(test.name),
  }));
}

module.exports = {
  TESTS,
  coverageFor,
  manifestEntry,
  normalizeEnvironment,
  splitLaneTests,
  supportsEnvironment,
  testsFor,
};
