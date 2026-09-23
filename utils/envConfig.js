function text(env, key, fallback = '') {
  if (!Object.hasOwn(env, key)) return String(fallback ?? '').trim();
  return String(env[key] ?? '').trim();
}

function integer(env, key, fallback, options = {}) {
  const raw = text(env, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  if (Number.isFinite(options.min) && value < options.min) return fallback;
  if (Number.isFinite(options.max) && value > options.max) return fallback;
  return value;
}

function boolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function csv(env, key, fallback = []) {
  const value = text(env, key);
  if (!value) return [...fallback];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function json(env, key, fallback = {}) {
  const value = text(env, key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = { boolean, csv, integer, json, text };
