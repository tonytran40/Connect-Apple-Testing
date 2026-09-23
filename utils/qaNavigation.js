const { escapePredicateString } = require('./uiActions');

function visibleTextSelector(text, exact = true) {
  const safe = escapePredicateString(text);
  const comparison = exact ? '==' : 'CONTAINS';
  return (
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
    'type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeOther") AND ' +
    `(name ${comparison} "${safe}" OR label ${comparison} "${safe}")`
  );
}

function visibleButtonSelector(text, exact = true) {
  const safe = escapePredicateString(text);
  const comparison = exact ? '==' : 'CONTAINS';
  return (
    '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
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

async function waitForVisible(driver, selector, options = {}) {
  const {
    timeout = 20000,
    interval = 200,
    timeoutMsg = `QA navigation did not display selector: ${selector}`,
  } = options;
  let element;

  await driver.waitUntil(async () => {
    element = await firstVisible(driver, selector);
    return Boolean(element);
  }, { timeout, interval, timeoutMsg });

  return element;
}

async function waitForVisibleText(driver, text, options = {}) {
  const { exact = true, ...waitOptions } = options;
  return waitForVisible(driver, visibleTextSelector(text, exact), waitOptions);
}

async function waitForVisibleButton(driver, text, options = {}) {
  const { exact = true, ...waitOptions } = options;
  return waitForVisible(driver, visibleButtonSelector(text, exact), waitOptions);
}

module.exports = {
  firstVisible,
  visibleButtonSelector,
  visibleTextSelector,
  waitForVisible,
  waitForVisibleButton,
  waitForVisibleText,
};
