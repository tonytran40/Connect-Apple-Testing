const test = require('node:test');
const assert = require('node:assert/strict');

const corporateDirectory = require('../Tests/CorporateDirectory');

test('CorporateDirectory validates a deterministic QA user fixture', () => {
  assert.deepEqual(
    corporateDirectory.validateCorporateDirectoryFixture({
      CONNECT_SERVER_NAME: 'QA',
      CORPORATE_DIRECTORY_USER_QUERY: 'Levy',
      CORPORATE_DIRECTORY_EXPECTED_USER: 'Jonathan Levy',
    }),
    {
      serverName: 'QA',
      query: 'Levy',
      expectedUser: 'Jonathan Levy',
    }
  );
});

test('CorporateDirectory is blocked outside QA before UI execution', () => {
  assert.throws(
    () => corporateDirectory.validateCorporateDirectoryFixture({
      CONNECT_SERVER_NAME: 'Production',
      CORPORATE_DIRECTORY_USER_QUERY: 'Levy',
      CORPORATE_DIRECTORY_EXPECTED_USER: 'Jonathan Levy',
    }),
    error => error.code === 'TEST_BLOCKED' && /QA-only/.test(error.message)
  );
});

test('CorporateDirectory blocks missing deterministic user configuration', () => {
  assert.throws(
    () => corporateDirectory.validateCorporateDirectoryFixture({ CONNECT_SERVER_NAME: 'QA' }),
    error => error.status === 'BLOCKED' && /CORPORATE_DIRECTORY_USER_QUERY/.test(error.message)
  );
});

test('CorporateDirectory exposes direct and suite entry points', () => {
  assert.equal(typeof corporateDirectory.run, 'function');
  assert.equal(typeof corporateDirectory.runTest, 'function');
});
