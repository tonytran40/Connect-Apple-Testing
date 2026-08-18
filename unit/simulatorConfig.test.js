const test = require('node:test');
const assert = require('node:assert/strict');

const { chooseSimulator, resolveLaneUdids } = require('../utils/simulatorConfig');

const devices = [
  { name: 'iPhone 17 Pro', udid: 'shutdown-pro', state: 'Shutdown' },
  { name: 'iPhone 17 Pro', udid: 'booted-pro', state: 'Booted' },
  { name: 'iPhone 17', udid: 'phone-17', state: 'Shutdown' },
];

test('chooseSimulator prefers an already booted matching device', () => {
  assert.equal(chooseSimulator(devices, 'iPhone 17 Pro').udid, 'booted-pro');
});

test('resolveLaneUdids assigns distinct devices and preserves explicit overrides', () => {
  const lanes = resolveLaneUdids(
    [
      { label: 'main', deviceName: 'iPhone 17 Pro', udid: 'shutdown-pro' },
      { label: 'view', deviceName: 'iPhone 17', udid: '' },
    ],
    { devices }
  );
  assert.deepEqual(lanes.map(lane => lane.udid), ['shutdown-pro', 'phone-17']);
});

test('resolveLaneUdids rejects duplicate assignments', () => {
  assert.throws(
    () =>
      resolveLaneUdids(
        [
          { label: 'one', deviceName: 'iPhone 17 Pro', udid: 'booted-pro' },
          { label: 'two', deviceName: 'iPhone 17 Pro', udid: 'booted-pro' },
        ],
        { devices }
      ),
    /more than one lane/
  );
});

test('resolveLaneUdids rejects an unavailable explicit simulator', () => {
  assert.throws(
    () => resolveLaneUdids([{ label: 'missing', deviceName: 'iPhone 17', udid: 'unknown' }], { devices }),
    /is not available/
  );
});

test('resolveLaneUdids rejects a missing named simulator', () => {
  assert.throws(
    () => resolveLaneUdids([{ label: 'missing', deviceName: 'iPhone Mini', udid: '' }], { devices }),
    /No available, unassigned simulator/
  );
});

test('resolveLaneUdids does not automatically assign one simulator twice', () => {
  assert.throws(
    () =>
      resolveLaneUdids(
        [
          { label: 'one', deviceName: 'iPhone 17', udid: '' },
          { label: 'two', deviceName: 'iPhone 17', udid: '' },
        ],
        { devices }
      ),
    /No available, unassigned simulator/
  );
});
