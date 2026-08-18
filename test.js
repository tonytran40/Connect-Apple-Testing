const fs = require('fs');
const path = require('path');
const { createDriver } = require('./Login_Flow/Open_App');

async function run() {
  const driver = await createDriver();
  try {
    const bundleId = process.env.CONNECT_BUNDLE_ID || 'com.powerhrg.connect.v3.debug';
    await driver.activateApp(bundleId);
    await driver.pause(1500);

    const screenshot = await driver.takeScreenshot();
    const output = path.join(__dirname, 'connect-launch.png');
    fs.writeFileSync(output, Buffer.from(screenshot, 'base64'));
    console.log(`Launched Connect iOS and saved screenshot to ${output}`);
  } finally {
    await driver.deleteSession().catch(() => {});
  }
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { run };
