/** Optional "all career sites" mode: registers the content script on every site. */
export const ALL_SITES = ["https://*/*", "http://*/*"];
const SCRIPT_ID = "copilot-all-sites";
const WIDGET_ID = "copilot-all-sites-widget";

export async function hasAllSitesPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ALL_SITES });
}

export async function ensureAllSitesScript(): Promise<boolean> {
  if (!(await hasAllSitesPermission())) return false;
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: ALL_SITES,
        js: ["content.js"],
        runAt: "document_idle",
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
  }
  // The floating assistant (top frame only); registered separately so existing
  // installs that already have the content script get it too.
  const widget = await chrome.scripting.getRegisteredContentScripts({ ids: [WIDGET_ID] });
  if (widget.length === 0) {
    await chrome.scripting.registerContentScripts([
      { id: WIDGET_ID, matches: ALL_SITES, js: ["widget.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true },
    ]);
  }
  return true;
}

/**
 * Start Copilot in tabs that were already open when "every site" was turned on, so the user
 * doesn't have to reload them. Pages that can't be scripted (browser pages) are skipped.
 */
export async function injectIntoOpenTabs(): Promise<number> {
  if (!(await hasAllSitesPermission())) return 0;
  const tabs = await chrome.tabs.query({ url: ALL_SITES });
  let started = 0;
  for (const tab of tabs) {
    if (tab.id === undefined || tab.discarded) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["widget.js"] });
      started += 1;
    } catch {
      // Not scriptable (the Web Store, PDF viewer, error pages).
    }
  }
  return started;
}

/** "Every site" was turned off in Chrome's settings: stop registering the scripts. */
export async function removeAllSitesScripts(): Promise<void> {
  const ids = (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id).filter((id) => id === SCRIPT_ID || id === WIDGET_ID);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
}
