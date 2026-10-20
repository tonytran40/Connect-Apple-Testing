const { defineTest } = require('../utils/testHarness');
const { runPhotoTest } = require('./attachments');

const test = defineTest({ name: 'attachmentPhoto', execute: runPhotoTest });

module.exports = { run: test.run };

test.runIfMain(module);
