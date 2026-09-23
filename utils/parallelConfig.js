const path = require('path');
const { csv, integer, text } = require('./envConfig');
const { normalizePhaseTimings } = require('./reportWriter');

function logicalCategoriesFromEnv(env = process.env) {
  const source = text(env, 'PARALLEL_LOGICAL_CATEGORIES', '{}');
  try {
    const categories = JSON.parse(source);
    return categories && typeof categories === 'object' ? categories : {};
  } catch (error) {
    throw new Error(`PARALLEL_LOGICAL_CATEGORIES must be valid JSON: ${error.message}`);
  }
}

function resolveTests({ env = process.env, mainSuiteTests, standaloneTests }) {
  const requested = csv(env, 'PARALLEL_TESTS');
  if (!requested.length) return mainSuiteTests;
  if (requested.length === 1 && requested[0].toLowerCase() === 'all') return standaloneTests;
  return requested.map(test => test.replace(/^Tests\//, '').replace(/\.js$/, ''));
}

function makeRunId(env = process.env, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return text(env, 'PARALLEL_RUN_ID') || `parallel-${stamp}`;
}

function makeLanes(env = process.env) {
  const udids = csv(env, 'PARALLEL_UDIDS');
  const ports = csv(env, 'PARALLEL_APPIUM_PORTS');
  const deviceNames = csv(env, 'PARALLEL_DEVICE_NAMES');
  const workerRequested = integer(env, 'PARALLEL_WORKERS', 1, { min: 1 });
  const allowSharedDevice = text(env, 'PARALLEL_ALLOW_SHARED_DEVICE') === '1';
  const baseAppiumPort = integer(env, 'APPIUM_PORT', 4723, { min: 1 });
  const baseWdaPort = integer(env, 'WDA_LOCAL_PORT', 8100, { min: 1 });
  const baseDerivedDataPath = text(
    env,
    'WDA_DERIVED_DATA_PATH',
    path.join('/tmp', 'wda-connect-parallel')
  );

  let count = Math.max(workerRequested, udids.length, ports.length, deviceNames.length, 1);
  if (!allowSharedDevice && udids.length === 0 && deviceNames.length === 0 && count > 1) {
    console.warn(
      'runParallel: no PARALLEL_UDIDS or PARALLEL_DEVICE_NAMES set; limiting to 1 worker to avoid simulator collisions.'
    );
    count = 1;
  }

  return Array.from({ length: count }, (_, index) => ({
    index,
    udid: udids[index] || '',
    deviceName: deviceNames[index] || text(env, 'DEVICE_NAME') || text(env, 'IOS_DEVICE_NAME'),
    appiumPort: Number.parseInt(ports[index], 10) || baseAppiumPort + index,
    wdaLocalPort: baseWdaPort + index,
    derivedDataPath: `${baseDerivedDataPath}-${index}`,
    timings: normalizePhaseTimings(),
  }));
}

module.exports = { logicalCategoriesFromEnv, makeLanes, makeRunId, resolveTests };
