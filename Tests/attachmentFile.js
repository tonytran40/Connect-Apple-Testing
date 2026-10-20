const { defineTest } = require('../utils/testHarness');
const { runFileTest } = require('./attachments');

const test = defineTest({ name: 'attachmentFile', execute: runFileTest });

module.exports = { run: test.run };

test.runIfMain(module);
