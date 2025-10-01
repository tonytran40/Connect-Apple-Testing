const { remote } = require('webdriverio');
const fs = require('fs');

(async () => {
  const caps = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone 17 Pro',
    // optionally pin the exact booted sim by UDID:
    // 'appium:udid': 'A848480F-1933-47A5-B063-DB070BB3AC66',
    'appium:bundleId': 'com.powerhrg.connect.v3.debug', // ← your bundle id
    'appium:noReset': true,
    'appium:showXcodeLog': true,
    'appium:newCommandTimeout': 120
  };

  const driver = await remote({
    hostname: '127.0.0.1',
    port: 4723,
    path: '/', // Appium 2/3 default
    capabilities: caps
  });

  try {
    // Bring to foreground (in case it’s backgrounded)
    await driver.activateApp('com.powerhrg.connect.v3.debug');

    // Wait a moment for UI to settle, then save a screenshot
    await driver.pause(1500);
    const b64 = await driver.takeScreenshot();
    fs.writeFileSync('connect-launch.png', Buffer.from(b64, 'base64'));
    console.log('✅ Launched Connect iOS and saved screenshot → connect-launch.png');
  } finally {
    await driver.deleteSession();
  }
})();
