require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const {
  ensureRoomsSectionReady,
  runWithOptionalDriver,
  waitForConversationRow,
} = require('../utils/testSession');
const { escapePredicateString } = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 30000;
const TEST_NAME = 'AppointmentCards';

class BlockedTestError extends Error {
  constructor(reason) {
    super(`BLOCKED: ${reason}`);
    this.name = 'BlockedTestError';
    this.code = 'TEST_BLOCKED';
    this.status = 'BLOCKED';
  }
}

function booleanEnv(value) {
  return ['1', 'true'].includes(String(value || '').trim().toLowerCase());
}

function appointmentIdFromMessage(message) {
  const match = String(message || '').match(/A#(\d+)(?=\D|$)/i);
  return match ? match[1] : '';
}

function validateAppointmentFixture(env = process.env) {
  const serverName = String(env.CONNECT_SERVER_NAME || '').trim();
  if (serverName.toLowerCase() !== 'qa') {
    throw new BlockedTestError(
      `Appointment Card automation is QA-only; CONNECT_SERVER_NAME was "${serverName || 'unset'}"`
    );
  }
  if (!booleanEnv(env.APPOINTMENT_CARD_ENABLED)) {
    throw new BlockedTestError(
      'Appointment Card automation is opt-in; set APPOINTMENT_CARD_ENABLED=1'
    );
  }

  const roomName = String(env.APPOINTMENT_CARD_ROOM_NAME || '').trim();
  const message = String(env.APPOINTMENT_CARD_MESSAGE || '').trim();
  const expectedDetail = String(env.APPOINTMENT_CARD_EXPECTED_DETAIL || '').trim();
  const missing = [];
  if (!roomName) missing.push('APPOINTMENT_CARD_ROOM_NAME');
  if (!message) missing.push('APPOINTMENT_CARD_MESSAGE');
  if (!expectedDetail) missing.push('APPOINTMENT_CARD_EXPECTED_DETAIL');
  if (missing.length) {
    throw new BlockedTestError(`Missing deterministic appointment fixture: ${missing.join(', ')}`);
  }

  const appointmentId = appointmentIdFromMessage(message);
  if (!appointmentId) {
    throw new BlockedTestError(
      'APPOINTMENT_CARD_MESSAGE must contain the source-backed appointment pattern A#<digits>'
    );
  }
  if (expectedDetail === `Est Appt ${appointmentId}`) {
    throw new BlockedTestError(
      'APPOINTMENT_CARD_EXPECTED_DETAIL must be a business detail, not the appointment link itself'
    );
  }

  return { serverName, roomName, message, expectedDetail, appointmentId };
}

function visibleTextSelector(text, exact = false) {
  const safe = escapePredicateString(text);
  const comparison = exact ? '==' : 'CONTAINS';
  return (
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
    'type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeOther") AND ' +
    `(name ${comparison} "${safe}" OR label ${comparison} "${safe}")`
  );
}

async function firstVisible(driver, selector) {
  const elements = await driver.$$(selector).catch(() => []);
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return null;
}

async function waitForLoadedAppointmentCard(driver, fixture, timeout = DEFAULT_TIMEOUT) {
  const linkText = `Est Appt ${fixture.appointmentId}`;
  const failedText = `Failed to load appointment ${fixture.appointmentId}`;
  const missingText = `Appt with ID#${fixture.appointmentId}`;
  const deadline = Date.now() + timeout;
  let lastScrollAt = 0;

  while (Date.now() < deadline) {
    const link = await firstVisible(driver, visibleTextSelector(linkText, true));
    if (link) return link;

    if (await firstVisible(driver, visibleTextSelector(missingText))) {
      throw new BlockedTestError(
        `Appointment fixture A#${fixture.appointmentId} does not exist in ${fixture.roomName}`
      );
    }
    if (await firstVisible(driver, visibleTextSelector(failedText))) {
      throw new Error(`Appointment A#${fixture.appointmentId} failed to load`);
    }

    if (Date.now() - lastScrollAt > 1200) {
      await driver.execute('mobile: scroll', { direction: 'up' }).catch(() => {});
      lastScrollAt = Date.now();
    }
    await driver.pause(200);
  }

  throw new BlockedTestError(
    `Appointment fixture A#${fixture.appointmentId} was not present in "${fixture.roomName}"`
  );
}

async function waitForAppointmentDetail(driver, fixture, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  const selector = visibleTextSelector(fixture.expectedDetail);
  while (Date.now() < deadline) {
    const detail = await firstVisible(driver, selector);
    if (detail) return detail;
    await driver.pause(175);
  }
  throw new Error(
    `Appointment A#${fixture.appointmentId} did not display configured detail ` +
      `"${fixture.expectedDetail}"`
  );
}

async function runTest(driver, options = {}) {
  const fixture = options.fixture || validateAppointmentFixture(options.env || process.env);

  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }
  await ensureRoomsSectionReady(driver);

  const { el: room } = await waitForConversationRow(driver, fixture.roomName, {
    exact: true,
    timeout: DEFAULT_TIMEOUT,
  });
  await room.click();

  const appointmentLink = await waitForLoadedAppointmentCard(driver, fixture);
  await appointmentLink.waitForDisplayed({ timeout: DEFAULT_TIMEOUT });
  await waitForAppointmentDetail(driver, fixture);
  await saveScreenshot(driver, TEST_NAME, '01_appointment_card_loaded.png');

  return {
    notes:
      `Opened ${fixture.roomName}; appointment A#${fixture.appointmentId} rendered ` +
      `with detail "${fixture.expectedDetail}"`,
  };
}

async function run(driver, options = {}) {
  const fixture = options.fixture || validateAppointmentFixture(options.env || process.env);
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, { ...options, fixture });
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = {
  BlockedTestError,
  appointmentIdFromMessage,
  booleanEnv,
  run,
  runTest,
  validateAppointmentFixture,
  visibleTextSelector,
  waitForLoadedAppointmentCard,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
