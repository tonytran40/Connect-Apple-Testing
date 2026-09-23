const DEFAULT_CONNECT_BUNDLE_ID = 'com.powerhrg.connect.v3.debug';
const IOS_APP_STATE_FOREGROUND = 4;

function classifySessionHealth({ hasSessionId, commandResponsive, appState }) {
  if (!hasSessionId) return { healthy: false, reason: 'WebDriver session id is missing' };
  if (!commandResponsive) return { healthy: false, reason: 'WebDriver session did not respond' };
  if (Number(appState) !== IOS_APP_STATE_FOREGROUND) {
    return {
      healthy: false,
      reason: `Connect is not foregrounded (app state ${String(appState)})`,
    };
  }
  return { healthy: true, reason: 'WebDriver and Connect are responsive' };
}

async function probeReusableSession(
  driver,
  bundleId = process.env.CONNECT_BUNDLE_ID || DEFAULT_CONNECT_BUNDLE_ID
) {
  const hasSessionId = Boolean(driver?.sessionId);
  if (!hasSessionId) {
    return classifySessionHealth({ hasSessionId, commandResponsive: false });
  }

  try {
    await driver.getWindowRect();
    const appState = await driver.queryAppState(bundleId);
    return classifySessionHealth({ hasSessionId, commandResponsive: true, appState });
  } catch (error) {
    const health = classifySessionHealth({ hasSessionId, commandResponsive: false });
    return { ...health, reason: `${health.reason}: ${error?.message || error}` };
  }
}

module.exports = { classifySessionHealth, probeReusableSession };
