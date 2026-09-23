const { writeArchivePages } = require('./reportArchivePage');
const { writeReportMeta } = require('./reportMetadata');
const { writeHtmlReport } = require('./reportOverviewPage');
const { writeTestHtmlPages } = require('./reportTestPage');

module.exports = {
  writeArchivePages,
  writeHtmlReport,
  writeReportMeta,
  writeTestHtmlPages,
};
