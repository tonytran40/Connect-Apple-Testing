const DEFAULT_TIMEOUT = Number.parseInt(process.env.IOS_PERMISSION_PROMPT_TIMEOUT_MS, 10) || 1500;
const PHOTO_PROMPT_TIMEOUT =
  Number.parseInt(process.env.IOS_PHOTO_PERMISSION_PROMPT_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT;
const NOTIFICATION_PERMISSION_CHECKS = process.env.IOS_NOTIFICATION_PERMISSION_CHECKS !== '0';
const PHOTO_PERMISSION_SETTING = process.env.IOS_PHOTO_PERMISSION_CHECKS ?? process.env.ATTACHMENT_PHOTO_PERMISSION_CHECKS;
const PHOTO_PERMISSION_CHECKS = PHOTO_PERMISSION_SETTING !== '0';

let skipNotificationPermissionChecks = false;
let skipPhotoPermissionChecks = false;

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function tapFirstVisibleButton(driver, labels, timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const label of labels) {
      const safe = esc(label);
      const selectors = [
        `~${label}`,
        `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "${safe}" OR label == "${safe}")`,
      ];

      for (const selector of selectors) {
        const el = await driver.$(selector);
        if (await el.isDisplayed().catch(() => false)) {
          await el.click();
          return label;
        }
      }
    }

    await driver.pause(150);
  }

  return '';
}

async function tapFirstVisiblePromptOption(driver, labels, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const loose = options.loose === true;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const label of labels) {
      const safe = esc(label);
      const selectors = [
        `~${label}`,
        `-ios predicate string:type == "XCUIElementTypeButton" AND (name == "${safe}" OR label == "${safe}")`,
      ];

      if (loose) {
        selectors.push(
          `-ios predicate string:(type == "XCUIElementTypeButton" OR type == "XCUIElementTypeStaticText" OR type == "XCUIElementTypeCell") AND (name CONTAINS "${safe}" OR label CONTAINS "${safe}")`
        );
      }

      for (const selector of selectors) {
        const el = await driver.$(selector);
        if (!(await el.isDisplayed().catch(() => false))) {
          continue;
        }

        try {
          await el.click();
        } catch {
          const location = await el.getLocation();
          const size = await el.getSize();
          await driver.execute('mobile: tap', {
            x: Math.round(location.x + size.width / 2),
            y: Math.round(location.y + size.height / 2),
          });
        }
        return label;
      }
    }

    await driver.pause(150);
  }

  return '';
}

async function isPhotoLibraryPromptVisible(driver) {
  const prompt = await driver.$(
    '-ios predicate string:type == "XCUIElementTypeStaticText" AND (name CONTAINS[c] "Photo Library" OR label CONTAINS[c] "Photo Library")'
  );
  return prompt.isDisplayed().catch(() => false);
}

async function tapAllowFullPhotoAccessByCoordinates(driver) {
  if (!(await isPhotoLibraryPromptVisible(driver))) {
    return false;
  }

  const win = await driver.getWindowRect();
  await driver.execute('mobile: tap', {
    x: Math.round(win.width * 0.5),
    y: Math.round(win.height * 0.75),
  });
  console.log('permissions: tapped photo library prompt by fallback coordinates');
  await driver.pause(600);
  return true;
}

async function allowNotificationPromptIfNeeded(driver) {
  if (!NOTIFICATION_PERMISSION_CHECKS || skipNotificationPermissionChecks) {
    return false;
  }

  const tapped = await tapFirstVisibleButton(driver, ['Allow']);
  if (tapped) {
    console.log(`permissions: tapped notification prompt "${tapped}"`);
    await driver.pause(500);
    return true;
  }

  skipNotificationPermissionChecks = true;
  console.log('permissions: no notification prompt found; skipping future notification checks');
  return false;
}

async function allowPhotoLibraryPromptIfNeeded(driver) {
  if (!PHOTO_PERMISSION_CHECKS || skipPhotoPermissionChecks) {
    return false;
  }

  const tapped = await tapFirstVisiblePromptOption(
    driver,
    [
      'Allow Full Access',
      'Allow Access to All Photos',
      'Allow Access to Photos',
      'Select Photos',
      'OK',
    ],
    { loose: true, timeout: PHOTO_PROMPT_TIMEOUT }
  );

  if (tapped) {
    console.log(`permissions: tapped photo library prompt "${tapped}"`);
    await driver.pause(600);
    return true;
  }

  if (await tapAllowFullPhotoAccessByCoordinates(driver)) {
    return true;
  }

  skipPhotoPermissionChecks = true;
  console.log('permissions: no photo library prompt found; skipping future photo checks');
  return false;
}

module.exports = {
  allowNotificationPromptIfNeeded,
  allowPhotoLibraryPromptIfNeeded,
};
