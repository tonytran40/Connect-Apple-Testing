const { SELECTORS } = require('./selectors');
const { waitForConnectivity } = require('./testSession');
const { escapePredicateString } = require('./uiActions');

const DEFAULT_TIMEOUT = 20000;
const DEFAULT_POLL_INTERVAL = 175;
const STABLE_VISUAL_REPEAT_COUNT = 4;
const NOTIFICATION_PREFERENCE_LABELS = Object.freeze([
  'Notify me for all messages',
  'Notify me for mentions only',
  'Notify me for direct mentions only',
  'No notifications',
]);

function uniqueToken() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

function normalizedFeatureName(feature) {
  return String(feature || 'Conversation')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Conversation';
}

function buildUniqueRoomName(feature, token = uniqueToken()) {
  return `A-${normalizedFeatureName(feature)}-${token}`;
}

function buildUniqueMessage(feature, token = uniqueToken()) {
  return `${normalizedFeatureName(feature)} message ${token}`;
}

function buildLabelPredicate(label, options = {}) {
  const types = options.types || ['XCUIElementTypeButton'];
  const comparison = options.contains ? 'CONTAINS' : '==';
  const safe = escapePredicateString(label);
  const typeExpression = types.map(type => `type == "${type}"`).join(' OR ');
  return (
    `-ios predicate string:(${typeExpression}) AND ` +
    `(name ${comparison} "${safe}" OR label ${comparison} "${safe}")`
  );
}

function resolveNotificationLabels(env = process.env) {
  const target = env.ROOM_NOTIFICATION_TEST_LABEL || 'No notifications';
  const restore = env.ROOM_NOTIFICATION_RESTORE_LABEL || 'Notify me for all messages';

  for (const [name, label] of [['target', target], ['restore', restore]]) {
    if (!NOTIFICATION_PREFERENCE_LABELS.includes(label)) {
      throw new Error(
        `Unknown room notification ${name} label "${label}". Expected one of: ` +
          NOTIFICATION_PREFERENCE_LABELS.join(', ')
      );
    }
  }

  if (target === restore) {
    throw new Error('ROOM_NOTIFICATION_TEST_LABEL must differ from ROOM_NOTIFICATION_RESTORE_LABEL');
  }

  return { target, restore };
}

function decodeClipboardText(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');

  const raw = String(value ?? '');
  const compact = raw.replace(/\s/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return raw;
  }

  const decoded = Buffer.from(compact, 'base64');
  const roundTrip = decoded.toString('base64').replace(/=+$/g, '');
  if (roundTrip !== compact.replace(/=+$/g, '')) return raw;
  return decoded.toString('utf8');
}

function clipboardUnavailableReason(error) {
  const message = String(error?.message || error || '');
  const unavailablePatterns = [
    /unknown command/i,
    /not implemented/i,
    /unsupported operation/i,
    /not supported/i,
    /clipboard.*not available/i,
    /pasteboard.*not available/i,
    /404.*clipboard/i,
  ];
  return unavailablePatterns.some(pattern => pattern.test(message)) ? message : null;
}

function accessibleTextContainsParts(attributes, parts) {
  const text = Object.values(attributes || {}).map(value => String(value || '')).join(' ');
  return parts.every(part => text.includes(String(part)));
}

function stableTailSignature(signatures, repeatCount = 2, excludedSignature) {
  if (signatures.length < repeatCount) return null;
  const tail = signatures.slice(-repeatCount);
  if (!tail.every(signature => signature === tail[0])) return null;
  if (excludedSignature !== undefined && tail[0] === excludedSignature) return null;
  return tail[0];
}

async function firstVisible(driver, selector) {
  const elements = await driver.$$(selector).catch(() => []);
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return null;
}

function labeledControlSelectors(label, allowContains) {
  const selectors = [buildLabelPredicate(label)];
  if (allowContains) {
    selectors.push(buildLabelPredicate(label, { contains: true }));
  }
  selectors.push(buildLabelPredicate(label, {
    types: ['XCUIElementTypeStaticText'],
  }));
  return selectors;
}

