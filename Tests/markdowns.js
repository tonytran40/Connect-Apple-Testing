require('dotenv').config();

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver } = require('../utils/testSession');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'markdowns';

/** Comma-separated `id` values from MARKDOWN_EXAMPLES, e.g. `01_headings,02_emphasis,09_emojis` — omit to run all. */
const MARKDOWN_EXAMPLE_IDS = (process.env.MARKDOWN_EXAMPLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/** Skip `${id}.png` after each example (keeps `01_room_opened`); big time saver for CI / timing runs. */
const SKIP_EXAMPLE_SCREENSHOTS =
  process.env.MARKDOWN_SKIP_EXAMPLE_SCREENSHOTS === '1' ||
  process.env.MARKDOWN_SKIP_EXAMPLE_SCREENSHOTS === 'true';

function intEnv(name, fallback, min, max) {
  const n = parseInt(process.env[name], 10);
  const v = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

const COMPOSER_READY_TIMEOUT_MS = intEnv('MARKDOWN_COMPOSER_READY_TIMEOUT_MS', 10000, 2000, 20000);
const COMPOSER_READY_INTERVAL_MS = intEnv('MARKDOWN_COMPOSER_READY_INTERVAL_MS', 200, 80, 500);
const COMPOSER_POST_READY_MS = intEnv('MARKDOWN_COMPOSER_POST_READY_MS', 120, 0, 400);
const COMPOSER_FALLBACK_PAUSE_MS = intEnv('MARKDOWN_COMPOSER_FALLBACK_PAUSE_MS', 500, 200, 1500);
const TYPE_PLACEHOLDER_PAUSE_MS = intEnv('MARKDOWN_TYPE_PLACEHOLDER_PAUSE_MS', 0, 0, 600);
const TYPE_TEXTVIEW_PAUSE_MS = intEnv('MARKDOWN_TYPE_TEXTVIEW_PAUSE_MS', 0, 0, 400);
const MARKDOWN_ROOM_WAIT_TIMEOUT_MS = intEnv('MARKDOWN_ROOM_WAIT_TIMEOUT_MS', 30000, 8000, 90000);
const MARKDOWN_ROOM_WAIT_INTERVAL_MS = intEnv('MARKDOWN_ROOM_WAIT_INTERVAL_MS', 600, 200, 2000);

function selectMarkdownExamples(all) {
  if (!MARKDOWN_EXAMPLE_IDS.length) {
    return all;
  }
  const picked = all.filter(ex => MARKDOWN_EXAMPLE_IDS.includes(ex.id));
  if (!picked.length) {
    throw new Error(
      `MARKDOWN_EXAMPLE_IDS matched no examples (got: ${MARKDOWN_EXAMPLE_IDS.join(', ')}). Check ids in markdowns.js.`
    );
  }
  console.log(`markdowns: running ${picked.length} example(s) from MARKDOWN_EXAMPLE_IDS`);
  return picked;
}

async function tapByText(driver, text, timeout = 20000) {
  const safe = text.replace(/"/g, '\\"');

  const textEl = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND (label == "${safe}" OR name == "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  const parentButton = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeButton[1]`
  );

  if (await parentButton.isExisting().catch(() => false)) {
    await parentButton.waitForDisplayed({ timeout });
    await parentButton.click();
    return;
  }

  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );

  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
}

async function openRoomWhenReady(driver, roomName) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MARKDOWN_ROOM_WAIT_TIMEOUT_MS) {
    try {
      await tapByText(driver, roomName, Math.min(MARKDOWN_ROOM_WAIT_INTERVAL_MS, 2500));
      return;
    } catch {}
    await driver.pause(MARKDOWN_ROOM_WAIT_INTERVAL_MS);
  }

  throw new Error(
    `Room "${roomName}" was not visible after ${MARKDOWN_ROOM_WAIT_TIMEOUT_MS}ms. ` +
      'Try increasing MARKDOWN_ROOM_WAIT_TIMEOUT_MS for slower standalone login loads.'
  );
}

