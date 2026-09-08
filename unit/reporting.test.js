const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { formatDurationMs } = require('../utils/reportWriter');
const { hasFreshCombinedSummary, validateRunId } = require('../scripts/runSplit3AndPublishReport');
const {
  buildEnvironmentSummary,
  buildEvidenceDecision,
  coverageForSummary,
  failureCategory,
  rerunCommandForResult,
  statusForSummary,
  uniqueReportRuns,
} = require('../scripts/report/reportAnalysis');
const { enforceReportRetention } = require('../scripts/report/reportFiles');

const COMPLETE_APP_ENVIRONMENT = Object.freeze({
  bundleId: 'com.powerhrg.connect.v3.debug',
  appVersion: '3.2.1',
  appBuild: '456',
  appBranch: 'feature/report-evidence',
  appCommit: 'abc1234',
  serverEnvironment: 'LOCAL',
});

function freshSummary(overrides = {}) {
  return {
    startedAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:05:00.000Z',
    results: [{ name: 'LocalTest', status: 'PASS' }],
    coverage: [
      {
        name: 'LocalTest',
        feature: 'Local feature',
        classification: 'required',
        environments: ['ANY'],
        scheduled: true,
      },
    ],
    ...overrides,
  };
}

test('formatDurationMs formats short and minute-scale durations', () => {
  assert.equal(formatDurationMs(900), '1s');
  assert.equal(formatDurationMs(65000), '1m 5s');
});

test('publisher only accepts a summary written by the current run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-report-test-'));
  const runRoot = path.join(root, 'reports', 'runs', 'sample');
  fs.mkdirSync(runRoot, { recursive: true });
  const summary = path.join(runRoot, 'summary.json');
  fs.writeFileSync(summary, '{}');

  const startedAt = Date.now();
  const old = new Date(startedAt - 10000);
  fs.utimesSync(summary, old, old);
  assert.equal(hasFreshCombinedSummary(startedAt, root, 'sample'), false);

  fs.writeFileSync(summary, '{"status":"PASS"}');
  assert.equal(hasFreshCombinedSummary(startedAt, root, 'sample'), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('publisher accepts path-safe run IDs and rejects traversal', () => {
  assert.equal(validateRunId('split3-combined_2026.08'), 'split3-combined_2026.08');
  assert.throws(() => validateRunId('../outside'), /Unsafe report run ID/);
  assert.throws(() => validateRunId('run/child'), /Unsafe report run ID/);
  assert.throws(() => validateRunId(''), /Unsafe report run ID/);
});

test('failure analysis classifies common Appium failures', () => {
  assert.equal(
    failureCategory({ status: 'FAIL', error: 'NoSuchElementError: accessibility selector not displayed' }),
    'Selector'
  );
  assert.equal(
    failureCategory({ status: 'FAIL', error: 'Lost connection. Check your internet connectivity.' }),
    'Network'
  );
  assert.equal(failureCategory({ status: 'FAIL', error: 'Login credentials rejected' }), 'Login');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Photo permission was denied' }), 'Permission');
  assert.equal(failureCategory({ status: 'FAIL', error: 'waitFor timed out' }), 'Timeout');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Application terminated unexpectedly' }), 'App crash');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Expected true but received false' }), 'Assertion');
  assert.equal(failureCategory({ status: 'FAIL', error: 'Unclassified problem' }), 'Unknown');
  assert.equal(failureCategory({ status: 'PASS', error: 'timeout text is irrelevant' }), '');
});

test('rerun command preserves lane targeting', () => {
  const command = rerunCommandForResult({
    name: 'Reactions',
    appiumPort: 4727,
    udid: 'simulator id',
    deviceName: 'iPhone 17',
  });
  assert.equal(
    command,
    "APPIUM_PORT=4727 SIMULATOR_UDID='simulator id' DEVICE_NAME='iPhone 17' node Tests/Reactions.js"
  );
});

test('report history removes exact duplicate run metadata', () => {
  const reports = [
    { runId: 'run', startedAt: '2026-01-01T10:00:00Z', passed: 2, failed: 0, total: 2 },
    { runId: 'run', startedAt: '2026-01-01T10:00:00Z', passed: 2, failed: 0, total: 2 },
    { runId: 'run', startedAt: '2026-01-02T10:00:00Z', passed: 1, failed: 1, total: 2 },
  ];
  assert.deepEqual(
    uniqueReportRuns(reports).map(report => report.startedAt),
    ['2026-01-02T10:00:00Z', '2026-01-01T10:00:00Z']
  );
});

