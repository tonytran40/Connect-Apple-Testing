const { allowPhotoLibraryPromptIfNeeded } = require('./permissions');
const {
  debugLog,
  findSimulatorPhotoItems,
  firstRowPhotoItems,
  getPickerGridBounds,
  gridTapPoints,
  scrollPhotoGridDown,
} = require('./attachmentPhotoPickerNavigation');
const { getSelectedPhotoCount, waitForSelectedPhotoCount } = require('./attachmentPhotoPickerState');

const PHOTO_MAX_SCROLLS = Number.parseInt(process.env.ATTACHMENT_PHOTO_MAX_SCROLLS, 10) || 8;
const PHOTO_TARGET_COUNT = Number.parseInt(process.env.ATTACHMENT_PHOTO_TARGET_COUNT, 10) || 3;
const PHOTO_FAST_TAP = process.env.ATTACHMENT_PHOTO_FAST_TAP !== '0';
const PHOTO_FAST_TAP_PAUSE_MS = Number.parseInt(process.env.ATTACHMENT_PHOTO_FAST_TAP_PAUSE_MS, 10) || 80;

async function tapPhotoAt(driver, x, y) {
  const attempts = [
    async () => driver.execute('mobile: tap', { x, y }),
    async () => {
      await driver.performActions([{
        type: 'pointer',
        id: 'photoTap',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x, y, origin: 'viewport' },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 80 },
          { type: 'pointerUp', button: 0 },
        ],
      }]);
      await driver.releaseActions();
    },
    async () => {
      await driver.action('pointer', { parameters: { pointerType: 'touch' } })
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

async function tapFirstRowGridFast(driver, limit) {
  const bounds = await getPickerGridBounds(driver);
  const points = gridTapPoints(bounds).slice(0, limit);
  for (const point of points) {
    await driver.execute('mobile: tap', point);
    if (PHOTO_FAST_TAP_PAUSE_MS > 0) await driver.pause(PHOTO_FAST_TAP_PAUSE_MS);
  }
  console.log(`attachments: fast tapped ${points.length} photo grid point(s)`);
  return points.length;
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
    if (await waitForSelectedPhotoCount(driver, expectedSelectedCount)) return true;
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
    debugLog('attachments.js:tapVisiblePhotoGrid', 'pass result', {
      attempted,
      actualTapped: actualTappedByPhotoTiles,
      branch: 'first-row-photo-tiles',
      photoItems: photoItems.length,
      firstRowItems: firstRowItems.length,
    }, 'E');
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
  debugLog('attachments.js:tapVisiblePhotoGrid', 'pass result', {
    attempted,
    actualTapped: actualTappedByGridPoints,
    branch: 'first-row-grid-fallback',
  }, 'A');
  return actualTappedByGridPoints;
}

async function tapAllPhotosInPicker(driver) {
  await allowPhotoLibraryPromptIfNeeded(driver);
  const maxItems = Math.min(
    Number.parseInt(process.env.ATTACHMENT_PHOTO_MAX_ITEMS, 10) || PHOTO_TARGET_COUNT,
    PHOTO_TARGET_COUNT
  );
  if (PHOTO_FAST_TAP) {
    const totalTapped = await tapFirstRowGridFast(driver, maxItems);
    if (totalTapped === 0) throw new Error('attachments: no photo grid points available for fast tap');
    return;
  }

  const tappedKeys = new Set();
  let totalTapped = 0;
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
  if (totalTapped === 0) throw new Error('attachments: no photos found in picker');
}

module.exports = {
  tapAllPhotosInPicker,
  tapFirstRowGridFast,
  tapPhotoAt,
  tapVisiblePhotoGrid,
};
