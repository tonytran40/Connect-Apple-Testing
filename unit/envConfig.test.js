const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../utils/envConfig');
const { isQaServerName, requireQaServer } = require('../utils/qaEnvironment');

test('typed environment helpers normalize supported values and preserve fallbacks', () => {
  const env = {
    COUNT: ' 7 ',
    INVALID_COUNT: '7.5',
    ITEMS: ' Alpha, Beta ,, Gamma ',
    JSON: '{"lane":"main"}',
    LABEL: ' Connect QA ',
  };

  assert.equal(config.text(env, 'LABEL'), 'Connect QA');
  assert.equal(config.text(env, 'MISSING', 'fallback'), 'fallback');
  assert.equal(config.integer(env, 'COUNT', 1, { min: 1 }), 7);
  assert.equal(config.integer(env, 'INVALID_COUNT', 1), 1);
  assert.deepEqual(config.csv(env, 'ITEMS'), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(config.json(env, 'JSON'), { lane: 'main' });
  assert.deepEqual(config.json(env, 'MISSING', []), []);
  assert.equal(config.boolean('YES'), true);
  assert.equal(config.boolean('off', true), false);
  assert.equal(config.boolean('unknown', true), true);
});

test('QA environment helpers accept QA tokens and preserve blocked metadata', () => {
  assert.equal(isQaServerName('Connect-QA-East'), true);
  assert.equal(isQaServerName('LOCAL'), false);
  assert.equal(requireQaServer({ CONNECT_SERVER_NAME: ' QA ' }, 'BrowseRooms'), 'QA');
  assert.throws(
    () => requireQaServer({ CONNECT_SERVER_NAME: 'LOCAL' }, 'BrowseRooms'),
    error => error.code === 'BLOCKED_QA_ONLY' && error.status === 'BLOCKED'
  );
});
