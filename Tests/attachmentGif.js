const { defineTest } = require('../utils/testHarness');
const { runGifTest } = require('./attachments');

const test = defineTest({ name: 'attachmentGif', execute: runGifTest });

module.exports = { run: test.run };

test.runIfMain(module);
