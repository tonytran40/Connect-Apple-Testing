const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTimingSummary,
  mergePhaseTimings,
  normalizePhaseTimings,
  reconcileLaneTimings,
} = require('../utils/reportWriter');

test('phase timings use a stable machine-readable schema', () => {
  assert.deepEqual(normalizePhaseTimings({ testBodyMs: 12.6, recoveryMs: -4 }), {
    sessionCreationMs: 0,
    loginReadinessMs: 0,
    testBodyMs: 13,
    screenshotCaptureMs: 0,
    recoveryMs: 0,
    reportGenerationMs: 0,
    roomCreationMs: 0,
  });
});

test('lane timing combines worker setup with all result phases exactly once', () => {
  assert.deepEqual(
    reconcileLaneTimings(
      { sessionCreationMs: 100, testBodyMs: 500 },
      [
        { timings: { testBodyMs: 300, screenshotCaptureMs: 20 } },
        { timings: { testBodyMs: 400, screenshotCaptureMs: 30 } },
      ]
    ),
    {
      sessionCreationMs: 100,
      loginReadinessMs: 0,
      testBodyMs: 1200,
      screenshotCaptureMs: 50,
      recoveryMs: 0,
      reportGenerationMs: 0,
      roomCreationMs: 0,
    }
  );
});

test('phase timing aggregation combines lane and test work without changing result fields', () => {
  const legacyResult = { name: 'Reactions', status: 'PASS', durationMs: 100 };
  const summary = buildTimingSummary({
    lanes: [{ timings: { sessionCreationMs: 20, loginReadinessMs: 5 } }],
    results: [
      legacyResult,
      { timings: { testBodyMs: 50, screenshotCaptureMs: 10, recoveryMs: 2 } },
    ],
    reportGenerationMs: 8,
  });

  assert.deepEqual(summary, {
    unit: 'milliseconds',
    phases: {
      sessionCreationMs: 20,
      loginReadinessMs: 5,
      testBodyMs: 50,
      screenshotCaptureMs: 10,
      recoveryMs: 2,
      reportGenerationMs: 8,
      roomCreationMs: 0,
    },
  });
  assert.deepEqual(legacyResult, { name: 'Reactions', status: 'PASS', durationMs: 100 });
});

test('test-owned room creation timing can be merged without replacing runner phases', () => {
  assert.deepEqual(
    mergePhaseTimings(
      { loginReadinessMs: 15, testBodyMs: 80 },
      { roomCreationMs: 30, testBodyMs: 5 }
    ),
    {
      sessionCreationMs: 0,
      loginReadinessMs: 15,
      testBodyMs: 85,
      screenshotCaptureMs: 0,
      recoveryMs: 0,
      reportGenerationMs: 0,
      roomCreationMs: 30,
    }
  );
});
