require('dotenv').config();

const { URL } = require('node:url');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, waitForConnectivity } = require('../utils/testSession');
const {
  buildUniqueMessage,
  buildUniqueRoomName,
  sendCurrentComposer,
  setComposerValue,
} = require('../utils/conversationFeatureFlows');
const { escapePredicateString } = require('../utils/uiActions');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'LinkPreviews';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.LINK_PREVIEW_TIMEOUT_MS, 10) || 30000;
const DEFAULT_PREVIEW_CASES = Object.freeze([
  {
    label: 'youtube',
    url: 'https://www.youtube.com/watch?v=bMCiAKNUpTY',
  },
  {
    label: 'apple',
    url: 'https://www.apple.com/',
  },
  {
    label: 'google_maps',
    url:
      'https://www.google.com/maps/place/Zaffari+Bordini/' +
      '@-30.0178045,-51.1899153,15z/data=!4m6!3m5!1s0x951979c8e4f38569:' +
      '0xae57767ca0ea641b!8m2!3d-30.0223206!4d-51.1966162!16s%2Fg%2F1tdknd32?entry=ttu',
  },
]);

function simplifiedHost(value) {
  const host = new URL(value).hostname;
  if (!host) throw new Error(`Link preview URL has no host: ${value}`);
  return host.replace(/^www\./, '');
}

function previewHostSelector(host) {
  const safe = escapePredicateString(host);
  return (
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND ' +
    `(name == "${safe}" OR label == "${safe}")`
  );
}

function resolvePreviewCases(env = process.env) {
  return DEFAULT_PREVIEW_CASES.map((previewCase, index) => {
    const number = index + 1;
    const legacyUrl = index === 0 ? env.LINK_PREVIEW_URL : undefined;
    const legacyHost = index === 0 ? env.LINK_PREVIEW_EXPECTED_HOST : undefined;
    const url = env[`LINK_PREVIEW_URL_${number}`] || legacyUrl || previewCase.url;

    return {
      label: previewCase.label,
      url,
      expectedHost:
        env[`LINK_PREVIEW_EXPECTED_HOST_${number}`] || legacyHost || simplifiedHost(url),
    };
  });
}

async function waitForPreviewCard(driver, host, timeout = DEFAULT_TIMEOUT) {
  const selector = previewHostSelector(host);
  const deadline = Date.now() + timeout;
  await waitForConnectivity(driver);

  while (Date.now() < deadline) {
    const previewHost = await driver.$(selector);
    if (await previewHost.isDisplayed().catch(() => false)) return previewHost;
    await driver.pause(250);
  }

  throw new Error(`Link preview card for "${host}" did not appear within ${timeout}ms`);
}

async function runTest(driver, options = {}) {
  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const roomName = process.env.LINK_PREVIEW_ROOM_NAME || buildUniqueRoomName('Link-Preview');
  const previewCases = resolvePreviewCases();
  const markerBase = process.env.LINK_PREVIEW_MESSAGE || buildUniqueMessage('Link-Preview');

  const creation = await createPublicRoom(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '01_room_opened.png');

  for (const [index, previewCase] of previewCases.entries()) {
    const marker = `${markerBase} ${index + 1}`;
    const message = `[${marker}](${previewCase.url})`;
    const sentStep = String(index * 2 + 2).padStart(2, '0');
    const loadedStep = String(index * 2 + 3).padStart(2, '0');

    await setComposerValue(driver, message, DEFAULT_TIMEOUT);
    await sendCurrentComposer(driver, marker, DEFAULT_TIMEOUT);
    await saveScreenshot(
      driver,
      TEST_NAME,
      `${sentStep}_${previewCase.label}_link_sent.png`
    );

    await waitForPreviewCard(driver, previewCase.expectedHost, DEFAULT_TIMEOUT);
    await saveScreenshot(
      driver,
      TEST_NAME,
      `${loadedStep}_${previewCase.label}_preview_loaded.png`
    );
  }

  return { timings: { roomCreationMs: creation.roomCreationMs } };
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      return await runTest(activeDriver, options);
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = {
  DEFAULT_PREVIEW_CASES,
  previewHostSelector,
  resolvePreviewCases,
  run,
  runTest,
  simplifiedHost,
  waitForPreviewCard,
};

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