async function findVisibleLabeledControl(driver, label, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_POLL_INTERVAL;
  const selectors = labeledControlSelectors(label, options.allowContains === true);
  let deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (options.beforePoll) {
      const waitStarted = Date.now();
      if (await options.beforePoll()) {
        deadline += Date.now() - waitStarted;
      }
    }
    for (const selector of selectors) {
      const element = await firstVisible(driver, selector);
      if (element) return element;
    }
    await driver.pause(interval);
  }

  throw new Error(`Visible control with source label "${label}" did not appear`);
}

async function isLabeledControlVisible(driver, label, options = {}) {
  const selectors = labeledControlSelectors(label, options.allowContains === true);
  for (const selector of selectors) {
    if (await firstVisible(driver, selector)) return true;
  }
  return false;
}

async function clickLabeledControl(driver, label, options = {}) {
  const element = await findVisibleLabeledControl(driver, label, options);
  await element.click();
  return element;
}

async function waitForLabeledControlHidden(driver, label, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_POLL_INTERVAL;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (!(await isLabeledControlVisible(driver, label, options))) return;
    await driver.pause(interval);
  }

  throw new Error(`Control with source label "${label}" remained visible`);
}

async function roomComposer(driver, timeout = DEFAULT_TIMEOUT) {
  const composer = await driver.$(SELECTORS.roomComposerTextView);
  await composer.waitForDisplayed({ timeout });
  return composer;
}

async function setComposerValue(driver, value, timeout = DEFAULT_TIMEOUT) {
  const composer = await roomComposer(driver, timeout);
  await composer.click();
  await composer.setValue(value);
  return composer;
}

async function appendComposerValue(driver, value, timeout = DEFAULT_TIMEOUT) {
  const composer = await roomComposer(driver, timeout);
  await composer.click();
  await composer.addValue(value);
  return composer;
}

async function composerAccessibleText(composer) {
  const [value, name, label] = await Promise.all([
    composer.getValue().catch(() => ''),
    composer.getAttribute('name').catch(() => ''),
    composer.getAttribute('label').catch(() => ''),
  ]);
  return [value, name, label].map(item => String(item || '')).join(' ');
}

async function waitForComposerText(driver, expected, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const composer = await roomComposer(driver, Math.min(1000, timeout));
    if ((await composerAccessibleText(composer)).includes(expected)) return composer;
    await driver.pause(DEFAULT_POLL_INTERVAL);
  }
  throw new Error(`Composer did not contain "${expected}"`);
}

async function findTypeaheadOption(driver, label, timeout = DEFAULT_TIMEOUT) {
  await waitForConnectivity(driver);
  return findVisibleLabeledControl(driver, label, {
    allowContains: true,
    timeout,
    beforePoll: () => waitForConnectivity(driver),
  });
}

async function selectTypeaheadOption(driver, label, timeout = DEFAULT_TIMEOUT) {
  const option = await findTypeaheadOption(driver, label, timeout);
  await option.click();
  await waitForLabeledControlHidden(driver, label, {
    allowContains: true,
    timeout,
  });
}

