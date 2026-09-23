const test = require('node:test');
const assert = require('node:assert/strict');

const corporateEvents = require('../Tests/CorporateEvents');

function validFixture(overrides = {}) {
  return {
    CONNECT_SERVER_NAME: 'QA',
    CORPORATE_EVENTS_ENABLED: '1',
    CORPORATE_EVENTS_EXPECTED_SECTION: 'Automate test 1',
    CORPORATE_EVENTS_EXPECTED_ITEM: 'CORPORATE AUTOMATE ROOM',
    ...overrides,
  };
}

function isBlocked(error, messagePattern) {
  assert.ok(error instanceof corporateEvents.BlockedTestError);
  assert.equal(error.name, 'BlockedTestError');
  assert.equal(error.code, 'TEST_BLOCKED');
  assert.equal(error.status, 'BLOCKED');
  assert.match(error.message, messagePattern);
  return true;
}

test('CorporateEvents booleanEnv accepts only explicit enabled values', () => {
  for (const value of ['1', 'true', ' TRUE ', 1]) {
    assert.equal(corporateEvents.booleanEnv(value), true, String(value));
  }
  for (const value of [undefined, null, '', '0', 'false', 'yes']) {
    assert.equal(corporateEvents.booleanEnv(value), false, String(value));
  }
});

test('CorporateEvents standalone entry point supplies its QA-only defaults', () => {
  const env = {};

  corporateEvents.applyStandaloneDefaults(env);

  assert.equal(env.CONNECT_SERVER_NAME, 'QA');
  assert.equal(env.CORPORATE_EVENTS_ENABLED, '1');
});

test('CorporateEvents uses the current QA labels when overrides are absent', () => {
  const env = validFixture();
  delete env.CORPORATE_EVENTS_EXPECTED_SECTION;
  delete env.CORPORATE_EVENTS_EXPECTED_ITEM;

  const fixture = corporateEvents.validateCorporateEventsFixture(env);

  assert.equal(fixture.expectedSection, 'Automate test 1');
  assert.equal(fixture.expectedItem, 'CORPORATE AUTOMATE ROOM');
  assert.equal(fixture.dmItem, 'JONATHAN LEVY');
  assert.equal(fixture.expectedDm, 'Jonathan Levy');
  assert.equal(fixture.roomItem, 'CORPORATE AUTOMATE ROOM');
  assert.equal(fixture.expectedRoom, 'Corporate Automate Room');
  assert.equal(fixture.urlItem, 'GOOGLE');
});

test('CorporateEvents blocks outside QA', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CONNECT_SERVER_NAME: 'Production',
    })),
    error => isBlocked(error, /QA-only/)
  );
});

test('CorporateEvents blocks unless explicitly enabled', () => {
  const env = validFixture();
  delete env.CORPORATE_EVENTS_ENABLED;

  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(env),
    error => isBlocked(error, /opt-in|CORPORATE_EVENTS_ENABLED/i)
  );
});

test('CorporateEvents blocks when the expected section is missing', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_EXPECTED_SECTION: '   ',
    })),
    error => isBlocked(error, /CORPORATE_EVENTS_EXPECTED_SECTION/)
  );
});

test('CorporateEvents blocks when the expected item is missing', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_EXPECTED_ITEM: '',
    })),
    error => isBlocked(error, /CORPORATE_EVENTS_EXPECTED_ITEM/)
  );
});

test('CorporateEvents trims required values and retains configured optional values', () => {
  assert.deepEqual(
    corporateEvents.validateCorporateEventsFixture(validFixture({
      CONNECT_SERVER_NAME: ' QA ',
      CORPORATE_EVENTS_EXPECTED_SECTION: ' EVENT DETAILS ',
      CORPORATE_EVENTS_EXPECTED_ITEM: ' HOTEL INFORMATION ',
      CORPORATE_EVENTS_DM_ITEM: ' JONATHAN LEVY ',
      CORPORATE_EVENTS_EXPECTED_DM: ' Jonathan Levy ',
      CORPORATE_EVENTS_ROOM_ITEM: ' ANNOUNCEMENTS ',
      CORPORATE_EVENTS_EXPECTED_ROOM: ' Announcements ',
      CORPORATE_EVENTS_URL_ITEM: ' HOTEL INFORMATION ',
    })),
    {
      serverName: 'QA',
      expectedSection: 'EVENT DETAILS',
      expectedItem: 'HOTEL INFORMATION',
      dmItem: 'JONATHAN LEVY',
      expectedDm: 'Jonathan Levy',
      roomItem: 'ANNOUNCEMENTS',
      expectedRoom: 'Announcements',
      urlItem: 'HOTEL INFORMATION',
    }
  );
});

test('CorporateEvents allows all navigation checks to be explicitly disabled', () => {
  assert.deepEqual(
    corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_DM_ITEM: '',
      CORPORATE_EVENTS_EXPECTED_DM: '',
      CORPORATE_EVENTS_ROOM_ITEM: '',
      CORPORATE_EVENTS_EXPECTED_ROOM: '',
      CORPORATE_EVENTS_URL_ITEM: '',
    })),
    {
      serverName: 'QA',
      expectedSection: 'Automate test 1',
      expectedItem: 'CORPORATE AUTOMATE ROOM',
      dmItem: '',
      expectedDm: '',
      roomItem: '',
      expectedRoom: '',
      urlItem: '',
    }
  );
});

test('CorporateEvents blocks a DM item without an expected destination', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_DM_ITEM: 'JONATHAN LEVY',
    })),
    error => isBlocked(error, /CORPORATE_EVENTS_EXPECTED_DM/)
  );
});

test('CorporateEvents blocks an expected DM without a DM item', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_EXPECTED_DM: 'Jonathan Levy',
    })),
    error => isBlocked(error, /CORPORATE_EVENTS_DM_ITEM/)
  );
});

test('CorporateEvents blocks a room item without an expected destination room', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_ROOM_ITEM: 'ANNOUNCEMENTS',
    })),
    error => isBlocked(error, /CORPORATE_EVENTS_EXPECTED_ROOM/)
  );
});

test('CorporateEvents blocks an expected room without a room item', () => {
  assert.throws(
    () => corporateEvents.validateCorporateEventsFixture(validFixture({
      CORPORATE_EVENTS_EXPECTED_ROOM: 'Announcements',
    })),
    error => isBlocked(error, /CORPORATE_EVENTS_ROOM_ITEM/)
  );
});

test('CorporateEvents builds escaped exact and contains text selectors', () => {
  const exact = corporateEvents.visibleTextSelector('A "quoted" \\ value');
  const contains = corporateEvents.visibleTextSelector('A "quoted" \\ value', false);

  assert.match(exact, /name == "A \\"quoted\\" \\\\ value"/);
  assert.match(exact, /label == "A \\"quoted\\" \\\\ value"/);
  assert.match(contains, /name CONTAINS "A \\"quoted\\" \\\\ value"/);
  assert.match(contains, /label CONTAINS "A \\"quoted\\" \\\\ value"/);
});

test('CorporateEvents restricts navigation item selectors to tappable buttons', () => {
  const exact = corporateEvents.visibleButtonSelector('GOOGLE');
  const contains = corporateEvents.visibleButtonSelector('JONATHAN LEVY', false);

  assert.match(exact, /type == "XCUIElementTypeButton"/);
  assert.match(exact, /name == "GOOGLE"/);
  assert.match(contains, /name CONTAINS "JONATHAN LEVY"/);
  assert.doesNotMatch(exact, /XCUIElementTypeStaticText/);
});
