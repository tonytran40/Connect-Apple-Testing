require('dotenv').config();

const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const DEFAULT_LANES = [
  { label: 'main-suite', udid: 'A848480F-1933-47A5-B063-DB070BB3AC66' },
  { label: 'Conversation-List', udid: 'B5A3CFF9-F618-411B-91FC-92C8FDD0D069' },
  { label: 'ConversationView', udid: '0244243B-055B-4FAE-8AF8-61FC1486248C' },
];

function envValue(name, fallback) {
  return process.env[name] || fallback;
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

async function bootLane(lane, launchBundleId) {
  console.log(`[${lane.label}] booting ${lane.udid}`);
  // `boot` errors when a device is already running; `bootstatus -b` confirms readiness either way.
  await run('xcrun', ['simctl', 'boot', lane.udid], { allowFailure: true });
  await run('xcrun', ['simctl', 'bootstatus', lane.udid, '-b']);

  if (launchBundleId) {
    await run('xcrun', ['simctl', 'launch', lane.udid, launchBundleId]);
  }
  console.log(`[${lane.label}] ready${launchBundleId ? ' and Connect is open' : ''}`);
}

async function runBoot() {
  const dryRun = process.env.SIMULATOR_BOOT_DRY_RUN === '1';
  const launchApp = process.env.SIMULATOR_BOOT_LAUNCH_APP !== '0';
  const bundleId = launchApp ? envValue('CONNECT_BUNDLE_ID', 'com.powerhrg.connect.v3.debug') : '';
  const selectedLanes = lanes();

  if (dryRun) {
    selectedLanes.forEach(lane => console.log(`[dry-run] xcrun simctl bootstatus ${lane.udid} -b`));
    return;
  }

  const started = performance.now();
  await Promise.all(selectedLanes.map(lane => bootLane(lane, bundleId)));
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
