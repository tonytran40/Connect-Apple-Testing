require('dotenv').config();

const { performance } = require('perf_hooks');
const { createDriver } = require('../Login_Flow/Open_App');
const { ensureLoggedIn } = require('../Login_Flow/Login_User');
const { resetToHome } = require('../utils/testSession');
const { createReportWriter, formatDurationMs } = require('../utils/reportWriter');

function skipResetBetweenFirstAndRest() {
  const v = process.env.CONNECT_SKIP_RESET_BETWEEN_TESTS;
  return v === '1' || v === 'true';
}

function buildSuiteOptionsLine() {
  const parts = [];
  if (skipResetBetweenFirstAndRest()) {
    parts.push('CONNECT_SKIP_RESET_BETWEEN_TESTS (no reset before tests 2+)');
  }
  if (process.env.MARKDOWN_EXAMPLE_IDS) {
    parts.push(`MARKDOWN_EXAMPLE_IDS=${process.env.MARKDOWN_EXAMPLE_IDS}`);
  }
  if (process.env.CONVERSATION_LAYOUTS) {
    parts.push(`CONVERSATION_LAYOUTS=${process.env.CONVERSATION_LAYOUTS}`);
  }
  if (process.env.CONVERSATION_SORTS) {
    parts.push(`CONVERSATION_SORTS=${process.env.CONVERSATION_SORTS}`);
  }
  if (process.env.CREATE_ROOM_MODE) {
    parts.push(`CREATE_ROOM_MODE=${process.env.CREATE_ROOM_MODE}`);
  }
  if (process.env.CONNECT_SCREENSHOTS === '0' || process.env.CONNECT_SCREENSHOTS === 'false') {
    parts.push('CONNECT_SCREENSHOTS=0');
  }
  if (process.env.SKIP_SCREENSHOTS === '1' || process.env.SKIP_SCREENSHOTS === 'true') {
    parts.push('SKIP_SCREENSHOTS');
  }
  return parts.length ? parts.join(' · ') : 'default (unset env = full behavior)';
}

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
    suiteOptions: buildSuiteOptionsLine(),
  });

  try {
    driver = await createDriver();
    await ensureLoggedIn(driver);
    loginSetupMs = Math.round(performance.now() - suiteStart);
    console.log(`Login + driver ready in ${formatDurationMs(loginSetupMs)}`);
    console.log(`Suite options: ${buildSuiteOptionsLine()}`);
    report.write(results, reportMeta());

    for (const [index, test] of tests.entries()) {
      console.log(`Running ${test.name}`);
      results[index] = {
        ...results[index],
        status: 'RUNNING',
        notes: 'In progress',
      };
      report.write(results, reportMeta());

      if (!(skipResetBetweenFirstAndRest() && index > 0)) {
        await resetToHome(driver);
      }
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
  const { runCliTimed } = require('../utils/cliTestTiming');
  runCliTimed('runAll', run).catch(err => {
    console.error('Suite failed:', err);
    console.error('Suite report written to reports/latest-suite-report.md');
    process.exit(1);
  });
}

module.exports = { run };
