const { boundedInt } = require('./uiActions');

const LOST_CONNECTIVITY_SELECTOR =
  '-ios predicate string:(name CONTAINS "Lost connection" OR label CONTAINS "Lost connection")';
const DEFAULT_CONNECTIVITY_RECOVERY_TIMEOUT_MS = boundedInt(
  process.env.CONNECT_CONNECTION_RECOVERY_TIMEOUT_MS,
  120000,
  5000,
  300000
);

async function connectivityToastVisible(driver) {
  const toast = await driver.$(LOST_CONNECTIVITY_SELECTOR);
  return toast.isDisplayed().catch(() => false);
}

async function waitForConnectivity(driver, options = {}) {
  if (!(await connectivityToastVisible(driver))) return false;

  const timeout = options.timeout ?? DEFAULT_CONNECTIVITY_RECOVERY_TIMEOUT_MS;
  const interval = options.interval ?? 1000;
  console.log(`Connectivity toast visible; waiting up to ${timeout}ms for recovery`);
  await driver.waitUntil(async () => !(await connectivityToastVisible(driver)), {
    timeout,
    interval,
    timeoutMsg: `Connect remained offline for ${timeout}ms`,
  });
  console.log('Connect connectivity recovered');
  return true;
}

module.exports = { waitForConnectivity };
