const path = require('path');

function argValue(name, fallback = '', argv = process.argv) {
  const prefix = `--${name}=`;
  const match = argv.find(arg => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return fallback;
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return (
    String(value ?? 'test')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'test'
  );
}

function timestampSlug(value) {
  const date = new Date(value || Date.now());
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/\.\d{3}Z$/, 'Z').replace(/[:.]/g, '-');
}

function titleFromFileName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/^\d+[_-]?/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function relativeLink(fromFile, targetPath) {
  return path.relative(path.dirname(fromFile), targetPath).replace(/\\/g, '/');
}

function safePathPart(value) {
  return String(value ?? 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

module.exports = {
  argValue,
  escapeHtml,
  escapeMd,
  relativeLink,
  safePathPart,
  slugify,
  timestampSlug,
  titleFromFileName,
};