async function typeComposerMessage(driver, message, timeout = 20000) {
  const setComposerValue = async el => {
    try {
      await el.setValue(message);
      return true;
    } catch {
      // Composer focus can race with iOS keyboard animation; retry quickly instead of fixed waits.
      await el.waitForDisplayed({ timeout: 1200 });
      await el.click();
      await el.setValue(message);
      return true;
    }
  };

  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await setComposerValue(byId);
    return;
  }

  const placeholder = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND 
     (label CONTAINS "Start a new message" OR name CONTAINS "Start a new message" OR
      label CONTAINS "Message" OR name CONTAINS "Message")`
  );

  if (await placeholder.isExisting().catch(() => false)) {
    await placeholder.waitForDisplayed({ timeout });
    await placeholder.click();
    if (TYPE_PLACEHOLDER_PAUSE_MS > 0) {
      await driver.pause(TYPE_PLACEHOLDER_PAUSE_MS);
    }
  }

  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      await tv.click();
      if (TYPE_TEXTVIEW_PAUSE_MS > 0) {
        await driver.pause(TYPE_TEXTVIEW_PAUSE_MS);
      }
      await setComposerValue(tv);
      return;
    }
  }

  throw new Error('Could not find message composer TextView');
}

async function sendMessage(driver, timeout = DEFAULT_TIMEOUT) {
  const sendBtn = await driver.$('~sendMessageButton');
  await sendBtn.waitForEnabled({ timeout });
  await sendBtn.click();
}

async function anyVisibleComposerTextView(driver) {
  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      return true;
    }
  }
  return false;
}

/**
 * After send, the thread may briefly not expose the same accessibility ids; we wait for any known
 * composer surface, then a short settle. On timeout, fall back to the legacy fixed pause so the suite keeps going.
 */
async function waitForComposerReadyAfterSend(driver) {
  const byId = await driver.$('~messageComposerTextView');
  const placeholder = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND 
     (label CONTAINS "Start a new message" OR name CONTAINS "Start a new message" OR
      label CONTAINS "Message" OR name CONTAINS "Message")`
  );

  try {
    await driver.waitUntil(
      async () =>
        (await byId.isDisplayed().catch(() => false)) ||
        (await placeholder.isDisplayed().catch(() => false)) ||
        (await anyVisibleComposerTextView(driver)),
      {
        timeout: COMPOSER_READY_TIMEOUT_MS,
        interval: COMPOSER_READY_INTERVAL_MS,
        timeoutMsg: 'Composer did not become ready again after send',
      }
    );
  } catch {
    console.warn('markdowns: composer readiness wait timed out; using fallback settle');
    await driver.pause(COMPOSER_FALLBACK_PAUSE_MS);
  }
  if (COMPOSER_POST_READY_MS > 0) {
    await driver.pause(COMPOSER_POST_READY_MS);
  }
}

