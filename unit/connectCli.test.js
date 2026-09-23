const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { main } = require('../scripts/connect');
const { parseArguments } = require('../scripts/orchestrator/arguments');
const { formatCommand } = require('../scripts/orchestrator/commands');
const { buildPlan } = require('../scripts/orchestrator/plan');
const { ProcessRegistry, waitForServiceStop } = require('../scripts/orchestrator/processes');
const { runPlan } = require('../scripts/orchestrator/run');

const REPO_ROOT = path.resolve(__dirname, '..');

test('help succeeds without building a plan or touching a simulator', async () => {
  let ran = false;
  const code = await main(['--help'], {
    runPlan: async () => {
      ran = true;
      return 0;
    },
  });
  assert.equal(code, 0);
  assert.equal(ran, false);
});

test('single profile requires exactly one test', () => {
  assert.throws(() => parseArguments(['single']), /requires a test name/);
  assert.equal(parseArguments(['single', 'Reactions']).testName, 'Reactions');
  assert.throws(() => parseArguments(['single', 'One', 'Two']), /only one test name/);
});

test('split3 QA plan carries QA and three-lane environment', () => {
  const options = parseArguments(['split3-qa', '--run-id', 'qa-smoke', '--no-appium']);
  const plan = buildPlan(options, { repoRoot: REPO_ROOT, env: {} });
  assert.deepEqual(plan.ports, [4723, 4725, 4727]);
  assert.equal(plan.phases[0].kind, 'appium-check');
  const run = plan.phases[1];
  assert.deepEqual(run.envOverrides, {
    SPLIT_THIRD_ENABLED: '1',
    CONNECT_SERVER_NAME: 'QA',
    SPLIT_COMBINED_RUN_ID: 'qa-smoke',
  });
  assert.match(formatCommand(run), /runAndGenerateReport\.js --mode split/);
});

test('publish uses the existing publisher and does not add a second test phase', () => {
  const options = parseArguments(['split3', '--publish', '--run-id', 'release-run']);
  const plan = buildPlan(options, { repoRoot: REPO_ROOT, env: {} });
  const commandPhases = plan.phases.filter(phase => phase.kind === 'command');
  assert.equal(commandPhases.length, 1);
  assert.match(commandPhases[0].args[0], /runSplit3AndPublishReport\.js$/);
  assert.equal(commandPhases[0].envOverrides.PUBLISH_REPORT_RUN_ID, 'release-run');
});

test('dry-run prints all phases without invoking health checks or commands', async () => {
  const options = parseArguments(['single', 'Reactions', '--prepare', '--serve', '--dry-run']);
  const plan = buildPlan(options, { repoRoot: REPO_ROOT, env: {} });
  const lines = [];
  let healthChecks = 0;
  let commands = 0;
  const code = await runPlan(plan, {
    cwd: REPO_ROOT,
    dryRun: true,
    write: line => lines.push(line),
    healthCheck: async () => {
      healthChecks += 1;
      return false;
    },
    runCommand: async () => {
      commands += 1;
      return 0;
    },
  });
  assert.equal(code, 0);
  assert.equal(healthChecks, 0);
  assert.equal(commands, 0);
  assert.match(lines.join('\n'), /Prepare simulators/);
  assert.match(lines.join('\n'), /appium --port 4723/);
  assert.match(lines.join('\n'), /runAndGenerateReport\.js --mode one Reactions/);
  assert.match(lines.join('\n'), /No simulators or processes were touched/);
});

test('unsafe run IDs and unsupported single publishing are rejected', () => {
  assert.throws(
    () => buildPlan(parseArguments(['split3', '--run-id', '../outside']), { repoRoot: REPO_ROOT }),
    /Unsafe run ID/
  );
  assert.throws(() => parseArguments(['single', 'Reactions', '--publish']), /only for split3/);
});

test('process registry terminates only children it owns', async () => {
  const killed = [];
  const listeners = {};
  const child = {
    killed: false,
    once(event, listener) {
      listeners[event] = listener;
    },
    kill(signal) {
      this.killed = true;
      killed.push(signal);
    },
  };
  const registry = new ProcessRegistry({ spawnProcess: () => child });
  registry.start('appium', ['--port', '4723']);
  await registry.stopAll();
  assert.deepEqual(killed, ['SIGTERM']);
});

test('report service wait returns when the child exits instead of hanging', async () => {
  const listeners = new Map();
  const child = {
    once(event, listener) {
      listeners.set(event, listener);
    },
    removeListener(event) {
      listeners.delete(event);
    },
  };
  const stopped = waitForServiceStop(child);
  listeners.get('close')(48);
  assert.deepEqual(await stopped, { type: 'exit', code: 48 });
});
