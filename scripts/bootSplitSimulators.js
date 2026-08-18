require('dotenv').config();

const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');
const { DEFAULT_SIMULATOR_LANES, resolveLaneUdids } = require('../utils/simulatorConfig');
const { boundedInt } = require('../utils/uiActions');

const DEFAULT_LANES = DEFAULT_SIMULATOR_LANES;
const APP_LAUNCH_TIMEOUT_MS = boundedInt(process.env.SIMULATOR_APP_LAUNCH_TIMEOUT_MS, 45000, 5000, 120000);
const APP_LAUNCH_RETRY_MS = boundedInt(process.env.SIMULATOR_APP_LAUNCH_RETRY_MS, 1500, 250, 10000);
const BOOT_WAVE_SIZE = boundedInt(process.env.SIMULATOR_BOOT_CONCURRENCY, 1, 1, DEFAULT_LANES.length);
const BOOT_TIMEOUT_MS = boundedInt(process.env.SIMULATOR_BOOT_TIMEOUT_MS, 90000, 30000, 300000);

function envValue(name, fallback) {
  return process.env[name] || fallback;
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(command, args, { allowFailure = false, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs)
      : null;
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', error => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} ${args.join(' ')} timed out after ${Math.round(timeoutMs / 1000)}s`));
        return;
      }
      if (code === 0 || allowFailure) {
        resolve({ code, output: output.trim() });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed: ${output.trim() || `exit ${code}`}`));
    });
  });
}

function lanes() {
  return [
    { ...DEFAULT_LANES[0], udid: envValue('SPLIT_MAIN_UDID', '') },
    { ...DEFAULT_LANES[1], udid: envValue('SPLIT_STANDALONE_UDID', '') },
    { ...DEFAULT_LANES[2], udid: envValue('SPLIT_THIRD_UDID', '') },
  ];
}

async function launchAppWhenReady(lane, bundleId) {
  const deadline = Date.now() + APP_LAUNCH_TIMEOUT_MS;
  let lastOutput = '';
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    const result = await run('xcrun', ['simctl', 'launch', lane.udid, bundleId], { allowFailure: true });
    if (result.code === 0) {
      console.log(`[${lane.label}] Connect is open (attempt ${attempts})`);
      return;
    }

    lastOutput = result.output;
    const remainingMs = Math.max(0, deadline - Date.now());
    console.log(
      `[${lane.label}] Connect launch is not ready yet; retrying in ${APP_LAUNCH_RETRY_MS}ms ` +
        `(${Math.ceil(remainingMs / 1000)}s remaining)`
    );
    await pause(Math.min(APP_LAUNCH_RETRY_MS, remainingMs));
  }

  throw new Error(
    `[${lane.label}] Could not launch ${bundleId} after ${Math.round(APP_LAUNCH_TIMEOUT_MS / 1000)}s. ` +
      `The app may not be installed on this simulator. Last simctl output: ${lastOutput || 'none'}`
  );
}

async function startBoot(lane) {
  console.log(`[${lane.label}] starting boot ${lane.udid}`);
  // `boot` errors when a device is already running; readiness is confirmed later.
  await run('xcrun', ['simctl', 'boot', lane.udid], { allowFailure: true });
}

async function ensureSimulatorService() {
  const result = await run('xcrun', ['simctl', 'list', 'devices'], { allowFailure: true, timeoutMs: 10000 });
  if (result.code === 0) return;

  throw new Error(
    'CoreSimulatorService is not responding. Stop this command, then run: ' +
      'killall Simulator 2>/dev/null; ' +
      'killall -9 com.apple.CoreSimulator.CoreSimulatorService 2>/dev/null; ' +
      'open -a Simulator; ' +
      'xcrun simctl list devices'
  );
}

async function waitForLaneAndLaunch(lane, launchBundleId) {
  console.log(`[${lane.label}] waiting for iOS to finish booting`);
  await run('xcrun', ['simctl', 'bootstatus', lane.udid, '-b'], { timeoutMs: BOOT_TIMEOUT_MS });
  if (launchBundleId) {
    await launchAppWhenReady(lane, launchBundleId);
  } else {
    console.log(`[${lane.label}] ready`);
  }
}

async function runBoot() {
  const dryRun = process.env.SIMULATOR_BOOT_DRY_RUN === '1';
  const launchApp = process.env.SIMULATOR_BOOT_LAUNCH_APP !== '0';
  const bundleId = launchApp ? envValue('CONNECT_BUNDLE_ID', 'com.powerhrg.connect.v3.debug') : '';
  let selectedLanes = lanes();

  if (dryRun) {
    selectedLanes = selectedLanes.map(lane => ({
      ...lane,
      udid: lane.udid || `<auto:${lane.deviceName}>`,
    }));
    for (let start = 0; start < selectedLanes.length; start += BOOT_WAVE_SIZE) {
      const wave = selectedLanes.slice(start, start + BOOT_WAVE_SIZE);
      console.log(`[dry-run] boot wave ${Math.floor(start / BOOT_WAVE_SIZE) + 1}`);
      wave.forEach(lane => console.log(`[dry-run] xcrun simctl boot ${lane.udid}`));
      wave.forEach(lane => {
        console.log(`[dry-run] xcrun simctl bootstatus ${lane.udid} -b`);
        if (bundleId) console.log(`[dry-run] xcrun simctl launch ${lane.udid} ${bundleId}`);
      });
    }
    return;
  }

  await ensureSimulatorService();
  selectedLanes = resolveLaneUdids(selectedLanes);
  selectedLanes.forEach(lane => console.log(`[${lane.label}] selected ${lane.deviceName} (${lane.udid})`));
  const started = performance.now();
  for (let start = 0; start < selectedLanes.length; start += BOOT_WAVE_SIZE) {
    const wave = selectedLanes.slice(start, start + BOOT_WAVE_SIZE);
    console.log(`Starting boot wave ${Math.floor(start / BOOT_WAVE_SIZE) + 1}/${Math.ceil(selectedLanes.length / BOOT_WAVE_SIZE)} (${wave.map(lane => lane.label).join(', ')})`);
    // Default to one cold boot at a time. A higher value is opt-in for machines
    // with enough headroom to overlap CoreSimulator's expensive startup work.
    await Promise.all(wave.map(lane => startBoot(lane)));
    for (const lane of wave) {
      await waitForLaneAndLaunch(lane, bundleId);
    }
  }
  console.log(`All simulators ready in ${Math.round((performance.now() - started) / 1000)}s`);

  if (process.env.SIMULATOR_BOOT_OPEN_UI === '1') {
    spawnSync('open', ['-a', 'Simulator'], { stdio: 'ignore' });
  }
}

if (require.main === module) {
  runBoot().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}

module.exports = { runBoot };
