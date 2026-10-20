const test = require('node:test');
const assert = require('node:assert/strict');

const {
  membersEditorFailureMessage,
  waitForMembersEditorField,
} = require('../utils/membersRoomErrors');

function element({ displayed = false, attributes = {} } = {}) {
  return {
    isExisting: async () => true,
    isDisplayed: async () => displayed,
    getAttribute: async name => attributes[name] || '',
  };
}

function pollingDriver(resolveElement) {
  let attempts = 0;
  return {
    get attempts() {
      return attempts;
    },
    async $(selector) {
      if (selector.startsWith('-ios predicate string:')) attempts += 1;
      return resolveElement(selector, attempts);
    },
  };
}

function immediatePollingOptions(timeout = 500) {
  let elapsed = 0;
  return {
    timeout,
    interval: 100,
    now: () => elapsed,
    sleep: async delay => {
      elapsed += delay;
    },
  };
}

test('members editor failure message extracts an HTTP status from the native banner', () => {
  assert.equal(
    membersEditorFailureMessage(
      'The operation couldn’t be completed. (HTTP Error error 404.)'
    ),
    'membersRoom: membership editor failed to load — HTTP 404 (The operation couldn’t be completed. (HTTP Error error 404.))'
  );
});

test('members editor wait returns the Add Individuals field when it becomes visible', async () => {
  const expectedField = element({ displayed: true });
  const driver = pollingDriver((selector, attempt) => {
    if (selector.startsWith('-ios predicate string:')) return element();
    return attempt >= 2 ? expectedField : element();
  });

  assert.equal(
    await waitForMembersEditorField(driver, ['add-individuals'], immediatePollingOptions()),
    expectedField
  );
  assert.equal(driver.attempts, 2);
});

test('members editor wait fails immediately with the visible backend error', async () => {
  const banner = element({
    displayed: true,
    attributes: {
      label: 'The operation couldn’t be completed. (HTTP Error error 404.)',
    },
  });
  const driver = pollingDriver(selector =>
    selector.startsWith('-ios predicate string:') ? banner : element()
  );

  await assert.rejects(
    waitForMembersEditorField(driver, ['add-individuals'], immediatePollingOptions(20000)),
    error => {
      assert.equal(error.code, 'MEMBERS_EDITOR_BACKEND_ERROR');
      assert.equal(error.failureType, 'PRODUCT');
      assert.equal(error.failureClassification, 'PRODUCT');
      assert.match(error.message, /membership editor failed to load — HTTP 404/);
      return true;
    }
  );
  assert.equal(driver.attempts, 1);
});

test('members editor wait keeps the precise missing-field timeout when no error appears', async () => {
  const driver = pollingDriver(() => element());

  await assert.rejects(
    waitForMembersEditorField(driver, ['add-individuals'], {
      ...immediatePollingOptions(),
      timeoutMsg: 'membersRoom: Add Individuals field did not appear',
    }),
    /membersRoom: Add Individuals field did not appear/
  );
});
