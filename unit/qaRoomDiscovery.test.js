const test = require('node:test');
const assert = require('node:assert/strict');

const AudienceFilters = require('../Tests/AudienceFilters');
const BrowseRooms = require('../Tests/BrowseRooms');

function driverThatMustNotBeUsed() {
  return new Proxy({}, {
    get(_target, property) {
      throw new Error(`QA guard touched the Appium driver through ${String(property)}`);
    },
  });
}

test('QA server detection accepts explicit QA tokens and rejects non-QA environments', () => {
  for (const serverName of ['QA', 'qa', 'Nitro QA', 'nitro-qa-east']) {
    assert.equal(BrowseRooms.isQaServerName(serverName), true, serverName);
  }
  for (const serverName of ['', 'localhost', 'production', 'Iraq']) {
    assert.equal(BrowseRooms.isQaServerName(serverName), false, serverName);
  }
});

test('Browse Rooms blocks before touching Appium when the server is not QA', async () => {
  await assert.rejects(
    BrowseRooms.runTest(driverThatMustNotBeUsed(), {
      env: { CONNECT_SERVER_NAME: 'localhost' },
      skipLogin: true,
    }),
    error => {
      assert.equal(error.code, 'BLOCKED_QA_ONLY');
      assert.equal(error.status, 'BLOCKED');
      assert.match(error.message, /BrowseRooms is QA-only/);
      return true;
    }
  );
});

test('Audience Filters blocks before touching Appium when the server is not QA', async () => {
  await assert.rejects(
    AudienceFilters.runTest(driverThatMustNotBeUsed(), {
      env: {
        CONNECT_SERVER_NAME: 'localhost',
        AUDIENCE_FILTER_TERRITORY: 'Philadelphia',
        AUDIENCE_FILTER_DEPARTMENT: 'Quality Assurance',
        AUDIENCE_FILTER_TITLE: 'Quality Ninja',
      },
      skipLogin: true,
    }),
    error => {
      assert.equal(error.code, 'BLOCKED_QA_ONLY');
      assert.equal(error.status, 'BLOCKED');
      assert.match(error.message, /AudienceFilters is QA-only/);
      return true;
    }
  );
});

test('standalone QA flows block before creating an Appium session', async () => {
  const options = { env: { CONNECT_SERVER_NAME: 'production' } };
  await assert.rejects(BrowseRooms.run(undefined, options), /BLOCKED: BrowseRooms is QA-only/);
  await assert.rejects(AudienceFilters.run(undefined, options), /BLOCKED: AudienceFilters is QA-only/);
});

test('Audience Filters requires deterministic QA territory, department, and title values', () => {
  assert.throws(
    () => AudienceFilters.resolveAudienceFilterConfig({
      CONNECT_SERVER_NAME: 'QA',
      AUDIENCE_FILTER_TERRITORY: 'Philadelphia',
    }),
    error => {
      assert.equal(error.code, 'BLOCKED_QA_CONFIGURATION');
      assert.equal(error.status, 'BLOCKED');
      assert.match(error.message, /AUDIENCE_FILTER_DEPARTMENT/);
      assert.match(error.message, /AUDIENCE_FILTER_TITLE/);
      return true;
    }
  );
});

test('Audience filter configuration trims values and preserves an explicit room name', () => {
  assert.deepEqual(AudienceFilters.resolveAudienceFilterConfig({
    AUDIENCE_FILTER_TERRITORY: ' Philadelphia ',
    AUDIENCE_FILTER_DEPARTMENT: ' Quality Assurance ',
    AUDIENCE_FILTER_TITLE: ' Quality Ninja ',
    AUDIENCE_FILTER_ROOM_NAME: ' QA Audience Lifecycle ',
  }), {
    territory: 'Philadelphia',
    department: 'Quality Assurance',
    title: 'Quality Ninja',
    roomName: 'QA Audience Lifecycle',
  });
});

test('Audience filter summaries match the base app create and edit wording', () => {
  const values = {
    territory: 'Philadelphia',
    department: 'Quality Assurance',
  };
  assert.equal(
    AudienceFilters.buildAudienceSummary(values),
    'All employees in Quality Assurance from Philadelphia.'
  );
  assert.equal(
    AudienceFilters.buildAudienceSummary({ ...values, title: 'Quality Ninja' }),
    'All Quality Ninja in Quality Assurance from Philadelphia.'
  );
});

test('compact iOS room-browser capabilities reflect the source-backed controls', () => {
  assert.deepEqual(BrowseRooms.compactRoomBrowserCapabilities(), {
    copyLink: true,
    sortingDirection: false,
    sortingLimitation:
      'The base app hides sortOptionsView when horizontalSizeClassIsCompact is true.',
  });
  assert.equal(
    BrowseRooms.isExpectedNitroRoomLink('https://connect.powerhrg.com/room/!room-id'),
    true
  );
  assert.equal(BrowseRooms.isExpectedNitroRoomLink('https://example.com/not-a-room'), false);
});

test('Audience Filters builds escaped text and category selectors', () => {
  assert.match(
    AudienceFilters.visibleTextSelector('A "quoted" \\ value'),
    /name == "A \\"quoted\\" \\\\ value"/
  );
  assert.match(AudienceFilters.categoryFieldXPath('User Title'), /following::XCUIElementTypeTextField/);
});
