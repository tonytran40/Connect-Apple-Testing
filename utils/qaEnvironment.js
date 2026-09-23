function isQaServerName(serverName) {
  return String(serverName || '')
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes('qa');
}

function qaOnlyBlockedError(testName, serverName) {
  const configured = String(serverName || '').trim() || '(not set)';
  const error = new Error(
    `BLOCKED: ${testName} is QA-only. ` +
    `CONNECT_SERVER_NAME must identify QA; received "${configured}".`
  );
  error.name = 'QaOnlyBlockedError';
  error.code = 'BLOCKED_QA_ONLY';
  error.status = 'BLOCKED';
  return error;
}

function requireQaServer(env = process.env, testName = 'QA scenario') {
  if (!isQaServerName(env.CONNECT_SERVER_NAME)) {
    throw qaOnlyBlockedError(testName, env.CONNECT_SERVER_NAME);
  }
  return String(env.CONNECT_SERVER_NAME).trim();
}

module.exports = { isQaServerName, qaOnlyBlockedError, requireQaServer };
