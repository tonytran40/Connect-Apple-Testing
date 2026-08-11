require('dotenv').config();

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

async function prepareSimulatorLane() {
  let driver;
  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);
    console.log('Simulator lane is logged in and ready at the Connect home screen.');
  } finally {
    if (driver) await driver.deleteSession().catch(() => {});
  }
}

if (require.main === module) {
  prepareSimulatorLane().catch(error => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}

module.exports = { prepareSimulatorLane };
