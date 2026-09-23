const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addPhaseTiming,
  measurePhase,
  prefixOutput,
  resolveTestStatus,
  spawnNodeChild,
  waitForChild,
} = require('../utils/runnerLifecycle');

test('resolveTestStatus preserves supported result and error statuses', () => {
  assert.equal(resolveTestStatus(null, { status: 'blocked' }), 'BLOCKED');
  assert.equal(resolveTestStatus(null, { status: 'unexpected' }), 'PASS');
  assert.equal(resolveTestStatus(Object.assign(new Error('skip'), { status: 'skipped' })), 'SKIPPED');
  assert.equal(resolveTestStatus(new Error('boom')), 'FAIL');
});

test('phase timing helpers accumulate rounded non-negative durations', async () => {
  const timings = { testBodyMs: 5 };
  addPhaseTiming(timings, 'testBodyMs', 4.6);
  addPhaseTiming(timings, 'testBodyMs', -100);
  assert.equal(timings.testBodyMs, 10);

  const value = await measurePhase(timings, 'recoveryMs', async () => 'ready');
  assert.equal(value, 'ready');
  assert.ok(timings.recoveryMs >= 0);
});

test('node child lifecycle reports exit codes and signals', async () => {
  const child = spawnNodeChild('-e', ['process.exit(7)'], { stdio: 'ignore' });
  assert.deepEqual(await waitForChild(child), { code: 7, signal: null });
});

test('prefixed output retains partial lines until the stream ends', async () => {
  const writes = [];
  const child = spawnNodeChild('-e', ["process.stdout.write('first\\nsec'); process.stdout.write('ond')"], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  prefixOutput(child.stdout, 'lane', line => writes.push(line));
  await waitForChild(child);
  assert.deepEqual(writes, ['[lane] first', '[lane] second']);
});
