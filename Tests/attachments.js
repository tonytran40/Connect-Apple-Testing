require('dotenv').config();

const path = require('path');
const fs = require('fs');

const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { saveScreenshot } = require('../utils/screenshots');
const { runWithOptionalDriver, resetToHome } = require('../utils/testSession');
const { createPublicRoom } = require('./CreateRoom');

const TEST_NAME = 'attachments';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.ATTACHMENT_ROOM_TIMEOUT_MS, 10) || 20000;
const PHOTO_PICKER_TIMEOUT = Number.parseInt(process.env.ATTACHMENT_PHOTO_PICKER_TIMEOUT_MS, 10) || 20000;
const PHOTO_MAX_SCROLLS = Number.parseInt(process.env.ATTACHMENT_PHOTO_MAX_SCROLLS, 10) || 8;
const PHOTO_TAP_PAUSE_MS = Number.parseInt(process.env.ATTACHMENT_PHOTO_TAP_PAUSE_MS, 10) || 200;
const PHOTO_TARGET_COUNT = Number.parseInt(process.env.ATTACHMENT_PHOTO_TARGET_COUNT, 10) || 3;
const PHOTO_SELECT_WAIT_MS = Number.parseInt(process.env.ATTACHMENT_PHOTO_SELECT_WAIT_MS, 10) || 900;
const PHOTO_ROW_Y_TOLERANCE = Number.parseInt(process.env.ATTACHMENT_PHOTO_ROW_Y_TOLERANCE, 10) || 12;
const COMPOSER_ATTACHMENT_SETTLE_MS =
  Number.parseInt(process.env.ATTACHMENT_COMPOSER_SETTLE_MS, 10) || 5000;
const DEBUG_PICKER = process.env.ATTACHMENT_DEBUG_PICKER === '1';
const USE_EXISTING_ROOM = process.env.ATTACHMENT_USE_EXISTING_ROOM === '1';
const SHARE_OPTIONS = ['Attach Photos', 'Attach Files', 'Send GIF'];

// #region agent log
const DEBUG_LOG_PATH = path.join(__dirname, '..', '.cursor', 'debug-b54b4c.log');

function debugLog(location, message, data = {}, hypothesisId = '') {
  const entry = {
    sessionId: 'b54b4c',
    runId: process.env.DEBUG_RUN_ID || 'pre-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {}
  fetch('http://127.0.0.1:7255/ingest/0b35b93b-08b7-43f8-a4b4-1d0d612ee38c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b54b4c' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
// #endregion

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Same shape as `generateRoomName('Public', key)` but uses "AttachmentRoom" instead of "Public Room". */
function generateAttachmentRoomName(sortKey) {
  const rand = Math.random().toString(36).slice(2, 10);
  const key =
    typeof sortKey === 'string' && sortKey.trim().length > 0 ? sortKey.trim().charAt(0) : 'A';
  return `${key}-AttachmentRoom-${rand}`;
}

function resolveAttachmentRoomName() {
  const explicit = (process.env.ATTACHMENT_ROOM_NAME || '').trim();
  if (explicit) return explicit;
  const sortKey = process.env.ATTACHMENT_ROOM_SORT_KEY || 'A';
  return generateAttachmentRoomName(sortKey);
}

async function pause(driver, ms) {
  if (ms > 0) await driver.pause(ms);
}

async function waitForInRoom(driver, timeout = DEFAULT_TIMEOUT) {
  const header = await driver.$('~openRoomSettingsButton');
  await header.waitForDisplayed({ timeout });
}

async function tapByText(driver, text, timeout = DEFAULT_TIMEOUT) {
  const safe = esc(text);

  const textEl = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label == "${safe}" OR name == "${safe}")`
  );

  if (await textEl.isExisting().catch(() => false)) {
    await textEl.waitForDisplayed({ timeout });
    await textEl.click();
    return;
  }

  const parentCell = await driver.$(
    `//XCUIElementTypeStaticText[@name="${text}" or @label="${text}"]/ancestor::XCUIElementTypeCell[1]`
  );
  await parentCell.waitForDisplayed({ timeout });
  await parentCell.click();
}

async function openExistingRoom(driver, roomName, timeout = DEFAULT_TIMEOUT) {
  const maxScrolls = Number.parseInt(process.env.ATTACHMENT_ROOM_MAX_SCROLLS, 10) || 8;
  const deadline = Date.now() + timeout;
  for (let scroll = 0; scroll <= maxScrolls && Date.now() < deadline; scroll += 1) {
    try {
      await tapByText(driver, roomName, Math.min(2500, timeout));
      await waitForInRoom(driver, Math.min(5000, timeout));
      console.log(`attachments: opened existing room "${roomName}"`);
      return;
    } catch {}

    if (scroll < maxScrolls) {
      try {
        await driver.execute('mobile: scroll', { direction: 'down' });
      } catch {
        try {
          await driver.execute('mobile: swipe', { direction: 'down' });
        } catch {}
      }
    }
    await pause(driver, 350);
  }

  throw new Error(`attachments: room "${roomName}" was not visible`);
}

async function tapShareOptionsButton(driver, timeout = DEFAULT_TIMEOUT) {
  const btn = await driver.$('~shareOptionsButton');
  await btn.waitForDisplayed({ timeout });
  await btn.click();
  console.log('attachments: tapped ~shareOptionsButton');
}

async function waitForShareOptionsDialog(driver, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const sendGif = await driver.$('~Send GIF');
    if (await sendGif.isExisting().catch(() => false) && (await sendGif.isDisplayed().catch(() => false))) {
      return 'Send GIF';
    }

    for (const label of SHARE_OPTIONS) {
      const safe = esc(label);
      const el = await driver.$(
        `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (name == "${safe}" OR label == "${safe}")`
      );
      if (await el.isExisting().catch(() => false) && (await el.isDisplayed().catch(() => false))) {
        return label;
      }
    }
    await pause(driver, 200);
  }

  throw new Error('attachments: share options dialog did not appear');
}

