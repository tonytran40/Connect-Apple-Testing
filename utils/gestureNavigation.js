const { SELECTORS } = require('./selectors');
const { getElementRect } = require('./uiActions');

async function swipeViewport(driver, direction, options = {}) {
  const rect = await driver.getWindowRect();
  const x = Math.round(rect.width * 0.5);
  const startY = Math.round(rect.height * (direction === 'down' ? 0.35 : 0.75));
  const endY = Math.round(rect.height * (direction === 'down' ? 0.78 : 0.35));
  const holdMs = options.holdMs ?? 100;
  const durationMs = options.durationMs ?? 450;

  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: holdMs },
        { type: 'pointerMove', duration: durationMs, origin: 'viewport', x, y: endY },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]);
  await driver.releaseActions().catch(() => {});
}

function scopedSwipeCoordinates(rect, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`Unsupported swipe direction: ${direction}`);
  }

  const rawValues = [rect?.x, rect?.y, rect?.width, rect?.height];
  if (rawValues.some(value => value === null || value === undefined || value === '')) return null;

  const values = rawValues.map(Number);
  if (values.some(value => !Number.isFinite(value)) || values[2] < 2 || values[3] < 40) return null;

  const [left, top, width, height] = values;
  const x = Math.round(left + width * 0.5);
  const upperY = Math.round(top + height * 0.25);
  const lowerY = Math.round(top + height * 0.75);
  return {
    x,
    startY: direction === 'down' ? upperY : lowerY,
    endY: direction === 'down' ? lowerY : upperY,
  };
}

function clipRectToViewport(rect, viewport) {
  const left = Math.max(Number(rect?.x), Number(viewport?.x || 0));
  const top = Math.max(Number(rect?.y), Number(viewport?.y || 0));
  const right = Math.min(Number(rect?.x) + Number(rect?.width), Number(viewport?.x || 0) + Number(viewport?.width));
  const bottom = Math.min(Number(rect?.y) + Number(rect?.height), Number(viewport?.y || 0) + Number(viewport?.height));

  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function performScopedSwipe(driver, coordinates, options = {}) {
  const holdMs = options.holdMs ?? 100;
  const durationMs = options.durationMs ?? 450;
  try {
    await driver.performActions([
      {
        type: 'pointer',
        id: 'conversationListSwipe',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, origin: 'viewport', x: coordinates.x, y: coordinates.startY },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: holdMs },
          { type: 'pointerMove', duration: durationMs, origin: 'viewport', x: coordinates.x, y: coordinates.endY },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
  } finally {
    await driver.releaseActions().catch(() => {});
  }
}

async function swipeConversationList(driver, direction, options = {}) {
  if (direction !== 'up' && direction !== 'down') throw new Error(`Unsupported swipe direction: ${direction}`);

  try {
    const container = await driver.$(SELECTORS.bookmarksScrollView);
    if (await container.isDisplayed().catch(() => false)) {
      const visibleRect = clipRectToViewport(await getElementRect(container), await driver.getWindowRect());
      const coordinates = scopedSwipeCoordinates(visibleRect, direction);
      if (coordinates) {
        await performScopedSwipe(driver, coordinates, options);
        return true;
      }
    }
  } catch {}

  await swipeViewport(driver, direction, options);
  return false;
}

module.exports = { clipRectToViewport, scopedSwipeCoordinates, swipeConversationList };
