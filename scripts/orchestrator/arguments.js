const PROFILE_ALIASES = Object.freeze({
  qa: 'split3-qa',
  split3qa: 'split3-qa',
});

const PROFILES = new Set(['single', 'split3', 'split3-qa']);

function usage() {
  return `Connect Apple automation orchestrator

Usage:
  node scripts/connect.js <profile> [test] [options]

Profiles:
  single <test>   Run one test and generate its report
  split3          Run the three-lane suite and generate its report
  split3-qa       Run the three-lane QA suite and generate its report

Options:
  --prepare       Boot the configured simulators and open Connect first
  --appium        Start missing Appium servers (default)
  --no-appium     Require Appium servers to have been started separately
  --serve         Serve docs at http://localhost:5500 after a successful run
  --publish       Publish a split3 report with the existing safe publisher
  --run-id <id>   Override the generated report run ID
  --dry-run       Print every phase without touching simulators or processes
  -h, --help      Show this help

Examples:
  node scripts/connect.js single Reactions --dry-run
  node scripts/connect.js single Reactions --prepare
  node scripts/connect.js split3 --prepare --serve
  node scripts/connect.js split3-qa --publish
`;
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArguments(argv = []) {
  const options = {
    profile: '',
    testName: '',
    prepare: false,
    appium: true,
    serve: false,
    publish: false,
    runId: '',
    dryRun: false,
    help: false,
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-h' || argument === '--help') options.help = true;
    else if (argument === '--prepare') options.prepare = true;
    else if (argument === '--appium') options.appium = true;
    else if (argument === '--no-appium') options.appium = false;
    else if (argument === '--serve') options.serve = true;
    else if (argument === '--publish') options.publish = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--run-id') {
      options.runId = valueAfter(argv, index, argument);
      index += 1;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }

  if (options.help) return options;
  if (!positionals.length) {
    throw new Error('Choose a profile: single, split3, or split3-qa');
  }

  options.profile = PROFILE_ALIASES[positionals[0]] || positionals[0];
  if (!PROFILES.has(options.profile)) {
    throw new Error(`Unknown profile: ${positionals[0]}`);
  }

  if (options.profile === 'single') {
    options.testName = positionals[1] || '';
    if (!options.testName) throw new Error('The single profile requires a test name');
    if (positionals.length > 2) throw new Error('The single profile accepts only one test name');
  } else if (positionals.length > 1) {
    throw new Error(`${options.profile} does not accept a test name`);
  }

  if (options.publish && options.profile === 'single') {
    throw new Error('--publish is available only for split3 and split3-qa');
  }

  return options;
}

module.exports = { parseArguments, usage };
