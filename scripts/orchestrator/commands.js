function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'"'"'`)}'`;
}

function formatCommand(command) {
  const environment = Object.entries(command.envOverrides || {})
    .map(([name, value]) => `${name}=${shellQuote(value)}`)
    .join(' ');
  const executable = [command.command, ...(command.args || [])].map(shellQuote).join(' ');
  return environment ? `${environment} ${executable}` : executable;
}

function validateRunId(value) {
  const runId = String(value || '').trim();
  if (runId && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    throw new Error(
      `Unsafe run ID "${runId}". Use only letters, numbers, dots, underscores, and hyphens.`
    );
  }
  return runId;
}

module.exports = { formatCommand, shellQuote, validateRunId };
