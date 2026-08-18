const { SELECTORS, PREDICATES } = require('./selectors');

function escapePredicateString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const selected = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, selected));
}

async function pauseIfNeeded(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

async function getElementRect(element) {
  if (typeof element.getRect === 'function') {
    return element.getRect();
  }
  const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
  return { x: location.x, y: location.y, width: size.width, height: size.height };
}

async function tapByText(driver, text, timeout = 20000) {
  const safe = escapePredicateString(text);
  const target = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND ` +
      `(label == "${safe}" OR name == "${safe}")`
  );
  await target.waitForDisplayed({ timeout });
  try {
    await target.click();
    return target;
  } catch {}

  const parentButton = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeButton[1]`
  );
  if (await parentButton.isExisting().catch(() => false)) {
    await parentButton.waitForDisplayed({ timeout });
    await parentButton.click();
    return parentButton;
  }

  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );
  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
  return parentCell;
}

async function openRoomsPlusMenu(driver, timeout = 20000) {
  const plusButton = await driver.$(SELECTORS.plusButton);
  if (await plusButton.isDisplayed().catch(() => false)) {
    await plusButton.click();
    const createRoom = await driver.$(SELECTORS.createRoomButton);
    if (await createRoom.waitForDisplayed({ timeout: Math.min(timeout, 1800) }).then(() => true).catch(() => false)) {
      return;
    }
  }

  const roomsHeader = await driver.$(PREDICATES.roomsHeaderButton);
  await roomsHeader.waitForDisplayed({ timeout });
  const rect = await getElementRect(roomsHeader);
  const windowRect = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.min(windowRect.width - 20, Math.round(rect.x + rect.width + 8)),
    y: Math.round(rect.y + rect.height / 2),
  });

  const createRoom = await driver.$(SELECTORS.createRoomButton);
  await createRoom.waitForDisplayed({ timeout });
}

async function typeComposerMessage(driver, message, timeout = 20000, options = {}) {
  const selectors = options.selectors || [
    SELECTORS.roomComposerTextView,
    SELECTORS.messageComposerTextView,
  ];

  for (const selector of selectors) {
    const composer = await driver.$(selector);
    if (!(await composer.isExisting().catch(() => false))) continue;
    await composer.waitForDisplayed({ timeout });
    await composer.click();
    try {
      await composer.setValue(message);
    } catch {
      await composer.waitForDisplayed({ timeout: Math.min(timeout, 1200) });
      await composer.click();
      await composer.setValue(message);
    }
    return composer;
  }

  const placeholder = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND ' +
      '(label CONTAINS "Start a new message" OR name CONTAINS "Start a new message" OR ' +
      'label BEGINSWITH "Message" OR name BEGINSWITH "Message")'
  );
  if (await placeholder.isExisting().catch(() => false)) {
    await placeholder.waitForDisplayed({ timeout });
    await placeholder.click();
    await pauseIfNeeded(driver, options.placeholderPauseMs || 0);
  }

  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const textView of textViews) {
    if (!(await textView.isDisplayed().catch(() => false))) continue;
    await textView.click();
    await pauseIfNeeded(driver, options.textViewPauseMs || 0);
    await textView.setValue(message);
    return textView;
  }

  throw new Error('Could not find a visible message composer');
}

module.exports = {
  boundedInt,
  escapePredicateString,
  getElementRect,
  openRoomsPlusMenu,
  pauseIfNeeded,
  tapByText,
  typeComposerMessage,
};