async function tapShareOption(driver, label, timeout = DEFAULT_TIMEOUT) {
  if (label === 'Send GIF') {
    const byId = await driver.$('~Send GIF');
    await byId.waitForDisplayed({ timeout });
    await byId.click();
    console.log('attachments: tapped Send GIF (~Send GIF)');
    return;
  }

  const safe = esc(label);
  const el = await driver.$(
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (name == "${safe}" OR label == "${safe}")`
  );
  await el.waitForDisplayed({ timeout });
  await el.click();
  console.log(`attachments: tapped "${label}"`);
}

async function dismissPhotoLibraryPermissionIfNeeded(driver) {
  for (const label of [
    'Allow Full Access',
    'Allow Access to All Photos',
    'Allow Access to Photos',
    'Select Photos',
    'OK',
  ]) {
    const safe = esc(label);
    const btn = await driver.$(
      `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "${safe}" OR label == "${safe}")`
    );
    if (await btn.isExisting().catch(() => false) && (await btn.isDisplayed().catch(() => false))) {
      await btn.click();
      console.log(`attachments: dismissed photo permission ("${label}")`);
      await pause(driver, 400);
      return;
    }
  }
}

async function waitForPhotoPicker(driver, timeout = PHOTO_PICKER_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await dismissPhotoLibraryPermissionIfNeeded(driver);

    const signals = [
      '-ios predicate string:(type == "XCUIElementTypeStaticText") AND (name CONTAINS "Select up to" OR label CONTAINS "Select up to")',
      '-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (name == "Photos" OR label == "Photos")',
      '-ios predicate string:(type == "XCUIElementTypeStaticText") AND (name CONTAINS "Select Items" OR label CONTAINS "Select Items")',
    ];

    for (const selector of signals) {
      const el = await driver.$(selector);
      if (await el.isExisting().catch(() => false)) {
        return;
      }
    }
    await pause(driver, 250);
  }

  throw new Error('attachments: photo picker did not appear');
}

async function tapDoneInPhotoPicker(driver, timeout = DEFAULT_TIMEOUT) {
  const doneButton = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Done" OR label == "Done")`
  );
  if (await doneButton.isExisting().catch(() => false)) {
    await doneButton.waitForDisplayed({ timeout });
    await doneButton.click();
    console.log('attachments: tapped photo picker Done');
    return;
  }

  const win = await driver.getWindowRect();
  const x = Math.round(win.width * 0.88);
  const y = Math.round(win.height * 0.15);
  await driver.execute('mobile: tap', { x, y });
  console.log(`attachments: tapped photo picker Done at (${x}, ${y})`);
}