function messageBubbleSelector(marker) {
  const safe = escapePredicateString(marker);
  return (
    '-ios predicate string:type == "XCUIElementTypeButton" AND ' +
    `(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
}

async function findMessageBubble(driver, marker, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const bubble = await firstVisible(driver, messageBubbleSelector(marker));
    if (bubble) return bubble;
    await driver.pause(DEFAULT_POLL_INTERVAL);
  }
  throw new Error(`Message containing "${marker}" did not appear`);
}

async function messageAttributes(messageBubble) {
  const [name, label, value] = await Promise.all([
    messageBubble.getAttribute('name').catch(() => ''),
    messageBubble.getAttribute('label').catch(() => ''),
    messageBubble.getAttribute('value').catch(() => ''),
  ]);
  return { name, label, value };
}

async function sendCurrentComposer(driver, marker, timeout = DEFAULT_TIMEOUT) {
  const send = await driver.$(SELECTORS.sendMessageButton);
  await send.waitForEnabled({ timeout });
  await send.click();
  return findMessageBubble(driver, marker, timeout);
}

async function typeAndSendMessage(driver, text, timeout = DEFAULT_TIMEOUT) {
  await setComposerValue(driver, text, timeout);
  return sendCurrentComposer(driver, text, timeout);
}

async function longPressElement(driver, element, durationMs = 900) {
  const elementId = element.elementId || element.ELEMENT;
  if (!elementId) throw new Error('Could not resolve an element ID for the long press');
  await driver.execute('mobile: touchAndHold', {
    elementId,
    duration: durationMs / 1000,
  });
}

async function waitForMessageAbsent(driver, marker, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await firstVisible(driver, messageBubbleSelector(marker)))) return;
    await driver.pause(DEFAULT_POLL_INTERVAL);
  }
  throw new Error(`Message containing "${marker}" remained visible after deletion`);
}

async function readClipboardText(driver) {
  if (typeof driver.getClipboard !== 'function') {
    return { available: false, reason: 'The Appium driver does not expose getClipboard' };
  }

  try {
    const value = await driver.getClipboard('plaintext');
    return { available: true, text: decodeClipboardText(value) };
  } catch (error) {
    const reason = clipboardUnavailableReason(error);
    if (reason) return { available: false, reason };
    throw error;
  }
}

async function labeledControlSignature(driver, label, timeout = DEFAULT_TIMEOUT) {
  const element = await findVisibleLabeledControl(driver, label, {
    allowContains: true,
    timeout,
  });
  const elementId = element.elementId || element.ELEMENT;
  if (!elementId || typeof driver.takeElementScreenshot !== 'function') {
    throw new Error(`Appium cannot capture the visual state for notification option "${label}"`);
  }
  return driver.takeElementScreenshot(elementId);
}

async function waitForStableLabeledControlSignature(driver, label, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_POLL_INTERVAL;
  const signatures = [];
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    signatures.push(await labeledControlSignature(driver, label, Math.min(1200, timeout)));
    const stable = stableTailSignature(
      signatures,
      STABLE_VISUAL_REPEAT_COUNT,
      options.differentFrom
    );
    if (stable) return stable;
    await driver.pause(interval);
  }

  throw new Error(`Notification option "${label}" did not reach a stable visual state`);
}

async function waitForLabeledControlVisualTransition(driver, label, baseline, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_POLL_INTERVAL;
  const deadline = Date.now() + timeout;
  const settledSignatures = [];
  let observedTransition = false;

  while (Date.now() < deadline) {
    const signature = await labeledControlSignature(driver, label, Math.min(1200, timeout));
    if (signature !== baseline) observedTransition = true;
    if (observedTransition) {
      settledSignatures.push(signature);
      const stable = stableTailSignature(settledSignatures, STABLE_VISUAL_REPEAT_COUNT);
      if (stable) return stable;
    }
    await driver.pause(interval);
  }

  throw new Error(`Notification option "${label}" did not transition to a settled visual state`);
}

async function waitForLabeledControlSignature(driver, label, expected, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const interval = options.interval ?? DEFAULT_POLL_INTERVAL;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if ((await labeledControlSignature(driver, label, Math.min(1200, timeout))) === expected) return;
    await driver.pause(interval);
  }

  throw new Error(`Notification option "${label}" did not restore its persisted visual state`);
}

module.exports = {
  DEFAULT_TIMEOUT,
  NOTIFICATION_PREFERENCE_LABELS,
  accessibleTextContainsParts,
  appendComposerValue,
  buildLabelPredicate,
  buildUniqueMessage,
  buildUniqueRoomName,
  clickLabeledControl,
  clipboardUnavailableReason,
  decodeClipboardText,
  findMessageBubble,
  findTypeaheadOption,
  findVisibleLabeledControl,
  isLabeledControlVisible,
  labeledControlSignature,
  longPressElement,
  messageAttributes,
  readClipboardText,
  resolveNotificationLabels,
  roomComposer,
  selectTypeaheadOption,
  sendCurrentComposer,
  setComposerValue,
  stableTailSignature,
  typeAndSendMessage,
  waitForComposerText,
  waitForLabeledControlHidden,
  waitForLabeledControlSignature,
  waitForLabeledControlVisualTransition,
  waitForMessageAbsent,
  waitForStableLabeledControlSignature,
};
