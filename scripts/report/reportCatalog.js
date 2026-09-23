const fs = require('fs');
const path = require('path');
const { gitTracksFile, readJsonIfExists } = require('./reportFiles');

function discoverReports(outputRoot) {
  if (!fs.existsSync(outputRoot)) return [];

  const reports = [];
  const stack = [outputRoot];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const metaPath = path.join(dir, '_report-meta.json');
    if (fs.existsSync(metaPath) && fs.existsSync(path.join(dir, 'index.html'))) {
      const meta = readJsonIfExists(metaPath) || {};
      reports.push({
        ...meta,
        dir,
        href: path.relative(outputRoot, path.join(dir, 'index.html')).replace(/\\/g, '/'),
      });
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'assets') {
        stack.push(path.join(dir, entry.name));
      }
    }
  }

  return reports.sort(
    (a, b) =>
      Date.parse(b.startedAt || b.updatedAt || 0) -
      Date.parse(a.startedAt || a.updatedAt || 0)
  );
}

function reportsForNavigation(
  reports,
  currentHtmlPath,
  {
    trackedOnly = process.env.SCRIBE_NAV_TRACKED_ONLY === '1',
    repoRoot,
    isTracked = gitTracksFile,
  } = {}
) {
  if (!trackedOnly) return reports;
  const current = path.resolve(currentHtmlPath);
  return reports.filter(report => {
    const reportIndex = path.resolve(report.dir, 'index.html');
    return reportIndex === current || isTracked(reportIndex, repoRoot);
  });
}

module.exports = {
  discoverReports,
  reportsForNavigation,
};
