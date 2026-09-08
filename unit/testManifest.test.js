const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TESTS,
  coverageFor,
  normalizeEnvironment,
  splitLaneTests,
  testsFor,
} = require('../Tests/testManifest');

const INFRASTRUCTURE_ENTRY_POINTS = new Set([
  'runAll',
  'runParallel',
  'runSingle',
  'runSplitParallel',
  'testTime',
]);

test('every feature test CLI entry point is classified in the manifest', () => {
  const testsDir = path.resolve(__dirname, '..', 'Tests');
  const runnable = fs.readdirSync(testsDir)
    .filter(file => file.endsWith('.js'))
    .filter(file => fs.readFileSync(path.join(testsDir, file), 'utf8').includes('require.main === module'))
    .map(file => path.basename(file, '.js'))
    .filter(name => !INFRASTRUCTURE_ENTRY_POINTS.has(name));
  const classified = new Set(TESTS.map(item => item.name));

  assert.deepEqual(runnable.filter(name => !classified.has(name)), []);
});

test('every manifest entry declares evidence and execution metadata', () => {
  for (const entry of TESTS) {
    assert.match(entry.requirement, /^(required|partial|opt-in)$/, entry.name);
    assert.match(entry.timeoutClass, /^(standard|long)$/, entry.name);
    assert.ok(entry.cleanup, `${entry.name} must declare a cleanup contract`);
  }
});

test('QA-only tests join split scheduling only in QA', () => {
  const qaList = splitLaneTests('conversationList', { environment: 'QA' }).map(item => item.name);
  const localList = splitLaneTests('conversationList', { environment: 'LOCAL' }).map(item => item.name);

  assert.equal(qaList.includes('BrowseRooms'), true);
  assert.equal(qaList.includes('CorporateDirectory'), true);
  assert.equal(localList.includes('BrowseRooms'), false);
  assert.equal(localList.includes('CorporateDirectory'), false);
});

test('manifest normalizes common server labels and keeps opt-in tests out of defaults', () => {
  assert.equal(normalizeEnvironment('Nitro QA'), 'QA');
  assert.equal(normalizeEnvironment('localhost'), 'LOCAL');
  assert.equal(testsFor('parallelAll', { environment: 'QA' }).some(item => item.name === 'DraftPersistence'), false);
});

test('coverage records eligibility and scheduling separately', () => {
  const coverage = coverageFor(['CreateRoom'], { environment: 'LOCAL' });
  const createRoom = coverage.find(item => item.name === 'CreateRoom');
  const browseRooms = coverage.find(item => item.name === 'BrowseRooms');

  assert.equal(createRoom.scheduled, true);
  assert.equal(createRoom.eligible, true);
  assert.equal(createRoom.classification, 'required');
  assert.equal(createRoom.cleanup, 'generated-room');
  assert.equal(browseRooms.scheduled, false);
  assert.equal(browseRooms.eligible, false);
});
