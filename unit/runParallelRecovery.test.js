const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifySessionHealth,
  probeReusableSession,
} = require('../Tests/runParallel');
const parallelSession = require('../utils/parallelSession');

test('parallel runner preserves session-health compatibility exports', () => {
  assert.equal(classifySessionHealth, parallelSession.classifySessionHealth);
  assert.equal(probeReusableSession, parallelSession.probeReusableSession);
});

test('classifySessionHealth accepts a responsive foreground Connect session', () => {
  assert.deepEqual(
    classifySessionHealth({ hasSessionId: true, commandResponsive: true, appState: 4 }),
    { healthy: true, reason: 'WebDriver and Connect are responsive' }
  );
});

test('classifySessionHealth rejects missing, unresponsive, and background sessions', () => {
  assert.equal(
    classifySessionHealth({ hasSessionId: false, commandResponsive: false }).healthy,
    false
  );
  assert.equal(
    classifySessionHealth({ hasSessionId: true, commandResponsive: false }).healthy,
    false
  );
  assert.deepEqual(
    classifySessionHealth({ hasSessionId: true, commandResponsive: true, appState: 3 }),
    { healthy: false, reason: 'Connect is not foregrounded (app state 3)' }
  );
});

test('probeReusableSession performs only cheap health commands for a healthy session', async () => {
  const calls = [];
  const driver = {
    sessionId: 'session-1',
    getWindowRect: async () => {
      calls.push('getWindowRect');
      return { x: 0, y: 0, width: 390, height: 844 };
    },
    queryAppState: async bundleId => {
      calls.push(['queryAppState', bundleId]);
      return 4;
    },
  };

  assert.deepEqual(await probeReusableSession(driver, 'com.example.connect'), {
    healthy: true,
    reason: 'WebDriver and Connect are responsive',
  });
  assert.deepEqual(calls, [
    'getWindowRect',
    ['queryAppState', 'com.example.connect'],
  ]);
});

test('probeReusableSession reports an Appium command failure as unhealthy', async () => {
  const driver = {
    sessionId: 'session-1',
    getWindowRect: async () => {
      throw new Error('invalid session id');
    },
  };

  assert.deepEqual(await probeReusableSession(driver), {
    healthy: false,
    reason: 'WebDriver session did not respond: invalid session id',
  });
});

test('probeReusableSession does not issue commands without a session id', async () => {
  let commandCalled = false;
  const driver = {
    getWindowRect: async () => {
      commandCalled = true;
    },
  };

  assert.deepEqual(await probeReusableSession(driver), {
    healthy: false,
    reason: 'WebDriver session id is missing',
  });
  assert.equal(commandCalled, false);
});
