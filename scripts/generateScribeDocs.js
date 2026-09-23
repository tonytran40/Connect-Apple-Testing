require('dotenv').config();

const { generate, loadRunSummary } = require('./report/reportGenerator');

if (require.main === module) {
  try {
    generate();
  } catch (err) {
    console.error(err?.stack || err);
    process.exit(1);
  }
}

module.exports = { generate, loadRunSummary };