test('installed app metadata is discovered from a result simulator UDID', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-app-discovery-'));
  const appPath = path.join(root, 'Connect iOS.app');
  fs.mkdirSync(appPath);
  fs.writeFileSync(path.join(appPath, 'Info.plist'), 'placeholder');
  const calls = [];
  const values = {
    CFBundleIdentifier: 'com.powerhrg.connect.v3.debug',
    CFBundleShortVersionString: '9.8.7',
    CFBundleVersion: '654',
  };
  const originalSource = process.env.CONNECT_APP_SOURCE;
  process.env.CONNECT_APP_SOURCE = path.join(root, 'missing-source');
  const runCommand = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'xcrun') return appPath;
    return values[args[1]] || '';
  };

  const environment = buildEnvironmentSummary({}, [{ udid: 'SIM-123', deviceName: 'iPhone 17' }], {
    runCommand,
  });

  assert.deepEqual(calls[0], [
    'xcrun',
    'simctl',
    'get_app_container',
    'SIM-123',
    'com.powerhrg.connect.v3.debug',
    'app',
  ]);
  assert.equal(environment.bundleId, 'com.powerhrg.connect.v3.debug');
  assert.equal(environment.appVersion, '9.8.7');
  assert.equal(environment.appBuild, '654');
  assert.equal(environment.appInstalled, true);
  if (originalSource === undefined) delete process.env.CONNECT_APP_SOURCE;
  else process.env.CONNECT_APP_SOURCE = originalSource;
  fs.rmSync(root, { recursive: true, force: true });
});

