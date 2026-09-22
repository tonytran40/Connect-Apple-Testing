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

test('Audience Filters defaults to the deterministic QA audience fixture', () => {
  const config = AudienceFilters.resolveAudienceFilterConfig({});
  assert.equal(config.territory, 'Philadelphia');
  assert.equal(config.department, 'Business Technology');
  assert.equal(config.title, 'Nitro Quality Ninja');
  assert.match(config.roomName, /^A-Audience-Filter-/);
});

test('Audience filter configuration trims values and preserves an explicit room name', () => {
  assert.deepEqual(AudienceFilters.resolveAudienceFilterConfig({
    AUDIENCE_FILTER_TERRITORY: ' Philadelphia ',
    AUDIENCE_FILTER_DEPARTMENT: ' Business Technology ',
    AUDIENCE_FILTER_TITLE: ' Nitro Quality Ninja ',
    AUDIENCE_FILTER_ROOM_NAME: ' QA Audience Lifecycle ',
  }), {
    territory: 'Philadelphia',
    department: 'Business Technology',
    title: 'Nitro Quality Ninja',
    roomName: 'QA Audience Lifecycle',
  });
});

test('Audience filter summaries match the base app create and edit wording', () => {
  const values = {
    territory: 'Philadelphia',
    department: 'Business Technology',
  };
  assert.equal(
    AudienceFilters.buildAudienceSummary(values),
    'All employees in Business Technology from Philadelphia.'
  );
  assert.equal(
    AudienceFilters.buildAudienceSummary({ ...values, title: 'Nitro Quality Ninja' }),
    'All Nitro Quality Ninja in Business Technology from Philadelphia.'
  );
});

test('Audience Filters retries progressive typing after a dropped character', async () => {
  let value = '';
  let attempt = 0;
  let droppedFirstCharacter = false;
  const field = {
    click: async () => {},
    clearValue: async () => {
      value = '';
      attempt++;
    },
    addValue: async character => {
      if (attempt === 1 && !droppedFirstCharacter) {
        droppedFirstCharacter = true;
        return;
      }
      value += character;
    },
    getValue: async () => value,
  };
  const option = {
    isDisplayed: async () => attempt === 2 && value === 'Phil',
  };
  const driver = {
    $: async () => option,
    pause: async () => {},
  };

  await AudienceFilters.typeUntilDropdownOptionVisible(driver, field, 'Philadelphia', {
    delayMs: 0,
    retries: 2,
    timeout: 1,
  });

  assert.equal(attempt, 2);
  assert.equal(value, 'Phil');
});

test('Audience Filters selects a dropdown option as soon as a reliable prefix reveals it', async () => {
  let value = '';
  let selected = false;
  const field = {
    click: async () => {},
    clearValue: async () => {
      value = '';
    },
    addValue: async character => {
      value += character;
    },
    getValue: async () => value,
  };
  const option = {
    isDisplayed: async () => value === 'Phil',
    click: async () => {
      selected = true;
    },
  };
  const driver = {
    $: async () => option,
    pause: async () => {},
  };

  const visibleOption = await AudienceFilters.typeUntilDropdownOptionVisible(
    driver,
    field,
    'Philadelphia',
    { delayMs: 0, retries: 1, timeout: 1 }
  );
  await visibleOption.click();

  assert.equal(value, 'Phil');
  assert.equal(selected, true);
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
  assert.match(AudienceFilters.roomMemberCountSelector(), /Members \(/);
});
