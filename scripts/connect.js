#!/usr/bin/env node

require('dotenv').config();

const path = require('path');

const { parseArguments, usage } = require('./orchestrator/arguments');
const { buildPlan } = require('./orchestrator/plan');
const { runPlan } = require('./orchestrator/run');

const REPO_ROOT = path.resolve(__dirname, '..');

async function main(argv = process.argv.slice(2), dependencies = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
    console.error(usage());
    return 2;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  try {
    const plan = buildPlan(options, {
      repoRoot: dependencies.repoRoot || REPO_ROOT,
      env: dependencies.env || process.env,
    });
    return await (dependencies.runPlan || runPlan)(plan, {
      cwd: dependencies.repoRoot || REPO_ROOT,
      env: dependencies.env || process.env,
      dryRun: options.dryRun,
      ...dependencies.runOptions,
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  });
}

module.exports = { main };
