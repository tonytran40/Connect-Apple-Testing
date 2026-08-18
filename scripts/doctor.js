require('dotenv').config();

const http = require('http');
const { spawnSync } = require('child_process');
const { DEFAULT_SIMULATOR_LANES, resolveLaneUdids } = require('../utils/simulatorConfig');

const BUNDLE_ID = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';
const PORTS = [
  Number.parseInt(process.env.SPLIT_MAIN_APPIUM_PORT, 10) || 4723,
  Number.parseInt(process.env.SPLIT_STANDALONE_APPIUM_PORT, 10) || 4725,
  Number.parseInt(process.env.SPLIT_THIRD_APPIUM_PORT, 10) || 4727,
];

function appiumReady(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/status', timeout: 1500 }, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

function appInstalled(udid) {
  const result = spawnSync('xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID, 'app'], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

async function main() {
  const explicitUdids = [
    process.env.SPLIT_MAIN_UDID || '',
    process.env.SPLIT_STANDALONE_UDID || '',
    process.env.SPLIT_THIRD_UDID || '',
  ];
  const requested = DEFAULT_SIMULATOR_LANES.map((lane, index) => ({
    ...lane,
    udid: explicitUdids[index],
  }));
  const lanes = resolveLaneUdids(requested);
  let failed = false;

  console.log('Connect automation doctor');
  console.log(`Bundle: ${BUNDLE_ID}`);
  for (const [index, lane] of lanes.entries()) {
    const [portReady, installed] = await Promise.all([
      appiumReady(PORTS[index]),
      Promise.resolve(appInstalled(lane.udid)),
    ]);
    console.log(
      `${portReady && installed ? 'PASS' : 'WARN'} ${lane.label}: ${lane.deviceName} ${lane.udid} | ` +
        `Appium :${PORTS[index]} ${portReady ? 'ready' : 'offline'} | Connect ${installed ? 'installed' : 'missing'}`
    );
    failed ||= !installed;
  }

  const credentialsReady = Boolean(process.env.Connect_username && process.env.Connect_password);
  console.log(`${credentialsReady ? 'PASS' : 'WARN'} login credentials: ${credentialsReady ? 'configured' : 'missing from .env'}`);
  failed ||= !credentialsReady;

  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

module.exports = { appiumReady, appInstalled, main };
