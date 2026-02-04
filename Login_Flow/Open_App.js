const {remote} = require('webdriverio');

async function createDriver(){
    const caps = {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': 'iPhone 17 Pro',
        'appium:bundleId': 'com.powerhrg.connect.v3.debug',
        'appium:waitForQuiescence': false,
        'appium:waitForIdleTimeout': 0,
        'appium:shouldUseCompactResponses': true,
        //'appium:app': '/Users/tony.tran/Library/Developer/Xcode/DerivedData/Connect-avitsdrqdscjvxbysyyzqofypfnh/Build/Products/Debug-iphonesimulator/Connect iOS.app',
        'appium:noReset': true,
        'appium:showXcodeLog': false,
        'appium:newCommandTimeout': 120

    };
    const driver = await remote({
        hostname: '127.0.0.1',
        port: 4723,
        path: '/',
        capabilities: caps
    });

    await driver.activateApp('com.powerhrg.connect.v3.debug');
    await driver.pause(1500);
    return driver;  
}

module.exports ={createDriver};