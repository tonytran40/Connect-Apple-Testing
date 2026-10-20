const MEMBERS_EDITOR_ERROR_SELECTOR =
  '-ios predicate string:' +
  '(type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeOther" OR type == "XCUIElementTypeAlert") ' +
  'AND (name CONTAINS[c] "HTTP Error" OR label CONTAINS[c] "HTTP Error" OR value CONTAINS[c] "HTTP Error" ' +
  'OR name CONTAINS[c] "operation couldn" OR label CONTAINS[c] "operation couldn" OR value CONTAINS[c] "operation couldn")';

function membersEditorFailureMessage(rawText = '') {
  const detail = String(rawText).replace(/\s+/g, ' ').trim();
  const status = detail.match(/\bHTTP(?:\s+Error)?(?:\s+error)?\s+(\d{3})\b/i)?.[1]
    || detail.match(/\berror\s+(\d{3})\b/i)?.[1];
  const summary = status ? `HTTP ${status}` : 'HTTP error';
  return `membersRoom: membership editor failed to load — ${summary}${detail ? ` (${detail})` : ''}`;
}

async function displayedMembersEditorError(driver) {
  const element = await driver.$(MEMBERS_EDITOR_ERROR_SELECTOR);
  if (!(await element.isExisting().catch(() => false))) return null;
  if (!(await element.isDisplayed().catch(() => false))) return null;

  const values = await Promise.all(
    ['label', 'value', 'name'].map(attribute =>
      element.getAttribute(attribute).catch(() => '')
    )
  );
  const text = values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0] || 'HTTP error';

  return { element, text };
}

function membersEditorBackendError(rawText) {
  const error = new Error(membersEditorFailureMessage(rawText));
  error.code = 'MEMBERS_EDITOR_BACKEND_ERROR';
  error.failureType = 'PRODUCT';
  error.failureClassification = 'PRODUCT';
  return error;
}

async function waitForMembersEditorField(driver, fieldSelectors, options = {}) {
  const {
    timeout = 20000,
    interval = 100,
    timeoutMsg = 'membersRoom: Add Individuals field did not appear',
    now = Date.now,
    sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  } = options;
  const deadline = now() + timeout;

  while (true) {
    const visibleError = await displayedMembersEditorError(driver);
    if (visibleError) throw membersEditorBackendError(visibleError.text);

    for (const selector of fieldSelectors) {
      const candidate = await driver.$(selector);
      if (!(await candidate.isExisting().catch(() => false))) continue;
      if (await candidate.isDisplayed().catch(() => false)) return candidate;
    }

    if (now() >= deadline) throw new Error(timeoutMsg);
    await sleep(interval);
  }
}

module.exports = {
  MEMBERS_EDITOR_ERROR_SELECTOR,
  displayedMembersEditorError,
  membersEditorBackendError,
  membersEditorFailureMessage,
  waitForMembersEditorField,
};
