/** Optional "all career sites" mode: registers the content script on every site. */
export const ALL_SITES = ["https://*/*", "http://*/*"];
const SCRIPT_ID = "copilot-all-sites";

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
  return true;
}
