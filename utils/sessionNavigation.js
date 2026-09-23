const { createDriver } = require('../Login_Flow/Open_App');
const { SELECTORS } = require('./selectors');
const { getElementRect } = require('./uiActions');
const { waitForElementHidden } = require('./uiTransitions');
const { continueWebAuthenticationIfNeeded } = require('./systemPrompts');
const { waitForConnectivity } = require('./sessionConnectivity');
const { getConversationListRoomsHeader, scrollConversationListToTop } = require('./conversationListNavigation');

async function isDisplayed(driver, selector, timeout = 1000) {
  try {
    const el = await driver.$(selector);
    await el.waitForDisplayed({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function runWithOptionalDriver(runTest, providedDriver) {
  const ownsDriver = !providedDriver;
  const driver = providedDriver || await createDriver();
  try {
    return await runTest(driver);
  } finally {
    if (ownsDriver && driver) await driver.deleteSession();
  }
}

async function tapBackLikeControl(driver) {
  const selectors = [
    SELECTORS.backButton,
    '-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "Back" OR label CONTAINS "Back")',
    '//XCUIElementTypeNavigationBar/XCUIElementTypeButton[1]',
  ];
  for (const selector of selectors) {
    try {
      const el = await driver.$(selector);
      if ((await el.isExisting().catch(() => false)) && (await el.isDisplayed().catch(() => false))) {
        await el.click();
        return true;
      }
    } catch {}
  }

  try {
    const windowRect = await driver.getWindowRect();
    const buttons = await driver.$$('//XCUIElementTypeButton');
    const maxX = windowRect.x + Math.max(80, windowRect.width * 0.2);
    const maxY = windowRect.y + Math.max(160, windowRect.height * 0.2);
    for (const button of buttons) {
      if (!(await button.isDisplayed().catch(() => false))) continue;
      const rect = await getElementRect(button).catch(() => null);
      if (rect && rect.x <= maxX && rect.y <= maxY) {
        await button.click();
        return true;
      }
    }
  } catch {}

  try {
    const rect = await driver.getWindowRect();
    await driver.execute('mobile: tap', {
      x: Math.round(rect.width * 0.055),
      y: Math.round(rect.height * 0.09),
    });
    return true;
  } catch {
    return false;
  }
}

async function goBack(driver, pauseMs = 500) {
  if (!(await tapBackLikeControl(driver))) throw new Error('Could not find a back-like control');
  // This helper has several possible destinations, so preserve its explicit
  // navigation/XCTest settling contract instead of guessing at one condition.
  await driver.pause(pauseMs);
}

async function dismissGifPickerIfVisible(driver) {
  const gifTab = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND ' +
      '(label == "All GIFs" OR name == "All GIFs")'
  );
  if (!(await gifTab.isDisplayed().catch(() => false))) return false;

  const rect = await driver.getWindowRect();
  const x = Math.round(rect.width * 0.5);
  await driver.performActions([
    {
      type: 'pointer', id: 'dismissGifPicker', parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x, y: Math.round(rect.height * 0.1) },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 100 },
        { type: 'pointerMove', duration: 450, origin: 'viewport', x, y: Math.round(rect.height * 0.78) },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions().catch(() => {});
  await waitForElementHidden(driver, gifTab, {
    timeout: 3000,
    interval: 100,
    timeoutMsg: 'GIF picker remained visible after its dismissal gesture',
  });
  console.log('resetToHome: dismissed unfinished GIF picker');
  return true;
}

async function resetToHome(driver, maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    if (await isDisplayed(driver, SELECTORS.loginView, 300)) return;
    if (
      (await isDisplayed(driver, SELECTORS.peoplePlusButton)) ||
      (await getConversationListRoomsHeader(driver)) ||
      (await isDisplayed(driver, SELECTORS.settingsButton))
    ) return true;

    if (await dismissGifPickerIfVisible(driver)) continue;

    const skipForNow = await driver.$('-ios predicate string:type == "XCUIElementTypeButton" AND label == "Skip for now"');
    if (await skipForNow.isDisplayed().catch(() => false)) {
      await skipForNow.click();
      await waitForElementHidden(driver, skipForNow, {
        timeout: 3000, interval: 100,
        timeoutMsg: 'Skip for now remained visible after it was tapped',
      });
      continue;
    }

    if (await tapBackLikeControl(driver)) {
      await driver.pause(500);
      continue;
    }

    if (await isDisplayed(driver, SELECTORS.closeButton, 500)) {
      const closeButton = await driver.$(SELECTORS.closeButton);
      await closeButton.click();
      await waitForElementHidden(driver, closeButton, {
        timeout: 3000, interval: 100,
        timeoutMsg: 'Close control remained visible after it was tapped',
      });
      continue;
    }

    if (await isDisplayed(driver, SELECTORS.sendMessageButton, 300)) {
      try {
        await driver.execute('mobile: pressButton', { name: 'return' });
        await driver.pause(300);
      } catch {}
    }

    await driver.activateApp(process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug');
    await driver.pause(800);
  }
  throw new Error('Could not return Connect to the conversation list');
}

async function ensureRoomsSectionReady(driver, maxScrolls = 8) {
  await continueWebAuthenticationIfNeeded(driver);
  await waitForConnectivity(driver);
  await resetToHome(driver);
  if (await continueWebAuthenticationIfNeeded(driver)) await resetToHome(driver);

  if (
    !(await getConversationListRoomsHeader(driver, 300)) &&
    !(await isDisplayed(driver, SELECTORS.peoplePlusButton, 500)) &&
    !(await isDisplayed(driver, SELECTORS.newConversationButton, 500)) &&
    !(await isDisplayed(driver, SELECTORS.settingsButton, 500))
  ) await resetToHome(driver);

  if (await scrollConversationListToTop(driver, { maxSwipes: maxScrolls })) return;
  throw new Error('Rooms section header was not visible from the conversation list');
}

module.exports = { ensureRoomsSectionReady, goBack, resetToHome, runWithOptionalDriver };
