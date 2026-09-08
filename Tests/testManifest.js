const TESTS = Object.freeze([
  entry('CreateRoom', 'Room creation', { runAll: true, parallel: true, splitLane: 'main', split2Lane: 'main', cleanup: 'generated-room' }),
  entry('newMessage', 'Direct messaging', { runAll: true, parallel: true, splitLane: 'main', split2Lane: 'main', cleanup: 'generated-conversation' }),
  entry('favoriteRoom', 'Conversation list', { parallelAll: true, splitLane: 'conversationList' }),
  entry('markAsRead', 'Conversation list', { parallelAll: true, splitLane: 'conversationList' }),
  entry('notifications', 'Notifications', {
    parallelAll: true,
    splitLane: 'conversationList',
    optIn: true,
    requirement: 'partial',
    cleanup: 'external-fixture',
    timeoutClass: 'long',
  }),
  entry('removeRoom', 'Conversation list', { parallelAll: true, splitLane: 'conversationList' }),
  entry('PinnedMessageEditFlow', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    split2Lane: 'main',
    balanceTarget: 'main',
    balanceSafe: true,
  }),
  entry('Reactions', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'main',
    balanceSafe: true,
  }),
  entry('markdowns', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    split2Lane: 'main',
    balanceSafe: true,
    timeoutClass: 'long',
    cleanup: 'generated-room',
  }),
  entry('LinkPreviews', 'Conversation view', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    timeoutClass: 'long',
    cleanup: 'generated-room',
  }),
  entry('attachments', 'Conversation view', {
    parallelAll: true,
    splitLane: 'conversationView',
    photoReady: true,
    timeoutClass: 'long',
    cleanup: 'generated-room-and-files',
  }),
  entry('editRoom', 'Room settings', { parallelAll: true, splitLane: 'conversationView', balanceSafe: true }),
  entry('membersRoom', 'Room membership', { parallelAll: true, splitLane: 'conversationView', balanceSafe: true }),
  entry('ComposerTypeahead', 'Composer', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'conversationList',
    balanceSafe: true,
  }),
  entry('MessageActions', 'Message actions', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'conversationList',
    balanceSafe: true,
  }),
  entry('ConversationSearch', 'Conversation search', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceSafe: true,
  }),
  entry('RoomNotificationPreferences', 'Room settings', {
    runAll: true,
    parallel: true,
    splitLane: 'conversationView',
    balanceTarget: 'conversationList',
    balanceSafe: true,
  }),
  entry('ConversationList', 'User settings', {
    runAll: true,
    parallel: true,
    exclusive: true,
    cleanup: 'restore-account-settings',
  }),
  entry('BrowseRooms', 'Room discovery', {
    parallelAll: true,
    splitLane: 'conversationList',
    environments: ['QA'],
    timeoutClass: 'long',
    cleanup: 'rejoin-generated-room',
  }),
  entry('AudienceFilters', 'Room membership', {
    parallelAll: true,
    splitLane: 'main',
    environments: ['QA'],
    timeoutClass: 'long',
    cleanup: 'delete-audience-filter',
  }),
  entry('CorporateDirectory', 'Corporate directory', {
    parallelAll: true,
    splitLane: 'conversationList',
    environments: ['QA'],
    cleanup: 'read-only',
  }),
  entry('AppointmentCards', 'Appointments', {
    parallelAll: true,
    optIn: true,
    environments: ['QA'],
    timeoutClass: 'long',
    cleanup: 'read-only',
  }),
  entry('DraftPersistence', 'System lifecycle', { optIn: true, tier: 'system', cleanup: 'clear-draft' }),
  entry('Login_Signout', 'Authentication', { runAll: true, optIn: true, exclusive: true, cleanup: 'restore-login' }),
  entry('User_Settings', 'User settings', { optIn: true, exclusive: true, cleanup: 'restore-account-settings' }),
  entry('EditMessage', 'Message actions', { optIn: true }),
  entry('PinnedMessages', 'Pinned messages', { optIn: true }),
  entry('removeAllrooms', 'Cleanup', { optIn: true, tier: 'cleanup', cleanup: 'destructive-room-cleanup' }),
]);

function entry(name, feature, options = {}) {
  const optIn = Boolean(options.optIn);
  const requirement = options.requirement ||
    (optIn ? 'opt-in' : options.splitLane || options.exclusive ? 'required' : 'partial');
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
    photoReady: Boolean(options.photoReady),
    balanceTarget: options.balanceTarget || '',
    balanceSafe: Boolean(options.balanceSafe),
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
