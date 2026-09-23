const assert = require('node:assert/strict');
const test = require('node:test');

const { defineTest } = require('../utils/testHarness');

test('defineTest passes the provided driver and options to the scenario', async () => {
  const driver = {};
  const options = { marker: 'value' };
  const expected = { status: 'PASS' };
  const harness = defineTest({
    name: 'HarnessPass',
    captureErrorScreenshot: false,
    execute: async (activeDriver, activeOptions) => {
      assert.equal(activeDriver, driver);
      assert.equal(activeOptions, options);
      return expected;
    },
  });

  assert.equal(await harness.run(driver, options), expected);
});

test('defineTest runs custom error evidence and preserves the original failure', async () => {
  const failure = new Error('scenario failed');
  const evidence = [];
  const harness = defineTest({
    name: 'HarnessFailure',
    captureErrorScreenshot: false,
    execute: async () => {
      throw failure;
    },
    onError: async (_driver, error, options) => {
      evidence.push({ error, options });
    },
  });
  const options = { marker: 'failure' };

  await assert.rejects(() => harness.run({}, options), error => error === failure);
  assert.deepEqual(evidence, [{ error: failure, options }]);
});

test('defineTest prepares options before executing the scenario', async () => {
  const driver = {};
  const harness = defineTest({
    name: 'HarnessPreflight',
    captureErrorScreenshot: false,
    prepareOptions: options => ({ ...options, fixture: 'validated' }),
    execute: async (activeDriver, options) => {
      assert.equal(activeDriver, driver);
      return options;
    },
  });

  assert.deepEqual(await harness.run(driver, { marker: 'value' }), {
    marker: 'value',
    fixture: 'validated',
  });
});

test('defineTest validates required configuration', () => {
  assert.throws(() => defineTest({ execute() {} }), /test name/);
  assert.throws(() => defineTest({ name: 'MissingExecute' }), /execute function/);
  assert.throws(
    () => defineTest({ name: 'InvalidPreflight', execute() {}, prepareOptions: true }),
    /prepareOptions must be a function/
  );
});