async function waitForAttachmentDraftInComposer(driver, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const inRoom = await driver.$('~openRoomSettingsButton').isDisplayed().catch(() => false);
    const sendEnabled = await driver.$('~sendMessageButton').isEnabled().catch(() => false);
    const doneVisible = await driver
      .$(`-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Done" OR label == "Done")`)
      .isDisplayed()
      .catch(() => false);

    if (inRoom && sendEnabled && !doneVisible) {
      return;
    }
    await pause(driver, 150);
  }

  throw new Error('attachments: attachment draft did not appear in composer');
}

async function sendComposerDraft(driver, timeout = DEFAULT_TIMEOUT) {
  const sendBtn = await driver.$('~sendMessageButton');
  await sendBtn.waitForEnabled({ timeout });
  await sendBtn.click();
  console.log('attachments: sent attachment draft');
}

async function logPickerDiagnostics(driver, stage) {
  const win = await driver.getWindowRect();
  const bounds = await getPickerGridBounds(driver);
  const gridPoints = gridTapPoints(bounds);
  const inventory = {};

  for (const type of ['XCUIElementTypeImage', 'XCUIElementTypeCell', 'XCUIElementTypeButton', 'XCUIElementTypeOther', 'XCUIElementTypeScrollView']) {
    const els = await driver.$$(type);
    inventory[type] = { total: els.length, inBounds: [], filteredChrome: 0 };
    for (const el of els) {
      let loc;
      let size;
      try {
        loc = await el.getLocation();
        size = await el.getSize();
      } catch {
        continue;
      }
      const centerX = loc.x + size.width / 2;
      const centerY = loc.y + size.height / 2;
      const name = ((await el.getAttribute('name').catch(() => '')) || '').slice(0, 80);
      const label = ((await el.getAttribute('label').catch(() => '')) || '').slice(0, 80);
      const displayed = await el.isDisplayed().catch(() => false);
      const inBounds =
        centerX >= bounds.left &&
        centerX <= bounds.right &&
        centerY >= bounds.top &&
        centerY <= bounds.bottom;
      if (!inBounds) continue;
      if (isPickerChrome(name, label)) {
        inventory[type].filteredChrome += 1;
        continue;
      }
      if (inventory[type].inBounds.length < 10) {
        inventory[type].inBounds.push({
          displayed,
          name,
          label,
          x: loc.x,
          y: loc.y,
          w: size.width,
          h: size.height,
        });
      }
    }
  }

  let xmlSamples = [];
  try {
    const xml = await driver.getPageSource();
    xmlSamples = xml
      .split('\n')
      .filter(l => /Image|Cell|Select up to|Photos|Collections|ScrollView/i.test(l))
      .slice(0, 15)
      .map(l => l.trim().slice(0, 220));
  } catch {}

  const candidates = await findPhotoGridElements(driver);
  // #region agent log
  debugLog(
    'attachments.js:logPickerDiagnostics',
    stage,
    {
      win,
      bounds,
      gridPoints,
      candidateCount: candidates.length,
      candidateCenters: candidates.slice(0, 9).map(c => ({ ...c.center, key: c.key.slice(0, 80) })),
      inventory,
      xmlSamples,
    },
    'A,B,C,D,E'
  );
  // #endregion
}

function isPickerChrome(name, label) {
  const blob = `${name} ${label}`.toLowerCase();
  return /photos|collections|select up to|select items|search|cancel|close|filter|checkmark|done|add/.test(blob);
}

async function getPickerGridBounds(driver) {
  const win = await driver.getWindowRect();
  return {
    left: Math.round(win.width * 0.07),
    right: Math.round(win.width * 0.93),
    top: Math.round(win.height * 0.32),
    bottom: Math.round(win.height * 0.78),
    cols: Number.parseInt(process.env.ATTACHMENT_PHOTO_GRID_COLS, 10) || 3,
    rows: Number.parseInt(process.env.ATTACHMENT_PHOTO_GRID_ROWS, 10) || 2,
  };
}

