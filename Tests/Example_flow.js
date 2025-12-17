const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');

(async () => {
  const driver = await createDriver();

  try {
    await ensureLoggedIn(driver); // 👈 reused login flow

    // Now continue with test-specific actions
    console.log('🧪 Ready to send a message');

  } finally {
    await driver.deleteSession();
  }
})();