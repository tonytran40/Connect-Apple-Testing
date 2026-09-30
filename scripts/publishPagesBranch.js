require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { archiveRunId } = require('./report/reportModel');
const { readJsonIfExists } = require('./report/reportFiles');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_BRANCH = 'gh-pages';
const DEFAULT_RUN_ID = 'split3-combined';

function safeToken(value, label) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) {
    throw new Error(`Unsafe ${label} "${token}"`);
  }
  return token;
}

function run(command, args, { cwd = REPO_ROOT, allowFailure = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: allowFailure ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  const status = result.status ?? (result.signal ? 1 : 0);
  if (status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${status}`);
  }
  return { status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function refExists(ref, { cwd = REPO_ROOT } = {}) {
  return run('git', ['show-ref', '--verify', '--quiet', ref], { cwd, allowFailure: true }).status === 0;
}

function remoteBranchExists(branch, { cwd = REPO_ROOT } = {}) {
  return run('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], {
    cwd,
    allowFailure: true,
  }).status === 0;
}

function worktreeAddArgs({ branch, directory, localExists, remoteExists }) {
  if (localExists) return ['worktree', 'add', directory, branch];
  if (remoteExists) {
    return ['worktree', 'add', '-b', branch, directory, `origin/${branch}`];
  }
  return ['worktree', 'add', '--orphan', '-b', branch, directory];
}

function createPagesWorktree({ branch, directory, repoRoot = REPO_ROOT }) {
  const localExists = refExists(`refs/heads/${branch}`, { cwd: repoRoot });
  const remoteExists = remoteBranchExists(branch, { cwd: repoRoot });
  if (!localExists && remoteExists) {
    run('git', ['fetch', 'origin', `${branch}:refs/remotes/origin/${branch}`], { cwd: repoRoot });
  }
  const args = worktreeAddArgs({ branch, directory, localExists, remoteExists });
  run('git', args, { cwd: repoRoot });
}

function hasStagedChanges(directory) {
  return run('git', ['diff', '--cached', '--quiet'], {
    cwd: directory,
    allowFailure: true,
  }).status !== 0;
}

function reportIdentity(report = {}) {
  return report.startedAt || report.updatedAt || '';
}

function archiveExistingLatest({ worktree, repoRoot = REPO_ROOT, runId }) {
  const latestDir = path.join(worktree, runId);
  const latestMetaPath = path.join(latestDir, '_report-meta.json');
  const previous = readJsonIfExists(latestMetaPath);
  const current = readJsonIfExists(path.join(repoRoot, 'reports', 'runs', runId, 'summary.json'));
  if (!previous || !current || reportIdentity(previous) === reportIdentity(current)) return null;

  const archiveDir = path.join(worktree, 'archive', archiveRunId(runId, previous));
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  if (fs.existsSync(archiveDir)) {
    fs.rmSync(latestDir, { recursive: true, force: true });
  } else {
    fs.renameSync(latestDir, archiveDir);
    fs.writeFileSync(
      path.join(archiveDir, '_report-meta.json'),
      `${JSON.stringify({ ...previous, reportType: 'archive' }, null, 2)}\n`,
      'utf8'
    );
  }
  return archiveDir;
}

function publishPagesBranch(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const branch = safeToken(options.branch || process.env.PUBLISH_PAGES_BRANCH || DEFAULT_BRANCH, 'Pages branch');
  const runId = safeToken(options.runId || process.env.PUBLISH_REPORT_RUN_ID || DEFAULT_RUN_ID, 'report run ID');
  const skipPush = options.skipPush ?? process.env.PUBLISH_REPORT_SKIP_PUSH === '1';
  const message = options.message || process.env.PUBLISH_REPORT_COMMIT_MESSAGE ||
    `Publish test report: ${runId}`;
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'connect-gh-pages-'));
  let registered = false;

  try {
    createPagesWorktree({ branch, directory: worktree, repoRoot });
    registered = true;
    archiveExistingLatest({ worktree, repoRoot, runId });

    run(process.execPath, [
      path.join(repoRoot, 'scripts', 'generateScribeDocs.js'),
      '--run', runId,
      '--out', worktree,
      '--archive', '0',
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        SCRIBE_DOC_OUTPUT_DIR: worktree,
        SCRIBE_NAV_TRACKED_ONLY: '0',
        SCRIBE_ARCHIVE_MAX_COUNT: process.env.PUBLISH_PAGES_MAX_ARCHIVES || '10',
      },
    });

    fs.writeFileSync(path.join(worktree, '.nojekyll'), '', 'utf8');
    run('git', ['add', '--all'], { cwd: worktree });

    if (!hasStagedChanges(worktree)) {
      console.log(`[publish-pages] ${branch} already contains this report`);
    } else {
      run('git', ['commit', '-m', message], { cwd: worktree });
    }

    if (skipPush) {
      console.log(`[publish-pages] Skipping push because PUBLISH_REPORT_SKIP_PUSH=1`);
    } else {
      run('git', ['push', '--set-upstream', 'origin', branch], { cwd: worktree });
      console.log(`[publish-pages] Published ${runId} to ${branch}`);
    }
  } finally {
    if (registered) {
      run('git', ['worktree', 'remove', '--force', worktree], {
        cwd: repoRoot,
        allowFailure: true,
      });
    } else {
      fs.rmSync(worktree, { recursive: true, force: true });
    }
  }

  return { branch, runId, skipPush };
}

if (require.main === module) {
  try {
    publishPagesBranch();
  } catch (error) {
    console.error(error?.stack || error);
    process.exit(1);
  }
}

module.exports = {
  archiveExistingLatest,
  createPagesWorktree,
  publishPagesBranch,
  reportIdentity,
  remoteBranchExists,
  safeToken,
  worktreeAddArgs,
};
