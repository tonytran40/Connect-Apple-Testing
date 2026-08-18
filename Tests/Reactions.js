require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, ensureRoomsSectionReady } = require('../utils/testSession');
const { SELECTORS, reactionChip } = require('../utils/selectors');
const {
  escapePredicateString,
  openRoomsPlusMenu,
  tapByText,
} = require('../utils/uiActions');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'Reactions';
const REACTION_HOLD_MS = 900;

// The five quick reactions shown by the message action sheet. Each tap closes the sheet,
// so the test deliberately opens it again for every reaction.
const QUICK_REACTIONS = [
  { name: 'thumbs_up', labels: ['👍', 'Thumbs Up', 'Like'] },
  { name: 'thumbs_down', labels: ['👎', 'Thumbs Down', 'Dislike'] },
  { name: 'smile', labels: ['😊', 'Smile'] },
  { name: 'heart', labels: ['❤️', 'Heart'] },
  { name: 'laugh', labels: ['🤣', 'Laugh'] },
];

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

async function createRoom(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  await ensureRoomsSectionReady(driver);
  await openRoomsPlusMenu(driver, timeout);

  const createRoom = await driver.$(SELECTORS.createRoomButton);
  await createRoom.waitForDisplayed({ timeout });
  await createRoom.click();

  const roomNameField = await driver.$(SELECTORS.roomNameText);
  await roomNameField.waitForDisplayed({ timeout });
  await roomNameField.click();
  await roomNameField.setValue(roomName);
  await tapByText(driver, 'Create', timeout);
  await tapByText(driver, 'Skip for now', timeout);

  const roomSettings = await driver.$(SELECTORS.openRoomSettingsButton);
  await roomSettings.waitForDisplayed({ timeout });
}

async function typeAndSendMessage(driver, text, timeout = DEFAULT_TIMEOUT) {
  const composer = await driver.$(SELECTORS.roomComposerTextView);
  await composer.waitForDisplayed({ timeout });
  await composer.click();
  await composer.setValue(text);

  const send = await driver.$(SELECTORS.sendMessageButton);
  await send.waitForEnabled({ timeout });
  await send.click();
}

async function findMessageBubble(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = escapePredicateString(text);
  const bubble = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
  );
  await bubble.waitForDisplayed({ timeout });
  return bubble;
}

async function longPress(driver, element) {
  const elementId = element.elementId || element.ELEMENT;
  if (!elementId) throw new Error('Could not resolve the message element for a long press');
  await driver.execute('mobile: touchAndHold', {
    elementId,
    duration: REACTION_HOLD_MS / 1000,
  });
}

async function accessibleReactionButton(driver, reaction, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const label of reaction.labels) {
      const safe = escapePredicateString(label);
      const buttons = await driver.$$(
        `-ios predicate string:type == "XCUIElementTypeButton" AND ` +
          `(name == "${safe}" OR label == "${safe}" OR name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
      );
      for (const button of buttons) {
        if (await button.isDisplayed().catch(() => false)) {
          return { button, reaction };
        }
      }
    }
    await driver.pause(150);
  }

  throw new Error(
    `No accessible ${reaction.name} reaction was found after long-pressing the message. Tried: ${reaction.labels.join(', ')}. ` +
      'Add an accessibility identifier to each reaction choice or update QUICK_REACTIONS with the labels reported by Appium.'
  );
}

async function messageContainsReaction(driver, message, reaction) {
  const bubble = await findMessageBubble(driver, message, 2500);
  const [name, label, value] = await Promise.all([
    bubble.getAttribute('name').catch(() => ''),
    bubble.getAttribute('label').catch(() => ''),
    bubble.getAttribute('value').catch(() => ''),
  ]);
  if (
    reaction.labels.some(expected =>
      [name, label, value].some(attribute => String(attribute || '').includes(expected))
    )
  ) {
    return true;
  }

  // Depending on the SwiftUI hierarchy, the reaction can be a sibling/child accessibility element
  // instead of being folded into the message bubble's label.
  for (const expected of reaction.labels) {
    const safe = escapePredicateString(expected);
    const reactionElements = await driver.$$(
      `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText" OR ` +
        `type == "XCUIElementTypeOther") AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
    );
    for (const element of reactionElements) {
      if (await element.isDisplayed().catch(() => false)) return true;
    }
  }
  return false;
}

async function waitForReactionState(driver, message, reaction, expectedPresent, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await messageContainsReaction(driver, message, reaction)) === expectedPresent) return;
    await driver.pause(200);
  }

  const expectation = expectedPresent ? 'appear on' : 'be removed from';
  throw new Error(`Expected ${reaction.name} reaction to ${expectation} the message bubble`);
}

async function visibleReactionChip(driver, reaction, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Preferred selector once the SwiftUI reaction chip exposes this identifier.
    const identifiedChip = await driver.$(reactionChip(reaction.labels[0]));
    if (await identifiedChip.isDisplayed().catch(() => false)) return identifiedChip;

    const matches = [];
    for (const label of reaction.labels) {
      const safe = escapePredicateString(label);
      const elements = await driver.$$(
        `-ios predicate string:type == "XCUIElementTypeButton" AND ` +
          `(name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
      );
      for (const element of elements) {
        if (await element.isDisplayed().catch(() => false)) {
          const [location, size] = await Promise.all([element.getLocation(), element.getSize()]);
          matches.push({
            element,
            rect: { x: location.x, y: location.y, width: size.width, height: size.height },
          });
        }
      }
    }
    if (matches.length) {
      // The message bubble can also include the emoji in its combined accessibility label.
      // The reaction chip is the smallest matching button on screen.
      matches.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
      return matches[0].element;
    }
    await driver.pause(200);
  }
  throw new Error(`Could not find the ${reaction.name} reaction chip in the conversation view`);
}

async function runTest(driver, options = {}) {
  if (!options.skipLogin) {
    await ensureLoggedIn(driver);
  }

  const roomName = process.env.REACTIONS_ROOM_NAME || `A-Reactions-${randomSuffix()}`;
  const message = `Reaction test ${randomSuffix()}`;

  await createRoom(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '01_room_opened.png');

  await typeAndSendMessage(driver, message);
  const messageBubble = await findMessageBubble(driver, message);
  await saveScreenshot(driver, TEST_NAME, '02_message_sent.png');

  for (const [index, reaction] of QUICK_REACTIONS.entries()) {
    await longPress(driver, index === 0 ? messageBubble : await findMessageBubble(driver, message));
    const choice = await accessibleReactionButton(driver, reaction);
    if (index === 0) {
      await saveScreenshot(driver, TEST_NAME, '03_reaction_picker_open.png');
    }

    await choice.button.click();
    await waitForReactionState(driver, message, reaction, true);
    await saveScreenshot(driver, TEST_NAME, `0${index + 4}_${reaction.name}_added.png`);
  }

  // Tapping a reaction chip in the conversation view removes the current user's reaction.
  // This is intentionally separate from the long-press action-sheet removal path.
  for (const [index, reaction] of QUICK_REACTIONS.entries()) {
    const chip = await visibleReactionChip(driver, reaction);
    await chip.click();
    await waitForReactionState(driver, message, reaction, false);
    await saveScreenshot(driver, TEST_NAME, `0${index + 9}_${reaction.name}_removed.png`);
  }
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver, options);
    } catch (error) {
      await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png').catch(() => {});
      throw error;
    }
  }, driver);
}

module.exports = { run };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
