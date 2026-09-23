const path = require('path');

const { validateRunId } = require('./commands');

const DEFAULT_PORTS = Object.freeze([4723, 4725, 4727]);

function integerPort(value, fallback) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function appiumPorts(profile, env) {
  if (profile === 'single') {
    return [integerPort(env.APPIUM_PORT, DEFAULT_PORTS[0])];
  }
  return [
    integerPort(env.SPLIT_MAIN_APPIUM_PORT, DEFAULT_PORTS[0]),
    integerPort(env.SPLIT_STANDALONE_APPIUM_PORT, DEFAULT_PORTS[1]),
    integerPort(env.SPLIT_THIRD_APPIUM_PORT, DEFAULT_PORTS[2]),
  ];
}

function runEnvironment(options) {
  const env = {};
  const runId = validateRunId(options.runId);
  if (options.profile !== 'single') env.SPLIT_THIRD_ENABLED = '1';
  if (options.profile === 'split3-qa') env.CONNECT_SERVER_NAME = 'QA';

  if (runId) {
    if (options.publish) env.PUBLISH_REPORT_RUN_ID = runId;
    else if (options.profile === 'single') env.PARALLEL_RUN_ID = runId;
    else env.SPLIT_COMBINED_RUN_ID = runId;
  }
  return env;
}

function buildRunCommand(options, repoRoot) {
  const envOverrides = runEnvironment(options);
  if (options.publish) {
    return {
      title: 'Run tests, generate report, and publish',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'runSplit3AndPublishReport.js')],
      envOverrides,
    };
  }

  const args = [
    path.join(repoRoot, 'scripts', 'runAndGenerateReport.js'),
    '--mode',
    options.profile === 'single' ? 'one' : 'split',
  ];
  if (options.profile === 'single') args.push(options.testName);
  return {
    title: 'Run tests and generate report',
    command: process.execPath,
    args,
    envOverrides,
  };
}

function buildPlan(options, { repoRoot, env = process.env } = {}) {
  if (!repoRoot) throw new Error('buildPlan requires repoRoot');
  const phases = [];
  if (options.prepare) {
    phases.push({
      kind: 'command',
      title: 'Prepare simulators',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'bootSplitSimulators.js')],
      envOverrides: {},
    });
  }

  const ports = appiumPorts(options.profile, env);
  if (options.appium) {
    phases.push({ kind: 'appium', title: 'Check or start Appium', ports });
  } else {
    phases.push({ kind: 'appium-check', title: 'Check Appium', ports });
  }

  phases.push({ kind: 'command', ...buildRunCommand(options, repoRoot) });
  if (options.serve) {
    phases.push({
      kind: 'serve',
      title: 'Serve generated reports',
      command: 'python3',
      args: ['-m', 'http.server', '5500', '--directory', 'docs'],
      envOverrides: {},
      url: 'http://localhost:5500/',
    });
  }

  return { profile: options.profile, ports, phases };
}

module.exports = { appiumPorts, buildPlan, buildRunCommand, runEnvironment };
