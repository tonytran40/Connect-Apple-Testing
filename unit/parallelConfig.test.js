const test = require('node:test');
const assert = require('node:assert/strict');

const {
  logicalCategoriesFromEnv,
  makeLanes,
  makeRunId,
  resolveTests,
} = require('../utils/parallelConfig');

test('parallel configuration normalizes tests, categories, run IDs, and lanes', () => {
  const env = {
    PARALLEL_TESTS: 'Tests/Alpha.js, Beta',
    PARALLEL_LOGICAL_CATEGORIES: '{"Alpha":"ConversationView"}',
    PARALLEL_RUN_ID: 'sample-run',
    PARALLEL_WORKERS: '2',
    PARALLEL_UDIDS: 'SIM-1,SIM-2',
    PARALLEL_APPIUM_PORTS: '4723,4725',
    PARALLEL_DEVICE_NAMES: 'iPhone A,iPhone B',
  };

  assert.deepEqual(resolveTests({ env, mainSuiteTests: ['Main'], standaloneTests: ['All'] }), ['Alpha', 'Beta']);
  assert.deepEqual(logicalCategoriesFromEnv(env), { Alpha: 'ConversationView' });
  assert.equal(makeRunId(env), 'sample-run');
  assert.deepEqual(makeLanes(env).map(lane => [lane.udid, lane.appiumPort]), [
    ['SIM-1', 4723],
    ['SIM-2', 4725],
  ]);
});

test('parallel configuration preserves defaults and rejects invalid category JSON', () => {
  assert.deepEqual(
    resolveTests({ env: {}, mainSuiteTests: ['Main'], standaloneTests: ['All'] }),
    ['Main']
  );
  assert.deepEqual(
    resolveTests({ env: { PARALLEL_TESTS: 'all' }, mainSuiteTests: ['Main'], standaloneTests: ['All'] }),
    ['All']
  );
  assert.equal(makeRunId({}, new Date('2026-09-23T12:34:56.000Z')), 'parallel-20260923123456');
  assert.throws(
    () => logicalCategoriesFromEnv({ PARALLEL_LOGICAL_CATEGORIES: '{bad' }),
    /must be valid JSON/
  );
});
