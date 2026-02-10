require('dotenv').config();
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');

const DEFAULT_TIMEOUT = 20000;
const TEST_NAME = 'markdowns';

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

async function typeComposerMessage(driver, message, timeout = 20000) {
  const byId = await driver.$('~messageComposerTextView');
  if (await byId.isExisting().catch(() => false)) {
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    await byId.setValue(message);
    console.log('✅ Typed message (by accessibility id)');
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
    await driver.pause(300);
  }

  const textViews = await driver.$$('//XCUIElementTypeTextView');
  for (const tv of textViews) {
    if (await tv.isDisplayed().catch(() => false)) {
      await tv.click();
      await driver.pause(150);
      await tv.setValue(message);
      console.log('✅ Typed message in composer');
      return;
    }
  }
  throw new Error('❌ Could not find message composer TextView');
}

async function sendMessage(driver, timeout = DEFAULT_TIMEOUT) {
  const sendBtn = await driver.$('~sendMessageButton');
  await sendBtn.waitForEnabled({ timeout });
  await sendBtn.click();
  console.log('📨 Sent message');
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
  // Ensure keyboard is visible
  const focused = await focusComposer(driver, timeout);
  if (!focused) {
    console.log('⚠️ Composer not found — skipping emoji keyboard switch');
    return false;
  }
  await driver.$('XCUIElementTypeKeyboard').waitForDisplayed({ timeout });

  const selectors = [
    '~Next keyboard',
    '~emoji',
    `-ios predicate string:type == "XCUIElementTypeButton" AND (label CONTAINS "Next keyboard" OR name CONTAINS "Next keyboard")`,
    `-ios predicate string:type == "XCUIElementTypeButton" AND (label CONTAINS "emoji" OR name CONTAINS "emoji")`,
  ];

  for (const sel of selectors) {
    const el = await driver.$(sel);
    if (await el.isExisting().catch(() => false)) {
      await el.click();
      console.log('✅ Switched to emoji keyboard');
      return true;
    }
  }

  console.log('⚠️ Emoji/globe key not found — continuing without switching');
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
      '✅ 🙌 🎉 🚀 💡 👀'+
      'Emoji with text: Hello 👋, This is tony with some messages  with emojis! 🎉🚀'+
      'I love coffee ☕ and coding 💻!'+
      'Lets go on lunch 🥗 🍔 🌭 🌮',
  },
  {
    id: '10_appointments', //TBD FOR NOW SINCE WE HAVE NO DATA
    text:
      'A#12345\n' +
      'WE HAVE NO DATA FOR THIS BUT WOULD BE GOOD TO TEST APPOINTMENT LINK RENDERING IN THE FUTURE',
  },
];

async function run() {
  let driver;
  const roomName = process.env.MARKDOWN_ROOM_NAME || 'Markdown room';

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);

    await tapByText(driver, roomName, DEFAULT_TIMEOUT);
    await saveScreenshot(driver, TEST_NAME, '01_room_opened.png');
    console.log(`✅ Opened room: ${roomName}`);

    for (const example of MARKDOWN_EXAMPLES) {
      if (example.useEmojiKeyboard) {
        await tapEmojiKeyboard(driver, DEFAULT_TIMEOUT);
      }
      await typeComposerMessage(driver, example.text, DEFAULT_TIMEOUT);
      await sendMessage(driver, DEFAULT_TIMEOUT);
      await driver.pause(600);
      await saveScreenshot(driver, TEST_NAME, `${example.id}.png`);
    }
  } catch (err) {
    console.error('❌ Test failed:', err);
    if (driver) {
      try { await saveScreenshot(driver, TEST_NAME, 'ERROR.png'); } catch {}
    }
    throw err;
  } finally {
    if (driver) await driver.deleteSession();
  }
}

run().catch(() => process.exit(1));
