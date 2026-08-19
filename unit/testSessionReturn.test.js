const test = require('node:test');
const assert = require('node:assert/strict');

const { runWithOptionalDriver } = require('../utils/testSession');

test('runWithOptionalDriver returns test-owned timing metadata', async () => {
  const driver = {};
  const result = await runWithOptionalDriver(
    async activeDriver => {
      assert.equal(activeDriver, driver);
      return { timings: { roomCreationMs: 42 } };
    },
    driver
  );

  assert.deepEqual(result, { timings: { roomCreationMs: 42 } });
});
