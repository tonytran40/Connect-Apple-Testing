const http = require('http');
const { spawn } = require('child_process');

function appiumReady(port, timeoutMs = 1200) {
  return new Promise(resolve => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: '/status', timeout: timeoutMs },
      response => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 500);
      }
    );
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ProcessRegistry {
  constructor({ spawnProcess = spawn } = {}) {
    this.spawnProcess = spawnProcess;
    this.children = new Set();
  }

  start(command, args, options = {}) {
    const child = this.spawnProcess(command, args, options);
    this.children.add(child);
    const remove = () => this.children.delete(child);
    child.once('close', remove);
    child.once('error', remove);
    return child;
  }

  async stopAll(signal = 'SIGTERM') {
    const children = [...this.children];
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
    this.children.clear();
  }
}

function runForeground(command, { cwd, env, registry }) {
  return new Promise((resolve, reject) => {
    const child = registry.start(command.command, command.args || [], {
      cwd,
      env: { ...env, ...(command.envOverrides || {}) },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

async function waitForAppium(port, child, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const pollMs = options.pollMs || 400;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await (options.healthCheck || appiumReady)(port)) return;
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(`Appium on port ${port} exited before becoming healthy`);
    }
    await pause(pollMs);
  }
  throw new Error(`Appium on port ${port} did not become healthy within ${timeoutMs}ms`);
}

async function ensureAppium(port, { cwd, env, registry, healthCheck = appiumReady } = {}) {
  if (await healthCheck(port)) return { owned: false, child: null };
  const child = registry.start('appium', ['--port', String(port)], {
    cwd,
    env,
    stdio: 'inherit',
  });
  await waitForAppium(port, child, { healthCheck });
  return { owned: true, child };
}

function waitForServiceStop(child) {
  return new Promise(resolve => {
    const finish = outcome => {
      child.removeListener('close', onClose);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      resolve(outcome);
    };
    const onClose = code => finish({ type: 'exit', code: Number.isInteger(code) ? code : 1 });
    const onSigint = () => finish({ type: 'signal', signal: 'SIGINT' });
    const onSigterm = () => finish({ type: 'signal', signal: 'SIGTERM' });
    child.once('close', onClose);
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
  });
}

module.exports = {
  ProcessRegistry,
  appiumReady,
  ensureAppium,
  runForeground,
  waitForAppium,
  waitForServiceStop,
};
