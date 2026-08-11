require('dotenv').config();

const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const DEFAULT_LANES = [
  { label: 'main-suite', udid: 'A848480F-1933-47A5-B063-DB070BB3AC66' },
  { label: 'Conversation-List', udid: 'B5A3CFF9-F618-411B-91FC-92C8FDD0D069' },
  { label: 'ConversationView', udid: '0244243B-055B-4FAE-8AF8-61FC1486248C' },
];
const APP_LAUNCH_TIMEOUT_MS = boundedInt(process.env.SIMULATOR_APP_LAUNCH_TIMEOUT_MS, 45000, 5000, 120000);
const APP_LAUNCH_RETRY_MS = boundedInt(process.env.SIMULATOR_APP_LAUNCH_RETRY_MS, 1500, 250, 10000);

function envValue(name, fallback) {
  return process.env[name] || fallback;
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const selected = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, selected));
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => {
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
    { ...DEFAULT_LANES[0], udid: envValue('SPLIT_MAIN_UDID', DEFAULT_LANES[0].udid) },
    { ...DEFAULT_LANES[1], udid: envValue('SPLIT_STANDALONE_UDID', DEFAULT_LANES[1].udid) },
    { ...DEFAULT_LANES[2], udid: envValue('SPLIT_THIRD_UDID', DEFAULT_LANES[2].udid) },
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

async function bootLane(lane, launchBundleId) {
  console.log(`[${lane.label}] booting ${lane.udid}`);
  // `boot` errors when a device is already running; `bootstatus -b` confirms readiness either way.
  await run('xcrun', ['simctl', 'boot', lane.udid], { allowFailure: true });
  await run('xcrun', ['simctl', 'bootstatus', lane.udid, '-b']);
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
  const selectedLanes = lanes();

  if (dryRun) {
    selectedLanes.forEach(lane => {
      console.log(`[dry-run] xcrun simctl boot ${lane.udid}`);
      console.log(`[dry-run] xcrun simctl bootstatus ${lane.udid} -b`);
      if (bundleId) console.log(`[dry-run] xcrun simctl launch ${lane.udid} ${bundleId}`);
    });
    return;
  }

  const started = performance.now();
  for (const lane of selectedLanes) {
    // CoreSimulator is more stable when cold simulator boot and app launch happen one lane at a time.
    await bootLane(lane, bundleId);
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
