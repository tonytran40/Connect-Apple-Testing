require('dotenv').config();

const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { resetToHome } = require('../utils/testSession');
const { createReportWriter } = require('../utils/reportWriter');

const tests = [
  { name: 'CreateRoom', area: 'Public and private room creation', run: require('./CreateRoom').run },
  { name: 'newMessage', area: 'New direct message flow', run: require('./newMessage').run },
  {
    name: 'PinnedMessageEditFlow',
    area: 'Pin message, verify sheet, edit, verify pin, unpin, verify cleared',
    run: require('./PinnedMessageEditFlow').run,
  },
  { name: 'markdowns', area: 'Markdown and emoji rendering', run: require('./markdowns').run },
  // { name: 'User_Settings', run: require('./User_Settings').run },
  // { name: 'Login_Signout', run: require('./Login_Signout').run },
];

async function run() {
  let driver;
  const report = createReportWriter();
  const results = tests.map(test => ({
    name: test.name,
    area: test.area,
    status: 'PENDING',
    notes: 'Waiting to run',
  }));

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);
    report.write(results);

    for (const [index, test] of tests.entries()) {
      console.log(`Running ${test.name}`);
      results[index] = {
        ...results[index],
        status: 'RUNNING',
        notes: 'In progress',
      };
      report.write(results);

      await resetToHome(driver);
      try {
        await test.run(driver, { skipLogin: true });
        results[index] = {
          ...results[index],
          status: 'PASS',
          notes: 'Completed successfully',
        };
      } catch (err) {
        results[index] = {
          ...results[index],
          status: 'FAIL',
          notes: err?.message || 'Test failed',
        };
        report.write(results);
        throw err;
      }

      report.write(results);
    }
  } finally {
    report.write(results);
    if (driver) {
      await driver.deleteSession();
    }
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('Suite failed:', err);
    console.error('Suite report written to reports/latest-suite-report.md');
    process.exit(1);
  });
}

module.exports = { run };
