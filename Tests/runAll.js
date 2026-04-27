require('dotenv').config();

const { performance } = require('perf_hooks');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { resetToHome } = require('../utils/testSession');
const { createReportWriter, formatDurationMs } = require('../utils/reportWriter');

const tests = [
  { name: 'newMessage', area: 'New direct message flow', run: require('./newMessage').run },
  { name: 'CreateRoom', area: 'Public and private room creation', run: require('./CreateRoom').run },
  {
    name: 'PinnedMessageEditFlow',
    area: 'Pin message, verify sheet, edit, verify pin, unpin, verify cleared',
    run: require('./PinnedMessageEditFlow').run,
  },
  { name: 'markdowns', area: 'Markdown and emoji rendering', run: require('./markdowns').run },
  {
    name: 'ConversationList',
    area: 'User settings: each conversation layout and sort, close, verify list',
    run: require('./ConversationList').run,
  },
  { name: 'Login_Signout', area: 'Sign out via user settings', run: require('./Login_Signout').run },
];

async function run() {
  let driver;
  const report = createReportWriter();
  const suiteStart = performance.now();
  let loginSetupMs;
  const results = tests.map(test => ({
    name: test.name,
    area: test.area,
    status: 'PENDING',
    notes: 'Waiting to run',
  }));

  let suiteDurationMs;
  const reportMeta = () => ({
    ...(loginSetupMs != null ? { loginSetupMs } : {}),
    ...(suiteDurationMs != null ? { suiteDurationMs } : {}),
  });

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);
    loginSetupMs = Math.round(performance.now() - suiteStart);
    console.log(`Login + driver ready in ${formatDurationMs(loginSetupMs)}`);
    report.write(results, reportMeta());

    for (const [index, test] of tests.entries()) {
      console.log(`Running ${test.name}`);
      results[index] = {
        ...results[index],
        status: 'RUNNING',
        notes: 'In progress',
      };
      report.write(results, reportMeta());

      await resetToHome(driver);
      const testStart = performance.now();
      try {
        await test.run(driver, { skipLogin: true });
        const durationMs = Math.round(performance.now() - testStart);
        results[index] = {
          ...results[index],
          status: 'PASS',
          notes: 'Completed successfully',
          durationMs,
        };
        console.log(`  ${test.name} completed in ${formatDurationMs(durationMs)}`);
      } catch (err) {
        const durationMs = Math.round(performance.now() - testStart);
        results[index] = {
          ...results[index],
          status: 'FAIL',
          notes: err?.message || 'Test failed',
          durationMs,
        };
        report.write(results, reportMeta());
        throw err;
      }

      report.write(results, reportMeta());
    }
  } finally {
    try {
      if (driver) {
        await driver.deleteSession();
      }
    } finally {
      suiteDurationMs = Math.round(performance.now() - suiteStart);
      console.log(`Suite finished in ${formatDurationMs(suiteDurationMs)} (report: ${report.reportPath})`);
      report.write(results, reportMeta());
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
