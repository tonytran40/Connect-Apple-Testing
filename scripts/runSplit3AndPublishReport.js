const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUN_ID = process.env.PUBLISH_REPORT_RUN_ID || 'split3-combined';

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

  const status = result.status || 0;
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

function main() {
  console.log(`[publish-report] Running three-simulator split test for ${RUN_ID}`);
  const test = run('node', ['Tests/runSplitParallel.js'], {
    allowFailure: true,
    env: {
      ...process.env,
      SPLIT_THIRD_ENABLED: '1',
      SPLIT_COMBINED_RUN_ID: RUN_ID,
    },
  });

  console.log('[publish-report] Generating Scribe-style web report');
  run('npm', ['run', 'docs:scribe', '--', '--run', RUN_ID]);

  const metaPath = path.join(REPO_ROOT, 'docs', 'generated', 'scribe', RUN_ID, '_report-meta.json');
  const meta = fs.existsSync(metaPath) ? readJson(metaPath) : {};
  const status = meta.status || (test.status === 0 ? 'PASS' : 'FAIL');
  const passed = meta.passed ?? '?';
  const total = meta.total ?? '?';
  const failed = meta.failed ?? '?';

  console.log('[publish-report] Staging GitHub Pages report files');
  run('git', ['add', '.nojekyll', 'index.html', 'docs']);

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

main();
