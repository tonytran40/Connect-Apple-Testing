const fs = require('fs');
const path = require('path');

const { A11Y, SELECTOR_METADATA } = require('../utils/selectors');

const DEFAULT_SOURCE_ROOT = path.resolve(__dirname, '..', '..', 'connect-apple');
const SOURCE_EXTENSIONS = new Set(['.h', '.m', '.mm', '.swift']);
const SKIPPED_DIRECTORIES = new Set(['.build', '.git', 'DerivedData', 'Pods']);

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : collectSourceFiles(file);
    }
    return entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [file] : [];
  });
}

function decodeStringLiteral(value) {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function addLiteral(matches, rawValue) {
  // Swift interpolation is a dynamic identifier contract, not an exact literal.
  if (!rawValue.includes('\\(')) {
    matches.add(decodeStringLiteral(rawValue));
  }
}

function extractAccessibilityIdentifiers(source) {
  const matches = new Set();
  const stringBody = '((?:\\\\.|[^"\\\\])*)';
  const directPatterns = [
    new RegExp(`\\.accessibilityIdentifier\\(\\s*"${stringBody}"\\s*\\)`, 'g'),
    new RegExp(`\\.accessibility\\(\\s*identifier\\s*:\\s*"${stringBody}"\\s*\\)`, 'g'),
  ];

  for (const pattern of directPatterns) {
    let match;
    while ((match = pattern.exec(source))) {
      addLiteral(matches, match[1]);
    }
  }

  const constants = new Map();
  const constantPattern = new RegExp(
    `(?:^|\\n)\\s*(?:(?:private|fileprivate|internal|public|static)\\s+)*` +
      `(?:let|var)\\s+([A-Za-z_]\\w*)\\s*(?::[^=\\n]+)?=\\s*"${stringBody}"`,
    'g'
  );
  let declaration;
  while ((declaration = constantPattern.exec(source))) {
    constants.set(declaration[1], declaration[2]);
  }

  const variablePatterns = [
    /\.accessibilityIdentifier\(\s*([A-Za-z_]\w*)\s*\)/g,
    /\.accessibility\(\s*identifier\s*:\s*([A-Za-z_]\w*)\s*\)/g,
  ];
  for (const pattern of variablePatterns) {
    let usage;
    while ((usage = pattern.exec(source))) {
      const rawValue = constants.get(usage[1]);
      if (rawValue !== undefined) addLiteral(matches, rawValue);
    }
  }

  return matches;
}

function scanAccessibilityIdentifiers(sourceRoot) {
  const identifiers = new Map();
  const files = collectSourceFiles(sourceRoot);

  for (const file of files) {
    const relativeFile = path.relative(sourceRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    for (const identifier of extractAccessibilityIdentifiers(source)) {
      const locations = identifiers.get(identifier) || [];
      locations.push(relativeFile);
      identifiers.set(identifier, locations);
    }
  }

  return { files, identifiers };
}

function auditSelectors(identifiers, selectorValues = A11Y, metadata = SELECTOR_METADATA) {
  const exactMatches = [];
  const staleSelectors = [];
  const exceptions = [];

  for (const [key, identifier] of Object.entries(selectorValues)) {
    const details = metadata[key] || { source: 'exact' };
    const item = { key, identifier, ...details };

    if (details.source === 'exact') {
      if (identifiers.has(identifier)) {
        exactMatches.push({ ...item, files: identifiers.get(identifier) });
      } else {
        staleSelectors.push(item);
      }
    }

    if (details.source !== 'exact' || details.platforms) {
      exceptions.push(item);
    }
  }

  for (const [key, details] of Object.entries(metadata)) {
    if (!(key in selectorValues)) {
      exceptions.push({ key, ...details });
    }
  }

  return { exactMatches, exceptions, staleSelectors };
}

function formatItem(item) {
  const identifier = item.identifier ? ` -> ${JSON.stringify(item.identifier)}` : '';
  const platforms = item.platforms ? `; platforms: ${item.platforms.join(', ')}` : '';
  const note = item.note ? `; ${item.note}` : '';
  return `  - ${item.key}${identifier} [${item.source}]${platforms}${note}`;
}

function formatAudit(result, sourceRoot, fileCount) {
  const lines = [
    'Accessibility selector audit',
    `Source: ${sourceRoot}`,
    `Scanned source files: ${fileCount}`,
    '',
    `Known exact matches (${result.exactMatches.length})`,
    ...result.exactMatches.map(formatItem),
    '',
    `Known text/dynamic/platform exceptions (${result.exceptions.length})`,
    ...result.exceptions.map(formatItem),
    '',
    `Stale exact selectors (${result.staleSelectors.length})`,
    ...(result.staleSelectors.length ? result.staleSelectors.map(formatItem) : ['  - none']),
  ];
  return lines.join('\n');
}

function main() {
  const sourceRoot = path.resolve(process.env.CONNECT_APP_SOURCE || DEFAULT_SOURCE_ROOT);
  const sourceStats = fs.statSync(sourceRoot);
  if (!sourceStats.isDirectory()) {
    throw new Error(`CONNECT_APP_SOURCE is not a directory: ${sourceRoot}`);
  }

  const { files, identifiers } = scanAccessibilityIdentifiers(sourceRoot);
  const result = auditSelectors(identifiers);
  console.log(formatAudit(result, sourceRoot, files.length));
  process.exitCode = result.staleSelectors.length ? 1 : 0;
}

if (require.main === module) main();

module.exports = {
  DEFAULT_SOURCE_ROOT,
  auditSelectors,
  collectSourceFiles,
  extractAccessibilityIdentifiers,
  formatAudit,
  main,
  scanAccessibilityIdentifiers,
};
