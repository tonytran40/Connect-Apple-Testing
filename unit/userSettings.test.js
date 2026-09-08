const test = require('node:test');
const assert = require('node:assert/strict');

const userSettings = require('../Tests/User_Settings');

test('User_Settings resolves deterministic persistence targets and restores', () => {
  assert.deepEqual(userSettings.resolveUserSettingsFixture({}), {
    layout: { target: 'Cozy', restore: 'Classic' },
    sorting: { target: 'Alphabetically', restore: 'Recent Activity' },
    includeLogout: false,
  });
});

test('User_Settings logout/login is opt-in', () => {
  assert.equal(
    userSettings.resolveUserSettingsFixture({ USER_SETTINGS_INCLUDE_LOGOUT: 'true' })
      .includeLogout,
    true
  );
  assert.equal(userSettings.booleanEnv('0'), false);
});

test('User_Settings rejects unknown source options', () => {
  assert.throws(
    () => userSettings.resolveUserSettingsFixture({ USER_SETTINGS_LAYOUT_TARGET: 'Dense' }),
    /USER_SETTINGS_LAYOUT_TARGET must be one of/
  );
});

test('User_Settings requires different target and restore values', () => {
  assert.throws(
    () => userSettings.resolveUserSettingsFixture({
      USER_SETTINGS_SORT_TARGET: 'Alphabetically',
      USER_SETTINGS_SORT_RESTORE: 'Alphabetically',
    }),
    /sorting target and restore values must differ/
  );
});

test('User_Settings exposes direct and suite entry points', () => {
  assert.equal(typeof userSettings.run, 'function');
  assert.equal(typeof userSettings.runTest, 'function');
});
