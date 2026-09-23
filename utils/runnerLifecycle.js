const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'SKIPPED', 'BLOCKED', 'INCONCLUSIVE']);

function resolveTestStatus(error, ownedResult) {
  if (error) {
    const errorStatus = String(error.status || '').toUpperCase();
    return RESULT_STATUSES.has(errorStatus) ? errorStatus : 'FAIL';
  }

  const returnedStatus = String(ownedResult?.status || '').toUpperCase();
  return RESULT_STATUSES.has(returnedStatus) ? returnedStatus : 'PASS';
}

function addPhaseTiming(timings, key, elapsedMs) {
  timings[key] = (timings[key] || 0) + Math.max(0, Math.round(elapsedMs));
}

async function measurePhase(timings, key, runPhase) {
  const started = performance.now();
  try {
    return await runPhase();
  } finally {
    addPhaseTiming(timings, key, performance.now() - started);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function spawnNodeChild(script, args = [], options = {}) {
  return spawn(process.execPath, [script, ...args], options);
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    let settled = false;

    child.once('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal });
    });
  });
}

function prefixOutput(stream, label, write = console.log) {
  let pending = '';
  stream.on('data', chunk => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      if (line) write(`[${label}] ${line}`);
    }
  });
  stream.on('end', () => {
    if (pending) write(`[${label}] ${pending}`);
  });
}

module.exports = {
  addPhaseTiming,
  measurePhase,
  prefixOutput,
  resolveTestStatus,
  sleep,
  spawnNodeChild,
  waitForChild,
};
