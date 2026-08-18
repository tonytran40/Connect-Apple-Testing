const { remote } = require('webdriverio');

async function createDriver() {
    const appiumPort = Number.parseInt(process.env.APPIUM_PORT, 10) || 4723;
    const deviceName = process.env.DEVICE_NAME || process.env.IOS_DEVICE_NAME || 'iPhone 17 Pro';
    const bundleId = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';
    const noReset = process.env.APPIUM_NO_RESET === '0' || process.env.APPIUM_NO_RESET === 'false' ? false : true;
    const newCommandTimeout = Number.parseInt(process.env.APPIUM_NEW_COMMAND_TIMEOUT, 10) || 120;
    const caps = {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': deviceName,
        'appium:bundleId': bundleId,
        //'appium:app': '/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app',
        'appium:noReset': noReset,
        // Reuse the app and WebDriverAgent between sessions unless a debug run opts out.
        'appium:useNewWDA': process.env.APPIUM_USE_NEW_WDA === '1',
        'appium:showXcodeLog': process.env.APPIUM_SHOW_XCODE_LOG === '1',
        'appium:newCommandTimeout': newCommandTimeout

    };

    if (process.env.SIMULATOR_UDID) {
        caps['appium:udid'] = process.env.SIMULATOR_UDID;
    }

    if (process.env.WDA_LOCAL_PORT) {
        caps['appium:wdaLocalPort'] = Number.parseInt(process.env.WDA_LOCAL_PORT, 10);
    }

    if (process.env.WDA_DERIVED_DATA_PATH) {
        caps['appium:derivedDataPath'] = process.env.WDA_DERIVED_DATA_PATH;
    }

    const driver = await remote({
        hostname: '127.0.0.1',
        port: appiumPort,
        path: '/',
        logLevel: process.env.WDIO_LOG_LEVEL || 'error',
        capabilities: caps
    });

    await driver.activateApp(bundleId);
    await driver.pause(Number.parseInt(process.env.APP_LAUNCH_SETTLE_MS, 10) || 1500);
    return driver;
}

module.exports = { createDriver };
