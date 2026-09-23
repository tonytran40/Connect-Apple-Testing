const { SELECTORS } = require('./selectors');
const { allowDocumentAccessPromptIfNeeded } = require('./permissions');
const { escapePredicateString, getElementRect, tapByText } = require('./uiActions');
const { waitForCondition } = require('./uiTransitions');

const DEFAULT_TIMEOUT = Number.parseInt(process.env.ATTACHMENT_FILE_PICKER_TIMEOUT_MS, 10) || 20000;
const DEFAULT_LOCATION_NAME = process.env.ATTACHMENT_FILES_LOCATION_LABEL || 'On My iPhone';
const DEFAULT_APP_FOLDER_NAME = process.env.ATTACHMENT_FILES_APP_FOLDER || 'Connect iOS';
const DEFAULT_FILE_NAME = process.env.ATTACHMENT_FILE_NAME || 'draft-messages.plist';

function documentPickerPath(options = {}) {
  return [
    'Browse',
    options.locationName || DEFAULT_LOCATION_NAME,
    options.appFolderName || DEFAULT_APP_FOLDER_NAME,
    options.fileName || DEFAULT_FILE_NAME,
  ];
}

async function firstVisible(driver, selector) {
  const elements = await driver.$$(selector);
  for (const element of elements) {
    if (await element.isDisplayed().catch(() => false)) return element;
  }
  return null;
}

async function visibleNamedItem(driver, label) {
  const safe = escapePredicateString(label);
  return firstVisible(
    driver,
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
      'type == "XCUIElementTypeCell" OR type == "XCUIElementTypeStaticText" OR ' +
      'type == "XCUIElementTypeOther") AND ' +
      `(name == "${safe}" OR label == "${safe}")`
  );
}

async function waitForNamedItem(driver, label, timeout = DEFAULT_TIMEOUT) {
  return waitForCondition(driver, () => visibleNamedItem(driver, label), {
    timeout,
    interval: 200,
    timeoutMsg: `attachments: Files picker item "${label}" did not appear`,
  });
}

async function tapNamedItem(driver, label, timeout = DEFAULT_TIMEOUT) {
  await waitForNamedItem(driver, label, timeout);
  await tapByText(driver, label, timeout);
  console.log(`attachments: tapped Files picker item "${label}"`);
}

async function tapFileElement(driver, element) {
  try {
    await element.click();
  } catch {
    const rect = await getElementRect(element);
    await driver.execute('mobile: tap', {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    });
  }
}

async function waitForDocumentPicker(driver, timeout = DEFAULT_TIMEOUT) {
  await allowDocumentAccessPromptIfNeeded(driver);
  const signals = ['Recents', 'Browse', 'Cancel', DEFAULT_LOCATION_NAME];
  return waitForCondition(
    driver,
    async () => {
      for (const signal of signals) {
        if (await visibleNamedItem(driver, signal)) return signal;
      }
      return false;
    },
    {
      timeout,
      interval: 200,
      timeoutMsg: 'attachments: native Files document picker did not appear',
    }
  );
}

async function selectConnectDocument(driver, options = {}) {
  const [browseLabel, locationName, appFolderName, fileName] = documentPickerPath(options);
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const onStep = options.onStep || (async () => {});

  await tapNamedItem(driver, browseLabel, timeout);
  await waitForNamedItem(driver, locationName, timeout);
  await onStep('browse');

  await tapNamedItem(driver, locationName, timeout);
  await waitForNamedItem(driver, appFolderName, timeout);
  await onStep('local-storage');

  await tapNamedItem(driver, appFolderName, timeout);
  const file = await waitForNamedItem(driver, fileName, timeout);
  await onStep('app-folder');

  await tapFileElement(driver, file);
  await waitForNamedItem(driver, 'Open', timeout);
  await onStep('file-selected');
  await tapNamedItem(driver, 'Open', timeout);
  await allowDocumentAccessPromptIfNeeded(driver, { timeout: 500 });
  console.log(`attachments: opened Files document "${fileName}"`);
  return fileName;
}

async function waitForSentFile(driver, fileName = DEFAULT_FILE_NAME, timeout = DEFAULT_TIMEOUT) {
  const safe = escapePredicateString(fileName);
  const selector =
    '-ios predicate string:(type == "XCUIElementTypeButton" OR ' +
    'type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeOther") AND ' +
    `(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`;
  return waitForCondition(
    driver,
    async () => {
      const file = await firstVisible(driver, selector);
      const inConversation = await driver
        .$(SELECTORS.shareOptionsButton)
        .isDisplayed()
        .catch(() => false);
      return file && inConversation ? file : false;
    },
    {
      timeout,
      interval: 200,
      timeoutMsg: `attachments: sent file "${fileName}" did not appear in the conversation`,
    }
  );
}

module.exports = {
  DEFAULT_APP_FOLDER_NAME,
  DEFAULT_FILE_NAME,
  DEFAULT_LOCATION_NAME,
  documentPickerPath,
  selectConnectDocument,
  waitForDocumentPicker,
  waitForSentFile,
};
