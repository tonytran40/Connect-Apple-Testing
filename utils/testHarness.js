const { runCliTimed } = require('./cliTestTiming');
const { saveScreenshot } = require('./screenshots');
const { runWithOptionalDriver } = require('./testSession');

function defineTest({ name, execute, captureErrorScreenshot = true, onError, prepareOptions }) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('defineTest requires a test name');
  }
  if (typeof execute !== 'function') {
    throw new TypeError(`defineTest(${name}) requires an execute function`);
  }
  if (prepareOptions !== undefined && typeof prepareOptions !== 'function') {
    throw new TypeError(`defineTest(${name}) prepareOptions must be a function`);
  }

  async function run(driver, options = {}) {
    // Validate fixtures and environment gates before creating an Appium session.
    const preparedOptions = prepareOptions ? await prepareOptions(options) : options;
    return runWithOptionalDriver(async activeDriver => {
      try {
        return await execute(activeDriver, preparedOptions);
      } catch (error) {
        if (captureErrorScreenshot) {
          await saveScreenshot(activeDriver, name, 'ERROR.png').catch(() => {});
        }
        if (typeof onError === 'function') {
          await onError(activeDriver, error, preparedOptions);
        }
        throw error;
      }
    }, driver);
  }

  function runIfMain(ownerModule) {
    if (require.main !== ownerModule) return false;

    runCliTimed(name, run).catch(error => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
    return true;
  }

  return Object.freeze({ run, runIfMain });
}

module.exports = { defineTest };
