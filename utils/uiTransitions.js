const DEFAULT_TIMEOUT = 20000;
const DEFAULT_INTERVAL = 100;

async function waitForCondition(driver, condition, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    interval = DEFAULT_INTERVAL,
    timeoutMsg = 'Timed out waiting for the UI to reach the expected state',
  } = options;
  let observedValue;

  await driver.waitUntil(
    async () => {
      const value = await condition();
      if (!value) return false;
      observedValue = value;
      return true;
    },
    { timeout, interval, timeoutMsg }
  );

  return observedValue;
}

async function resolveElement(driver, target) {
  if (typeof target === 'function') return target();
  if (typeof target === 'string') return driver.$(target);
  return target;
}

async function displayedElement(driver, target) {
  try {
    const element = await resolveElement(driver, target);
    if (!element) return false;
    if (typeof element.isExisting === 'function' && !(await element.isExisting())) return false;
    return (await element.isDisplayed()) ? element : false;
  } catch {
    return false;
  }
}

async function waitForElementDisplayed(driver, target, options = {}) {
  return waitForCondition(driver, () => displayedElement(driver, target), options);
}

async function waitForAnyElementDisplayed(driver, targets, options = {}) {
  return waitForCondition(
    driver,
    async () => {
      for (const target of targets) {
        const element = await displayedElement(driver, target);
        if (element) return element;
      }
      return false;
    },
    options
  );
}

async function waitForElementEnabled(driver, target, options = {}) {
  return waitForCondition(
    driver,
    async () => {
      const element = await displayedElement(driver, target);
      if (!element) return false;
      return (await element.isEnabled()) ? element : false;
    },
    options
  );
}

async function waitForElementHidden(driver, target, options = {}) {
  await waitForCondition(
    driver,
    async () => {
      try {
        const element = await resolveElement(driver, target);
        if (!element) return true;
        if (typeof element.isExisting === 'function' && !(await element.isExisting())) return true;
        return !(await element.isDisplayed());
      } catch {
        return true;
      }
    },
    options
  );
}

module.exports = {
  waitForAnyElementDisplayed,
  waitForCondition,
  waitForElementDisplayed,
  waitForElementEnabled,
  waitForElementHidden,
};
