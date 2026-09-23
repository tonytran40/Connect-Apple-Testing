const path = require('path');
const fs = require('fs');

const PHOTO_ROW_Y_TOLERANCE = Number.parseInt(process.env.ATTACHMENT_PHOTO_ROW_Y_TOLERANCE, 10) || 12;
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
  try { fs.appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8'); } catch {}
  fetch('http://127.0.0.1:7255/ingest/0b35b93b-08b7-43f8-a4b4-1d0d612ee38c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b54b4c' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

function isPickerChrome(name, label) {
  return /photos|collections|select up to|select items|search|cancel|close|filter|checkmark|done|add/.test(
    `${name} ${label}`.toLowerCase()
  );
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

async function findPhotoGridElements(driver) {
  const bounds = await getPickerGridBounds(driver);
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
      if (centerX < bounds.left || centerX > bounds.right || centerY < bounds.top || centerY > bounds.bottom) continue;
      if (size.width < 48 || size.height < 48) continue;
      const name = ((await el.getAttribute('name').catch(() => '')) || '').trim();
      const label = ((await el.getAttribute('label').catch(() => '')) || '').trim();
      if (isPickerChrome(name, label)) continue;
      candidates.push({
        center: { x: Math.round(centerX), y: Math.round(centerY) },
        area: size.width * size.height,
        key: `${name}|${label}|${loc.x},${loc.y}`,
      });
    }
  }
  candidates.sort((a, b) => b.area - a.area);
  const picked = [];
  for (const item of candidates) {
    if (picked.some(p => Math.abs(p.center.x - item.center.x) < 36 && Math.abs(p.center.y - item.center.y) < 36)) continue;
    picked.push(item);
  }
  return picked;
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
      try { rect = await el.getRect(); } catch { continue; }
      if (rect.width < 90 || rect.height < 90) continue;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      if (centerX < bounds.left || centerX > bounds.right || centerY < bounds.top || centerY > bounds.bottom) continue;
      const name = ((await el.getAttribute('name').catch(() => '')) || '').trim();
      const label = ((await el.getAttribute('label').catch(() => '')) || '').trim();
      const key = `${label || name}|${rect.x},${rect.y},${rect.width},${rect.height}`;
      if (candidates.some(item => item.key === key)) continue;
      candidates.push({
        el,
        key,
        rect,
        center: { x: Math.round(centerX), y: Math.round(centerY) },
      });
    }
  }
  candidates.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return candidates;
}

function firstRowPhotoItems(items, limit) {
  if (!items.length) return [];
  const firstY = items[0].rect.y;
  return items.filter(item => Math.abs(item.rect.y - firstY) <= PHOTO_ROW_Y_TOLERANCE).slice(0, limit);
}

async function logPickerDiagnostics(driver, stage) {
  const win = await driver.getWindowRect();
  const bounds = await getPickerGridBounds(driver);
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
      } catch { continue; }
      const centerX = loc.x + size.width / 2;
      const centerY = loc.y + size.height / 2;
      const name = ((await el.getAttribute('name').catch(() => '')) || '').slice(0, 80);
      const label = ((await el.getAttribute('label').catch(() => '')) || '').slice(0, 80);
      const displayed = await el.isDisplayed().catch(() => false);
      const inBounds = centerX >= bounds.left && centerX <= bounds.right && centerY >= bounds.top && centerY <= bounds.bottom;
      if (!inBounds) continue;
      if (isPickerChrome(name, label)) {
        inventory[type].filteredChrome += 1;
        continue;
      }
      if (inventory[type].inBounds.length < 10) {
        inventory[type].inBounds.push({ displayed, name, label, x: loc.x, y: loc.y, w: size.width, h: size.height });
      }
    }
  }
  let xmlSamples = [];
  try {
    const xml = await driver.getPageSource();
    xmlSamples = xml.split('\n')
      .filter(line => /Image|Cell|Select up to|Photos|Collections|ScrollView/i.test(line))
      .slice(0, 15)
      .map(line => line.trim().slice(0, 220));
  } catch {}
  const candidates = await findPhotoGridElements(driver);
  debugLog('attachments.js:logPickerDiagnostics', stage, {
    win,
    bounds,
    gridPoints: gridTapPoints(bounds),
    candidateCount: candidates.length,
    candidateCenters: candidates.slice(0, 9).map(c => ({ ...c.center, key: c.key.slice(0, 80) })),
    inventory,
    xmlSamples,
  }, 'A,B,C,D,E');
}

async function scrollPhotoGridDown(driver) {
  const bounds = await getPickerGridBounds(driver);
  const x = Math.round((bounds.left + bounds.right) / 2);
  const fromY = Math.round(bounds.bottom - (bounds.bottom - bounds.top) * 0.18);
  const toY = Math.round(bounds.top + (bounds.bottom - bounds.top) * 0.22);
  try {
    await driver.execute('mobile: dragFromToForDuration', { duration: 0.2, fromX: x, fromY, toX: x, toY });
  } catch {
    try {
      await driver.execute('mobile: swipe', { direction: 'up', x, y: Math.round((fromY + toY) / 2) });
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
  await driver.pause(350);
}

module.exports = {
  debugLog,
  findSimulatorPhotoItems,
  firstRowPhotoItems,
  getPickerGridBounds,
  gridTapPoints,
  isPickerChrome,
  logPickerDiagnostics,
  scrollPhotoGridDown,
};