async function focusComposer(driver, timeout = DEFAULT_TIMEOUT) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    return true;
  }

  const placeholder = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeStaticText" AND 
     (label CONTAINS "Start a new message" OR name CONTAINS "Start a new message" OR
      label CONTAINS "Message" OR name CONTAINS "Message")`
  );

  if (await placeholder.isExisting().catch(() => false)) {
    await placeholder.waitForDisplayed({ timeout });
    await placeholder.click();
    return true;
  }

  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      await tv.click();
      return true;
    }
  }

  return false;
}

async function tapEmojiKeyboard(driver, timeout = DEFAULT_TIMEOUT) {
  const focused = await focusComposer(driver, timeout);
  if (!focused) return false;

  await driver.$('XCUIElementTypeKeyboard').waitForDisplayed({ timeout });

  const selectors = [
    '~Next keyboard',
    '~emoji',
    `-ios predicate string:type == "XCUIElementTypeButton" AND (label CONTAINS "Next keyboard" OR name CONTAINS "Next keyboard")`,
    `-ios predicate string:type == "XCUIElementTypeButton" AND (label CONTAINS "emoji" OR name CONTAINS "emoji")`,
  ];

  for (const selector of selectors) {
    const el = await driver.$(selector);
    if (await el.isExisting().catch(() => false)) {
      await el.click();
      return true;
    }
  }

  return false;
}

const MARKDOWN_EXAMPLES = [
  {
    id: '01_headings',
    text:
      '# Heading 1\n' +
      '## Heading 2\n' +
      '### Heading 3\n' +
      '#### Heading 4\n' +
      '##### Heading 5\n' +
      'Normal paragraph under headings.',
  },
  {
    id: '02_emphasis',
    text:
      '**bold**\n' +
      '*italic*\n' +
      '~~strikethrough~~\n' +
      '**bold _nested italic_**\n' +
      '*italic **nested bold***',
  },
  {
    id: '03_links',
    text:
      '[Nitro](https://nitro.powerhrg.com)\n' +
      '[Example](https://example.com)\n' +
      'Plain URL: https://www.google.com',
  },
  {
    id: '04_inline_code',
    text:
      'Inline `code` example\n' +
      'Mix with text: `const x = 42;`\n' +
      'Inline with *emphasis* and **bold**',
  },
  {
    id: '05_code_block',
    text:
      '```js\n' +
      'const numbers = [1, 2, 3, 4, 5];\n' +
      'const sum = numbers.reduce((acc, n) => acc + n, 0);\n' +
      '\n' +
      'function add(a, b) {\n' +
      '  return a + b;\n' +
      '}\n' +
      '\n' +
      'function formatUser(user) {\n' +
      '  const name = `${user.firstName} ${user.lastName}`;\n' +
      '  return `${name} (${user.role})`;\n' +
      '}\n' +
      '\n' +
      'const users = [\n' +
      '  { firstName: "Tony", lastName: "Tran", role: "Software Dev" },\n' +
      '  { firstName: "Levy", lastName: "Alannah", role: "Producteer" },\n' +
      '];\n' +
      '\n' +
      'const labels = users.map(formatUser);\n' +
      'console.log({ sum, labels, add: add(6, 7) });\n' +
      '```',
  },
  {
    id: '06_lists',
    text:
      '- Item one\n' +
      '- Item two\n' +
      '  - Sub item A\n' +
      '  - Sub item B\n' +
      '- Item three\n' +
      '\n' +
      '1. First\n' +
      '2. Second\n' +
      '   1. Nested one\n' +
      '   2. Nested two',
  },
  {
    id: '07_blockquote',
    text:
      '> This is a blockquote\n' +
      '> on multiple lines\n' +
      '>\n' +
      '> **Bold** and `inline code` inside',
  },
  {
    id: '08_mixed',
    text:
      '**Bold** and *italic* with `inline code`\n' +
      '- List item with **bold**\n' +
      '- List item with [link](https://example.com)\n' +
      '> Quote with ~~strike~~',
  },
  {
    id: '09_emojis',
    useEmojiKeyboard: true,
    text:
      '😀 😅 😂 🤣 😍 😎\n' +
      '👍 👍🏻 👍🏽 👍🏿\n' +
      '👩‍💻 🧑‍🚀 👨‍👩‍👧‍👦\n' +
      '🇺🇸 🇨🇦 🇯🇵\n' +
      '✅ 🙌 🎉 🚀 💡 👀' +
      'Emoji with text: Hello 👋, This is tony with some messages with emojis! 🎉🚀' +
      'I love coffee ☕ and coding 💻!' +
      'Lets go on lunch 🥗 🍔 🌭 🌮',
  },
  {
    id: '10_appointments',
    text:
      'A#12345\n' +
      'WE HAVE NO DATA FOR THIS BUT WOULD BE GOOD TO TEST APPOINTMENT LINK RENDERING IN THE FUTURE',
  },
];

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;
  const roomName = process.env.MARKDOWN_ROOM_NAME || 'Message Room';

  if (!skipLogin) {
    await ensureLoggedIn(driver);
  }
  await openRoomWhenReady(driver, roomName);
  await saveScreenshot(driver, TEST_NAME, '01_room_opened.png');

  for (const example of selectMarkdownExamples(MARKDOWN_EXAMPLES)) {
    if (example.useEmojiKeyboard) {
      await tapEmojiKeyboard(driver, DEFAULT_TIMEOUT);
    }
    await typeComposerMessage(driver, example.text, DEFAULT_TIMEOUT);
    await sendMessage(driver, DEFAULT_TIMEOUT);
    await waitForComposerReadyAfterSend(driver);
    if (!SKIP_EXAMPLE_SCREENSHOTS) {
      await saveScreenshot(driver, TEST_NAME, `${example.id}.png`);
    }
  }
}

async function run(driver, options = {}) {
  return runWithOptionalDriver(async activeDriver => {
    try {
      await runTest(activeDriver, options);
    } catch (err) {
      try {
        await saveScreenshot(activeDriver, TEST_NAME, 'ERROR.png');
      } catch {}
      throw err;
    }
  }, driver);
}

module.exports = { run };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(() => process.exit(1));
}
