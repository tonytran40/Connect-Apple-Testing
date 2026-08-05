require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function argumentValue(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

function normalizeTestName(value) {
  return String(value || '')
    .replace(/^Tests\//, '')
    .replace(/\.js$/, '')
    .trim();
}

function positionalArguments() {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value.startsWith('--')) {
      index += 1;
      continue;
    }
    values.push(value);
  }
  return values;
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', code => resolve(code || 0));
  });
}

function reportUrl(runId) {
  return `http://localhost:5500/generated/scribe/${encodeURIComponent(runId)}/`;
}

function modeConfig() {
  const mode = argumentValue('mode') || 'parallel';
  const env = { ...process.env };

  if (mode === 'one') {
    const testName = normalizeTestName(positionalArguments()[0]);
    const testPath = path.join(REPO_ROOT, 'Tests', `${testName}.js`);
    if (!testName) {
      throw new Error('Usage: npm run test:one -- <testName>');
    }
    if (!fs.existsSync(testPath)) {
      throw new Error(`Test file not found: ${testPath}`);
    }

    const runId = env.PARALLEL_RUN_ID || `${testName}-latest`;
    return {
      runner: path.join(REPO_ROOT, 'Tests', 'runParallel.js'),
      runId,
      env: {
        ...env,
        PARALLEL_RUN_ID: runId,
        PARALLEL_TESTS: testName,
        PARALLEL_WORKERS: '1',
      },
    };
  }

  if (mode === 'split') {
    const thirdLane = env.SPLIT_THIRD_ENABLED === '1' || env.SPLIT_LANE_COUNT === '3';
    const runId = env.SPLIT_COMBINED_RUN_ID || (thirdLane ? 'split3-combined' : 'split-combined');
    return {
      runner: path.join(REPO_ROOT, 'Tests', 'runSplitParallel.js'),
      runId,
      env: {
        ...env,
        SPLIT_COMBINED_RUN_ID: runId,
      },
    };
  }

  if (mode === 'parallel') {
    const runId = env.PARALLEL_RUN_ID || 'parallel-latest';
    return {
      runner: path.join(REPO_ROOT, 'Tests', 'runParallel.js'),
      runId,
      env: {
        ...env,
        PARALLEL_RUN_ID: runId,
      },
    };
  }

  throw new Error(`Unknown report mode: ${mode}`);
}

async function main() {
  const { runner, runId, env } = modeConfig();
  const summaryPaths = [
    path.join(REPO_ROOT, 'reports', 'runs', runId, 'summary.json'),
    path.join(REPO_ROOT, 'reports', 'runs', runId, 'summary.md'),
  ];
  const startedAt = Date.now();

  console.log(`[test-report] Running ${path.basename(runner)} for ${runId}`);
  const testCode = await runNode(runner, [], env);

  // A runner can fail before writing a new summary (for example, Appium is offline).
  // Do not regenerate a report from an older run in that case.
  const summaryIsFresh = summaryPaths.some(
    summaryPath => fs.existsSync(summaryPath) && fs.statSync(summaryPath).mtimeMs >= startedAt - 1000
  );
  if (!summaryIsFresh) {
    console.error(`[test-report] No summary was written for ${runId}; report was not generated.`);
    process.exitCode = testCode || 1;
    return;
  }

  console.log(`[test-report] Generating browser report for ${runId}`);
  const reportCode = await runNode(
    path.join(REPO_ROOT, 'scripts', 'generateScribeDocs.js'),
    ['--run', runId],
    env
  );

  if (reportCode === 0) {
    console.log(`[test-report] Local report: ${reportUrl(runId)}`);
    console.log('[test-report] Start npm run docs:serve once if you want to view it in the browser.');
  }

  process.exitCode = testCode || reportCode;
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});
