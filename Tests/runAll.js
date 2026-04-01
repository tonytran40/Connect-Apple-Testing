require('dotenv').config();

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { resetToHome } = require('../utils/testSession');

const tests = [
  { name: 'CreateRoom', run: require('./CreateRoom').run },
  { name: 'newMessage', run: require('./newMessage').run },
  { name: 'PinnedMessages', run: require('./PinnedMessages').run },
  { name: 'markdowns', run: require('./markdowns').run },
  { name: 'User_Settings', run: require('./User_Settings').run },
  { name: 'Login_Signout', run: require('./Login_Signout').run },
];

async function run() {
  let driver;

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);

    for (const test of tests) {
      console.log(`Running ${test.name}`);
      await resetToHome(driver);
      await test.run(driver);
    }
  } finally {
    if (driver) {
      await driver.deleteSession();
    }
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('Suite failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
