const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function validateRunId(value) {
  const runId = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    throw new Error(
      `Unsafe report run ID "${runId}". Use only letters, numbers, dots, underscores, and hyphens.`
    );
  }
  return runId;
}

const RUN_ID = validateRunId(process.env.PUBLISH_REPORT_RUN_ID || 'split3-combined');

function run(command, args, { allowFailure = false, capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  const status = result.status ?? (result.signal ? 1 : 0);
  if (status !== 0 && !allowFailure) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(status);
  }

  return capture ? { status, stdout: result.stdout || '', stderr: result.stderr || '' } : { status };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function gitHasStagedChanges() {
  const diff = run('git', ['diff', '--cached', '--quiet'], { allowFailure: true, capture: true });
  return diff.status !== 0;
}

function dirtyPublicationTargets(runId = RUN_ID) {
  const targets = [
    'index.html',
    'docs/index.html',
    'docs/generated/scribe/index.html',
    `docs/generated/scribe/${runId}`,
  ];
  const result = run('git', ['status', '--porcelain', '--untracked-files=all', '--', ...targets], {
    allowFailure: true,
    capture: true,
  });
  return result.stdout.trim();
}

function hasFreshCombinedSummary(startedAt, repoRoot = REPO_ROOT, runId = RUN_ID) {
  const runRoot = path.join(repoRoot, 'reports', 'runs', runId);
  return ['summary.json', 'summary.md'].some(file => {
    const summaryPath = path.join(runRoot, file);
    return fs.existsSync(summaryPath) && fs.statSync(summaryPath).mtimeMs >= startedAt - 1000;
  });
}

function main() {
  if (gitHasStagedChanges()) {
    console.error(
      '[publish-report] Refusing to start because Git already has staged changes. ' +
        'Commit or unstage them first so the report commit cannot include unrelated work.'
    );
    process.exitCode = 1;
    return;
  }

  const dirtyTargets = dirtyPublicationTargets();
  if (dirtyTargets) {
    console.error(
      '[publish-report] Refusing to overwrite or commit pre-existing Pages changes:\n' + dirtyTargets
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[publish-report] Running three-simulator split test for ${RUN_ID}`);
  const testStartedAt = Date.now();
  const test = run('node', ['Tests/runSplitParallel.js'], {
    allowFailure: true,
    env: {
      ...process.env,
      SPLIT_THIRD_ENABLED: '1',
      SPLIT_COMBINED_RUN_ID: RUN_ID,
      // Reused lane workers perform login on their persistent session. Keep the old
      // extra-session preflight available as an explicit diagnostic opt-in.
      SPLIT_LOGIN_PREFLIGHT: process.env.SPLIT_LOGIN_PREFLIGHT || '0',
    },
  });

  if (!hasFreshCombinedSummary(testStartedAt)) {
    console.error(
      '[publish-report] No fresh combined test summary was written; refusing to publish an older report.'
    );
    process.exitCode = test.status || 1;
    return;
  }

  console.log('[publish-report] Generating Scribe-style web report');
  run('npm', ['run', 'docs:scribe', '--', '--run', RUN_ID, '--archive', '0'], {
    env: { ...process.env, SCRIBE_NAV_TRACKED_ONLY: '1' },
  });

  const metaPath = path.join(REPO_ROOT, 'docs', 'generated', 'scribe', RUN_ID, '_report-meta.json');
  const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};
  const status = meta.status || (test.status === 0 ? 'PASS' : 'FAIL');
  const passed = meta.passed ?? '?';
  const total = meta.total ?? '?';
  const failed = meta.failed ?? '?';

  console.log('[publish-report] Staging GitHub Pages report files');
  run('git', [
    'add',
    '.nojekyll',
    'index.html',
    'docs/index.html',
    'docs/generated/scribe/index.html',
    `docs/generated/scribe/${RUN_ID}`,
  ]);

  if (!gitHasStagedChanges()) {
    console.log('[publish-report] No report changes to commit');
  } else {
    const message =
      process.env.PUBLISH_REPORT_COMMIT_MESSAGE ||
      `Update test report: ${status} (${passed}/${total} passed, ${failed} failed)`;
    run('git', ['commit', '-m', message]);
  }

  if (process.env.PUBLISH_REPORT_SKIP_PUSH === '1') {
    console.log('[publish-report] Skipping git push because PUBLISH_REPORT_SKIP_PUSH=1');
  } else {
    console.log('[publish-report] Pushing report update to GitHub Pages');
    run('git', ['push']);
  }

  console.log('[publish-report] Done');
  console.log('[publish-report] Pages URL: https://tonytran40.github.io/Connect-Apple-Testing/');

  if (test.status !== 0) {
    console.log(`[publish-report] Tests failed with exit code ${test.status}, but the failure report was still published.`);
    process.exitCode = test.status;
  }
}

if (require.main === module) {
  main();
}

module.exports = { dirtyPublicationTargets, hasFreshCombinedSummary, main, validateRunId };
