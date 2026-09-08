const test = require('node:test');
const assert = require('node:assert/strict');

const appointmentCards = require('../Tests/AppointmentCards');

test('appointmentIdFromMessage follows the app A#<digits> matcher', () => {
  assert.equal(appointmentCards.appointmentIdFromMessage('QA fixture A#123456 ready'), '123456');
  assert.equal(appointmentCards.appointmentIdFromMessage('prefixA#42_suffix'), '42');
  assert.equal(appointmentCards.appointmentIdFromMessage('no appointment'), '');
});

test('AppointmentCards validates deterministic room, message, and business detail', () => {
  assert.deepEqual(
    appointmentCards.validateAppointmentFixture({
      CONNECT_SERVER_NAME: 'QA',
      APPOINTMENT_CARD_ENABLED: '1',
      APPOINTMENT_CARD_ROOM_NAME: 'QA Appointment Fixtures',
      APPOINTMENT_CARD_MESSAGE: 'A#123456',
      APPOINTMENT_CARD_EXPECTED_DETAIL: 'H#654321',
    }),
    {
      serverName: 'QA',
      roomName: 'QA Appointment Fixtures',
      message: 'A#123456',
      expectedDetail: 'H#654321',
      appointmentId: '123456',
    }
  );
});

test('AppointmentCards blocks when fixture configuration is absent', () => {
  assert.throws(
    () => appointmentCards.validateAppointmentFixture({
      CONNECT_SERVER_NAME: 'QA',
      APPOINTMENT_CARD_ENABLED: '1',
    }),
    error => error.code === 'TEST_BLOCKED' && /APPOINTMENT_CARD_ROOM_NAME/.test(error.message)
  );
});

test('AppointmentCards is QA-only and explicitly opt-in', () => {
  assert.throws(
    () => appointmentCards.validateAppointmentFixture({
      CONNECT_SERVER_NAME: 'LOCAL',
      APPOINTMENT_CARD_ENABLED: '1',
    }),
    error => error.status === 'BLOCKED' && /QA-only/.test(error.message)
  );
  assert.throws(
    () => appointmentCards.validateAppointmentFixture({ CONNECT_SERVER_NAME: 'QA' }),
    error => error.status === 'BLOCKED' && /opt-in/.test(error.message)
  );
});

test('AppointmentCards blocks a message without the source-backed appointment pattern', () => {
  assert.throws(
    () => appointmentCards.validateAppointmentFixture({
      CONNECT_SERVER_NAME: 'QA',
      APPOINTMENT_CARD_ENABLED: 'true',
      APPOINTMENT_CARD_ROOM_NAME: 'QA Appointment Fixtures',
      APPOINTMENT_CARD_MESSAGE: 'appointment 123456',
      APPOINTMENT_CARD_EXPECTED_DETAIL: 'H#654321',
    }),
    error => error.status === 'BLOCKED' && /A#<digits>/.test(error.message)
  );
});

test('AppointmentCards rejects the appointment link as the only detail assertion', () => {
  assert.throws(
    () => appointmentCards.validateAppointmentFixture({
      CONNECT_SERVER_NAME: 'QA',
      APPOINTMENT_CARD_ENABLED: 'true',
      APPOINTMENT_CARD_ROOM_NAME: 'QA Appointment Fixtures',
      APPOINTMENT_CARD_MESSAGE: 'A#123456',
      APPOINTMENT_CARD_EXPECTED_DETAIL: 'Est Appt 123456',
    }),
    error => error.code === 'TEST_BLOCKED' && /business detail/.test(error.message)
  );
});

test('AppointmentCards reports a missing configured card as BLOCKED', async () => {
  const driver = {
    $$: async () => [],
    execute: async () => {},
    pause: async () => {},
  };

  await assert.rejects(
    () => appointmentCards.waitForLoadedAppointmentCard(driver, {
      roomName: 'QA Appointment Fixtures',
      appointmentId: '123456',
    }, 1),
    error => error.status === 'BLOCKED' && /was not present/.test(error.message)
  );
});

test('AppointmentCards exposes direct and suite entry points', () => {
  assert.equal(typeof appointmentCards.run, 'function');
  assert.equal(typeof appointmentCards.runTest, 'function');
});