async function findPhotoGridScrollView(driver) {
  const scrollViews = await driver.$$('XCUIElementTypeScrollView');
  let best = null;
  let bestArea = 0;

  for (const sv of scrollViews) {
    let loc;
    let size;
    try {
      loc = await sv.getLocation();
      size = await sv.getSize();
    } catch {
      continue;
    }
    if (size.height < 180 || size.width < 200) continue;
    const area = size.width * size.height;
    if (area > bestArea) {
      bestArea = area;
      best = { loc, size };
    }
  }

  return best;
}

async function isDoneEnabled(driver) {
  const doneButton = await driver.$(
    `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "Done" OR label == "Done")`
  );
  if (!(await doneButton.isExisting().catch(() => false))) {
    return null;
  }

  try {
    return await doneButton.isEnabled();
  } catch {}

  const enabledAttr = await doneButton.getAttribute('enabled').catch(() => null);
  if (enabledAttr == null) return null;
  return String(enabledAttr).toLowerCase() === 'true' || String(enabledAttr) === '1';
}

function parseSelectedPhotoCount(text) {
  const match = String(text || '').match(/\b(\d+)\s+Photos?\b/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

async function getSelectedPhotoCount(driver) {
  const selectors = [
    `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText") AND (label MATCHES "^[0-9]+ Photos?$" OR name MATCHES "^[0-9]+ Photos?$")`,
    `//XCUIElementTypeButton[contains(@name,"Photo") or contains(@label,"Photo")]`,
    `//XCUIElementTypeStaticText[contains(@name,"Photo") or contains(@label,"Photo")]`,
  ];

  for (const selector of selectors) {
    const els = await driver.$$(selector);
    for (const el of els) {
      const name = await el.getAttribute('name').catch(() => '');
      const label = await el.getAttribute('label').catch(() => '');
      const count = parseSelectedPhotoCount(label || name);
      if (count != null) {
        return count;
      }
    }
  }

  return 0;
}

async function waitForSelectedPhotoCount(driver, expectedCount, timeout = PHOTO_SELECT_WAIT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const count = await getSelectedPhotoCount(driver);
    if (count >= expectedCount) {
      return true;
    }
    await pause(driver, 75);
  }
  return false;
}

async function readPhotoSelectionState(el) {
  const state = {};
  for (const attr of ['selected', 'value', 'name', 'label']) {
    state[attr] = await el.getAttribute(attr).catch(() => null);
  }
  return state;
}

function selectionStateImpliesSelected(state = {}) {
  if (state.selected != null) {
    const raw = String(state.selected).toLowerCase();
    if (raw === 'true' || raw === '1') return true;
  }

  const blob = `${state.value || ''} ${state.name || ''} ${state.label || ''}`.toLowerCase();
  return /\bselected\b|\bchecked\b|\bchosen\b/.test(blob);
}

async function findSimulatorPhotoItems(driver) {
  const bounds = await getPickerGridBounds(driver);
  const selectors = [
    `-ios predicate string:type == "XCUIElementTypeImage" AND (name BEGINSWITH "Photo," OR label BEGINSWITH "Photo,")`,
    `-ios predicate string:(type == "XCUIElementTypeCell" OR type == "XCUIElementTypeButton") AND (name BEGINSWITH "Photo," OR label BEGINSWITH "Photo,")`,
    `//XCUIElementTypeScrollView//XCUIElementTypeImage[contains(@name,"Photo,") or contains(@label,"Photo,")]`,
  ];

  const candidates = [];

  for (const selector of selectors) {
    const els = await driver.$$(selector);
    for (const el of els) {
      let rect;
      try {
        rect = await el.getRect();
      } catch {
        continue;
      }

      if (rect.width < 90 || rect.height < 90) continue;

      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      if (centerX < bounds.left || centerX > bounds.right) continue;
      if (centerY < bounds.top || centerY > bounds.bottom) continue;

      const name = ((await el.getAttribute('name').catch(() => '')) || '').trim();
      const label = ((await el.getAttribute('label').catch(() => '')) || '').trim();
      const key = `${label || name}|${rect.x},${rect.y},${rect.width},${rect.height}`;

      if (candidates.some(item => item.key === key)) continue;

      candidates.push({
        el,
        key,
        rect,
        name,
        label,
        center: {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        },
      });
    }
  }

  candidates.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return candidates;
}

function firstRowPhotoItems(items, limit) {
  if (!items.length) return [];
  const firstY = items[0].rect.y;
  return items
    .filter(item => Math.abs(item.rect.y - firstY) <= PHOTO_ROW_Y_TOLERANCE)
    .slice(0, limit);
}

function centersOverlap(a, b, tolerance = 36) {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
}

async function findPhotoGridElements(driver) {
  const bounds = await getPickerGridBounds(driver);
  const minSize = 48;
  const candidates = [];

  for (const type of ['XCUIElementTypeImage', 'XCUIElementTypeCell', 'XCUIElementTypeButton', 'XCUIElementTypeOther']) {
    const els = await driver.$$(type);
    for (const el of els) {
      let loc;
      let size;
      try {
        loc = await el.getLocation();
        size = await el.getSize();
      } catch {
        continue;
      }

      const centerX = loc.x + size.width / 2;
      const centerY = loc.y + size.height / 2;
      if (centerX < bounds.left || centerX > bounds.right) continue;
      if (centerY < bounds.top || centerY > bounds.bottom) continue;
      if (size.width < minSize || size.height < minSize) continue;

      const name = ((await el.getAttribute('name').catch(() => '')) || '').trim();
      const label = ((await el.getAttribute('label').catch(() => '')) || '').trim();
      if (isPickerChrome(name, label)) continue;

      candidates.push({
        el,
        center: { x: Math.round(centerX), y: Math.round(centerY) },
        area: size.width * size.height,
        key: `${name}|${label}|${loc.x},${loc.y}`,
      });
    }
  }

  candidates.sort((a, b) => b.area - a.area);
  const picked = [];
  for (const item of candidates) {
    if (picked.some(p => centersOverlap(p.center, item.center))) continue;
    picked.push(item);
  }

  return picked;
}

function gridTapPoints(bounds) {
  const points = [];
  const cellW = (bounds.right - bounds.left) / bounds.cols;
  const cellH = (bounds.bottom - bounds.top) / bounds.rows;
  for (let row = 0; row < bounds.rows; row += 1) {
    for (let col = 0; col < bounds.cols; col += 1) {
      points.push({
        x: Math.round(bounds.left + cellW * (col + 0.5)),
        y: Math.round(bounds.top + cellH * (row + 0.5)),
      });
    }
  }
  return points;
}

async function tapPhotoAt(driver, x, y) {
  const attempts = [
    async () => {
      await driver.execute('mobile: tap', { x, y });
    },
    async () => {
      await driver.performActions([
        {
          type: 'pointer',
          id: 'photoTap',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 80 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await driver.releaseActions();
    },
    async () => {
      await driver
        .action('pointer', { parameters: { pointerType: 'touch' } })
        .move({ duration: 0, x, y, origin: 'viewport' })
        .down({ button: 0 })
        .pause(80)
        .up({ button: 0 })
        .perform();
    },
  ];

  for (let i = 0; i < attempts.length; i += 1) {
    try {
      await attempts[i]();
      debugLog('attachments.js:tapPhotoAt', 'tap ok', { x, y, method: i }, 'C');
      return true;
    } catch (err) {
      if (i === attempts.length - 1) {
        debugLog('attachments.js:tapPhotoAt', 'tap failed', { x, y, error: err?.message || String(err) }, 'C');
      }
    }
  }
  return false;
}

async function photoTapLooksSuccessful(driver, item, beforeDoneEnabled, beforeSelection, beforeSelectedCount) {
  const afterSelectedCount = await getSelectedPhotoCount(driver);
  if (afterSelectedCount > beforeSelectedCount) {
    return true;
  }

  // Once the picker exposes a concrete selected-count chip, trust that over weaker heuristics.
  if (beforeSelectedCount > 0 || afterSelectedCount > 0) {
    return false;
  }

  const afterDoneEnabled = await isDoneEnabled(driver);
  if (beforeDoneEnabled === false && afterDoneEnabled === true) {
    return true;
  }

  const afterSelection = await readPhotoSelectionState(item.el);
  if (!selectionStateImpliesSelected(beforeSelection) && selectionStateImpliesSelected(afterSelection)) {
    return true;
  }

  const stateChanged =
    beforeSelection.selected !== afterSelection.selected ||
    beforeSelection.value !== afterSelection.value ||
    beforeSelection.label !== afterSelection.label ||
    beforeSelection.name !== afterSelection.name;

  return stateChanged && selectionStateImpliesSelected(afterSelection);
}

async function tapPhotoCandidate(driver, item, expectedSelectedCount) {
  const tapPoints = [
    item.center,
    {
      x: Math.min(item.rect.x + item.rect.width - 20, item.center.x + 24),
      y: Math.min(item.rect.y + item.rect.height - 20, item.center.y + 24),
    },
    { x: item.center.x, y: Math.max(item.rect.y + 18, item.center.y - 10) },
  ];

  for (const point of tapPoints) {
    if (!(await tapPhotoAt(driver, point.x, point.y))) continue;
    if (await waitForSelectedPhotoCount(driver, expectedSelectedCount)) {
      return true;
    }
    await pause(driver, PHOTO_TAP_PAUSE_MS);
  }

  return false;
}

async function tapVisiblePhotoGrid(driver, tappedKeys, limit = PHOTO_TARGET_COUNT) {
  const selectedCountBeforePass = await getSelectedPhotoCount(driver);

  const photoItems = await findSimulatorPhotoItems(driver);
  const firstRowItems = firstRowPhotoItems(photoItems, limit);
  let attempted = 0;

  for (const item of firstRowItems) {
    if (tappedKeys.has(item.key)) continue;
    const currentSelectedCount = await getSelectedPhotoCount(driver);
    if (await tapPhotoCandidate(driver, item, currentSelectedCount + 1)) {
      tappedKeys.add(item.key);
      attempted += 1;
      if (attempted >= limit) break;
    }
  }

  const selectedCountAfterPhotoTiles = await getSelectedPhotoCount(driver);
  const actualTappedByPhotoTiles = Math.max(0, selectedCountAfterPhotoTiles - selectedCountBeforePass);
  if (actualTappedByPhotoTiles > 0) {
    debugLog(
      'attachments.js:tapVisiblePhotoGrid',
      'pass result',
      {
        attempted,
        actualTapped: actualTappedByPhotoTiles,
        branch: 'first-row-photo-tiles',
        photoItems: photoItems.length,
        firstRowItems: firstRowItems.length,
      },
      'E'
    );
    return actualTappedByPhotoTiles;
  }

  const bounds = await getPickerGridBounds(driver);
  const firstRowGridPoints = gridTapPoints(bounds).slice(0, limit);
  for (const point of firstRowGridPoints) {
    const currentSelectedCount = await getSelectedPhotoCount(driver);
    if (!(await tapPhotoAt(driver, point.x, point.y))) continue;
    if (!(await waitForSelectedPhotoCount(driver, currentSelectedCount + 1))) continue;
    attempted += 1;
  }

  const selectedCountAfterGridPoints = await getSelectedPhotoCount(driver);
  const actualTappedByGridPoints = Math.max(0, selectedCountAfterGridPoints - selectedCountBeforePass);
  debugLog(
    'attachments.js:tapVisiblePhotoGrid',
    'pass result',
    { attempted, actualTapped: actualTappedByGridPoints, branch: 'first-row-grid-fallback' },
    'A'
  );
  return actualTappedByGridPoints;
}

async function scrollPhotoGridDown(driver) {
  const bounds = await getPickerGridBounds(driver);
  const x = Math.round((bounds.left + bounds.right) / 2);
  const fromY = Math.round(bounds.bottom - (bounds.bottom - bounds.top) * 0.18);
  const toY = Math.round(bounds.top + (bounds.bottom - bounds.top) * 0.22);

  try {
    await driver.execute('mobile: dragFromToForDuration', {
      duration: 0.2,
      fromX: x,
      fromY,
      toX: x,
      toY,
    });
  } catch {
    try {
      await driver.execute('mobile: swipe', {
        direction: 'up',
        x,
        y: Math.round((fromY + toY) / 2),
      });
    } catch {
      const win = await driver.getWindowRect();
      await driver.execute('mobile: dragFromToForDuration', {
        duration: 0.35,
        fromX: Math.round(win.width / 2),
        fromY: Math.round(win.height * 0.72),
        toX: Math.round(win.width / 2),
        toY: Math.round(win.height * 0.38),
      });
    }
  }
  await pause(driver, 350);
}

async function tapAllPhotosInPicker(driver) {
  await dismissPhotoLibraryPermissionIfNeeded(driver);
  const tappedKeys = new Set();
  let totalTapped = 0;
  const maxItems = Math.min(
    Number.parseInt(process.env.ATTACHMENT_PHOTO_MAX_ITEMS, 10) || PHOTO_TARGET_COUNT,
    PHOTO_TARGET_COUNT
  );

  for (let scroll = 0; scroll <= PHOTO_MAX_SCROLLS; scroll += 1) {
    const remaining = maxItems - totalTapped;
    if (remaining <= 0) break;

    const tappedThisPass = await tapVisiblePhotoGrid(driver, tappedKeys, remaining);
    totalTapped += tappedThisPass;
    console.log(`attachments: photo picker pass ${scroll + 1}, tapped ${tappedThisPass}`);

    if (totalTapped >= maxItems) break;
    if (scroll === 0) break;
    if (tappedThisPass === 0 && scroll > 0) break;
    if (scroll < PHOTO_MAX_SCROLLS) await scrollPhotoGridDown(driver);
  }

  console.log(`attachments: tapped ${totalTapped} photo(s) total`);
  if (totalTapped === 0) {
    throw new Error('attachments: no photos found in picker');
  }
}

async function runTest(driver, options = {}) {
  const { skipLogin = false } = options;

  if (!skipLogin) {
    await ensureLoggedIn(driver);
    await pause(driver, 400);
  }

  await resetToHome(driver);
  await pause(driver, 450);

  const roomName = resolveAttachmentRoomName();
  if (USE_EXISTING_ROOM) {
    console.log(`attachments: opening existing room "${roomName}"`);
    await openExistingRoom(driver, roomName);
  } else {
    console.log(`attachments: creating "${roomName}"`);
    await createPublicRoom(driver, roomName);
    await pause(driver, 600);
    await waitForInRoom(driver);
  }
  await saveScreenshot(driver, TEST_NAME, '01_in_room.png');

  await tapShareOptionsButton(driver);
  await pause(driver, 400);
  const visibleOption = await waitForShareOptionsDialog(driver);
  console.log(`attachments: share options dialog visible (${visibleOption})`);
  await saveScreenshot(driver, TEST_NAME, '02_share_options_dialog.png');

  await tapShareOption(driver, 'Attach Photos');
  await pause(driver, 800);
  await waitForPhotoPicker(driver);
  await saveScreenshot(driver, TEST_NAME, '03_photo_picker_open.png');

  if (DEBUG_PICKER) {
    await logPickerDiagnostics(driver, 'before_tap_all');
  }
  await tapAllPhotosInPicker(driver);
  await pause(driver, 400);
  await saveScreenshot(driver, TEST_NAME, '04_after_tap_all_photos.png');

  await tapDoneInPhotoPicker(driver);
  await waitForAttachmentDraftInComposer(driver);
  await pause(driver, COMPOSER_ATTACHMENT_SETTLE_MS);
  await saveScreenshot(driver, TEST_NAME, '05_attachment_in_composer.png');

  await sendComposerDraft(driver);
  await pause(driver, 500);
  await saveScreenshot(driver, TEST_NAME, '06_after_send_attachment.png');
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

module.exports = { run, generateAttachmentRoomName, resolveAttachmentRoomName };

if (require.main === module) {
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed(TEST_NAME, run).catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}