test('app identity never falls back to automation repository identity', () => {
  const original = {
    TEST_REPORT_BRANCH: process.env.TEST_REPORT_BRANCH,
    TEST_REPORT_COMMIT: process.env.TEST_REPORT_COMMIT,
    APP_BRANCH: process.env.APP_BRANCH,
    APP_COMMIT: process.env.APP_COMMIT,
    CONNECT_APP_SOURCE: process.env.CONNECT_APP_SOURCE,
  };
  delete process.env.TEST_REPORT_BRANCH;
  delete process.env.TEST_REPORT_COMMIT;
  delete process.env.APP_BRANCH;
  delete process.env.APP_COMMIT;
  process.env.CONNECT_APP_SOURCE = path.join(os.tmpdir(), 'connect-app-source-does-not-exist');
  try {
    const environment = buildEnvironmentSummary({}, []);
    assert.equal(environment.appBranch, '');
    assert.equal(environment.appCommit, '');
    assert.equal(environment.branch, '');
    assert.equal(environment.commit, '');
    assert.ok(environment.automationBranch);
    assert.ok(environment.automationCommit);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('app branch and commit are discovered read-only from CONNECT_APP_SOURCE', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-app-source-'));
  const originalSource = process.env.CONNECT_APP_SOURCE;
  const originalBranch = process.env.APP_BRANCH;
  const originalCommit = process.env.APP_COMMIT;
  const originalReportBranch = process.env.TEST_REPORT_BRANCH;
  const originalReportCommit = process.env.TEST_REPORT_COMMIT;
  process.env.CONNECT_APP_SOURCE = sourceRoot;
  delete process.env.APP_BRANCH;
  delete process.env.APP_COMMIT;
  delete process.env.TEST_REPORT_BRANCH;
  delete process.env.TEST_REPORT_COMMIT;
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ command, args, cwd: options?.cwd });
    if (command !== 'git') return '';
    return args.includes('--abbrev-ref') ? 'feature/app-under-test' : 'deed123';
  };
  try {
    const environment = buildEnvironmentSummary({}, [], { runCommand });
    assert.equal(environment.appBranch, 'feature/app-under-test');
    assert.equal(environment.appCommit, 'deed123');
    assert.deepEqual(
      calls.filter(call => call.command === 'git').map(call => call.cwd),
      [sourceRoot, sourceRoot]
    );
  } finally {
    if (originalSource === undefined) delete process.env.CONNECT_APP_SOURCE;
    else process.env.CONNECT_APP_SOURCE = originalSource;
    if (originalBranch === undefined) delete process.env.APP_BRANCH;
    else process.env.APP_BRANCH = originalBranch;
    if (originalCommit === undefined) delete process.env.APP_COMMIT;
    else process.env.APP_COMMIT = originalCommit;
    if (originalReportBranch === undefined) delete process.env.TEST_REPORT_BRANCH;
    else process.env.TEST_REPORT_BRANCH = originalReportBranch;
    if (originalReportCommit === undefined) delete process.env.TEST_REPORT_COMMIT;
    else process.env.TEST_REPORT_COMMIT = originalReportCommit;
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('LOCAL completeness excludes QA-only required tests', () => {
  const summary = freshSummary({
    coverage: [
      {
        name: 'LocalTest',
        feature: 'Local feature',
        classification: 'required',
        environments: ['ANY'],
        scheduled: true,
      },
      {
        name: 'QaTest',
        feature: 'QA feature',
        classification: 'required',
        environments: ['QA'],
        scheduled: false,
      },
    ],
  });
  const coverage = coverageForSummary(summary, { environment: 'LOCAL' });
  assert.equal(coverage.requiredTotal, 1);
  assert.equal(coverage.requiredScheduled, 1);
  assert.equal(coverage.requiredCompleted, 1);
  assert.equal(coverage.complete, true);
});

test('QA completeness requires QA-only tests to be scheduled and completed', () => {
  const summary = freshSummary({
    coverage: [
      {
        name: 'LocalTest',
        feature: 'Local feature',
        classification: 'required',
        environments: ['ANY'],
        scheduled: true,
      },
      {
        name: 'QaTest',
        feature: 'QA feature',
        classification: 'required',
        environments: ['QA'],
        scheduled: false,
      },
    ],
  });
  const coverage = coverageForSummary(summary, { environment: 'QA' });
  assert.equal(coverage.requiredTotal, 2);
  assert.equal(coverage.requiredScheduled, 1);
  assert.equal(coverage.requiredCompleted, 1);
  assert.equal(coverage.complete, false);
});

test('release evidence is READY only for fresh, identified, complete, conclusive runs', () => {
  const summary = freshSummary();
  const evidence = buildEvidenceDecision(summary, {
    now: Date.parse('2026-08-31T12:10:00.000Z'),
    environment: COMPLETE_APP_ENVIRONMENT,
  });
  assert.equal(evidence.decision, 'READY');
  assert.equal(evidence.appIdentityKnown, true);
  assert.equal(evidence.serverEnvironmentKnown, true);
});

test('optional skipped tests do not prevent READY evidence', () => {
  const summary = freshSummary({
    results: [
      { name: 'LocalTest', status: 'PASS' },
      { name: 'OptionalTest', status: 'SKIPPED' },
    ],
    coverage: [
      {
        name: 'LocalTest',
        feature: 'Local feature',
        classification: 'required',
        scheduled: true,
      },
      {
        name: 'OptionalTest',
        feature: 'Local feature',
        classification: 'opt-in',
        scheduled: true,
      },
    ],
  });
  const evidence = buildEvidenceDecision(summary, {
    now: Date.parse('2026-08-31T12:10:00.000Z'),
    environment: COMPLETE_APP_ENVIRONMENT,
  });
  assert.equal(evidence.decision, 'READY');
  assert.equal(statusForSummary(summary), 'PASS');
});

test('required skipped, blocked, and inconclusive outcomes cannot be READY', () => {
  const expected = {
    SKIPPED: 'INCOMPLETE',
    BLOCKED: 'NOT_READY',
    INCONCLUSIVE: 'INCONCLUSIVE',
  };
  for (const [status, decision] of Object.entries(expected)) {
    const summary = freshSummary({ results: [{ name: 'LocalTest', status }] });
    const evidence = buildEvidenceDecision(summary, {
      now: Date.parse('2026-08-31T12:10:00.000Z'),
      environment: COMPLETE_APP_ENVIRONMENT,
    });
    assert.equal(evidence.decision, decision, status);
  }
});

test('missing app identity, environment, or freshness prevents READY evidence', () => {
  const summary = freshSummary();
  assert.equal(
    buildEvidenceDecision(summary, {
      now: Date.parse('2026-08-31T12:10:00.000Z'),
      environment: { serverEnvironment: 'LOCAL' },
    }).decision,
    'INCOMPLETE'
  );
  for (const missingField of ['appBranch', 'appCommit']) {
    assert.equal(
      buildEvidenceDecision(summary, {
        now: Date.parse('2026-08-31T12:10:00.000Z'),
        environment: { ...COMPLETE_APP_ENVIRONMENT, [missingField]: '' },
      }).decision,
      'INCOMPLETE',
      missingField
    );
  }
  assert.equal(
    buildEvidenceDecision(summary, {
      now: Date.parse('2026-08-31T12:10:00.000Z'),
      environment: { ...COMPLETE_APP_ENVIRONMENT, serverEnvironment: '' },
    }).decision,
    'INCOMPLETE'
  );
  assert.equal(
    buildEvidenceDecision(summary, {
      now: Date.parse('2026-09-02T12:10:00.000Z'),
      environment: COMPLETE_APP_ENVIRONMENT,
    }).decision,
    'STALE'
  );
});

test('report retention removes old and excess archives while keeping newest immutable runs', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-report-retention-'));
  const archiveRoot = path.join(outputRoot, 'archive');
  fs.mkdirSync(archiveRoot);
  const timestamps = [
    ['old', '2026-01-01T00:00:00.000Z'],
    ['middle', '2026-08-20T00:00:00.000Z'],
    ['newest', '2026-08-30T00:00:00.000Z'],
  ];
  for (const [name, startedAt] of timestamps) {
    const dir = path.join(archiveRoot, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '_report-meta.json'), JSON.stringify({ startedAt }));
  }

  const retention = enforceReportRetention({
    outputRoot,
    maxArchives: 2,
    maxAgeDays: 30,
    now: Date.parse('2026-09-01T00:00:00.000Z'),
  });
  assert.deepEqual(
    retention.kept.map(dir => path.basename(dir)),
    ['newest', 'middle']
  );
  assert.deepEqual(retention.removed.map(dir => path.basename(dir)), ['old']);
  assert.equal(fs.existsSync(path.join(archiveRoot, 'newest')), true);
  assert.equal(fs.existsSync(path.join(archiveRoot, 'old')), false);
  fs.rmSync(outputRoot, { recursive: true, force: true });
});
