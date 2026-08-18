const { spawnSync } = require('child_process');

const DEFAULT_SIMULATOR_LANES = Object.freeze([
  Object.freeze({ key: 'main', label: 'main-suite', deviceName: 'iPhone 17 Pro' }),
  Object.freeze({ key: 'standalone', label: 'Conversation-List', deviceName: 'iPhone 17 Pro Max' }),
  Object.freeze({ key: 'third', label: 'ConversationView', deviceName: 'iPhone 17' }),
]);

function readAvailableSimulators(run = spawnSync) {
  const result = run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not list available simulators: ${(result.stderr || result.stdout || '').trim()}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Could not parse simctl device output: ${error.message}`);
  }

  return Object.values(parsed.devices || {})
    .flat()
    .filter(device => device && device.isAvailable !== false && device.udid && device.name);
}

function chooseSimulator(devices, deviceName, usedUdids = new Set()) {
  const matches = devices.filter(
    device => device.name === deviceName && !usedUdids.has(device.udid)
  );
  if (!matches.length) {
    throw new Error(
      `No available, unassigned simulator named "${deviceName}" was found. ` +
        'Create one in Xcode or set the matching SPLIT_*_UDID environment variable.'
    );
  }

  return matches.find(device => device.state === 'Booted') || matches[0];
}

function resolveLaneUdids(lanes, options = {}) {
  const devices = options.devices || readAvailableSimulators(options.run);
  const usedUdids = new Set();

  return lanes.map(lane => {
    let udid = String(lane.udid || '').trim();
    if (udid) {
      if (usedUdids.has(udid)) {
        throw new Error(`Simulator ${udid} is assigned to more than one lane`);
      }
      const known = devices.find(device => device.udid === udid);
      if (!known) {
        throw new Error(`Configured simulator ${udid} for ${lane.label} is not available`);
      }
    } else {
      udid = chooseSimulator(devices, lane.deviceName, usedUdids).udid;
    }

    usedUdids.add(udid);
    return { ...lane, udid };
  });
}

module.exports = {
  DEFAULT_SIMULATOR_LANES,
  chooseSimulator,
  readAvailableSimulators,
  resolveLaneUdids,
};
