const { formatCommand } = require('./commands');
const {
  ProcessRegistry,
  appiumReady,
  ensureAppium,
  runForeground,
  waitForServiceStop,
} = require('./processes');

function phasePreview(phase) {
  if (phase.kind === 'appium') {
    return phase.ports.map(port => `health http://127.0.0.1:${port}/status; start appium --port ${port} if needed`);
  }
  if (phase.kind === 'appium-check') {
    return phase.ports.map(port => `require http://127.0.0.1:${port}/status`);
  }
  return [formatCommand(phase)];
}

function printPlan(plan, write = console.log) {
  write(`Profile: ${plan.profile}`);
  plan.phases.forEach((phase, index) => {
    write(`${index + 1}. ${phase.title}`);
    phasePreview(phase).forEach(line => write(`   ${line}`));
  });
}

async function requireAppium(ports, healthCheck) {
  for (const port of ports) {
    if (!(await healthCheck(port))) {
      throw new Error(
        `Appium is not responding on port ${port}. Remove --no-appium or start it separately.`
      );
    }
  }
}

async function runPlan(plan, options = {}) {
  const write = options.write || console.log;
  const registry = options.registry || new ProcessRegistry();
  const healthCheck = options.healthCheck || appiumReady;
  const runCommand = options.runCommand || runForeground;
  const waitService = options.waitForServiceStop || waitForServiceStop;
  const env = options.env || process.env;
  const cwd = options.cwd;

  printPlan(plan, write);
  if (options.dryRun) {
    write('Dry run complete. No simulators or processes were touched.');
    return 0;
  }

  let signalHandlers = null;
  try {
    let interrupted = false;
    const cleanupOnSignal = signal => {
      interrupted = true;
      write(`Received ${signal}; stopping owned processes...`);
      registry.stopAll(signal).catch(() => {});
    };
    signalHandlers = {
      SIGINT: () => cleanupOnSignal('SIGINT'),
      SIGTERM: () => cleanupOnSignal('SIGTERM'),
    };
    process.once('SIGINT', signalHandlers.SIGINT);
    process.once('SIGTERM', signalHandlers.SIGTERM);

    for (const phase of plan.phases) {
      if (interrupted) return 130;
      write(`\n[connect] ${phase.title}`);
      if (phase.kind === 'appium') {
        for (const port of phase.ports) {
          const result = await ensureAppium(port, { cwd, env, registry, healthCheck });
          write(`[connect] Appium :${port} ${result.owned ? 'started' : 'already healthy'}`);
        }
        continue;
      }
      if (phase.kind === 'appium-check') {
        await requireAppium(phase.ports, healthCheck);
        continue;
      }
      if (phase.kind === 'serve') {
        const child = registry.start(phase.command, phase.args, {
          cwd,
          env: { ...env, ...(phase.envOverrides || {}) },
          stdio: 'inherit',
        });
        write(`[connect] Report server: ${phase.url}`);
        write('[connect] Press Ctrl+C to stop the server.');
        const outcome = await waitService(child);
        if (outcome.type === 'signal') {
          if (!child.killed) child.kill(outcome.signal);
          return 0;
        }
        if (outcome.code !== 0) {
          throw new Error(
            `Report server exited with code ${outcome.code}. Port 5500 may already be in use.`
          );
        }
        return 0;
      }

      const code = await runCommand(phase, { cwd, env, registry });
      if (code !== 0) {
        write(`[connect] ${phase.title} failed with exit code ${code}`);
        return code;
      }
    }
    return 0;
  } finally {
    if (signalHandlers) {
      process.removeListener('SIGINT', signalHandlers.SIGINT);
      process.removeListener('SIGTERM', signalHandlers.SIGTERM);
    }
    await registry.stopAll();
  }
}

module.exports = { phasePreview, printPlan, requireAppium, runPlan };
