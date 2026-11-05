import { createApi } from "@/background/api";
import { AuthError, AuthManager } from "@/background/auth";
import { ensureAllSitesScript } from "@/background/content-scripts";
import { ProfileSync } from "@/background/profile-sync";
import { API_URL, WEB_URL } from "@/shared/config";
import {
  contentMessageSchema,
  externalMessageSchema,
  panelMessageSchema,
  type Reply,
} from "@/shared/messages";
import { chromeArea, DEFAULT_LOCAL, tabKey, type LocalStore, type SessionStore } from "@/shared/storage";
import type { DetectedJob, TabState } from "@/shared/types";

const local = chromeArea<LocalStore>(chrome.storage.local);
const session = chromeArea<SessionStore>(chrome.storage.session);
const auth = new AuthManager(API_URL, local, session);
const api = createApi(API_URL, auth);
const profileSync = new ProfileSync(api, local);

const SYNC_ALARM = "profile-sync";

chrome.runtime.onInstalled.addListener(async () => {
  for (const [key, value] of Object.entries(DEFAULT_LOCAL)) {
    if ((await local.get(key as keyof LocalStore)) === undefined) {
      await local.set({ [key]: value } as Partial<LocalStore>);
    }
  }
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAllSitesScript();
  if ((await auth.state()).status === "signed_in") await profileSync.sync();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM && (await auth.state()).status === "signed_in") await profileSync.sync();
});

// --------------------------------------------------------------------- tab state

/** Several frames can report (e.g. an embedded Greenhouse iframe): keep the best one. */
const frameReports = new Map<number, Map<number, DetectedJob | null>>();

async function recordTab(tabId: number, frameId: number, url: string, job: DetectedJob | null) {
  const frames = frameReports.get(tabId) ?? new Map<number, DetectedJob | null>();
  if (frameId === 0) frames.clear(); // a top-level navigation resets the page
  frames.set(frameId, job);
  frameReports.set(tabId, frames);
  const best = [...frames.values()]
    .filter((j): j is DetectedJob => j !== null)
    .sort((a, b) => Number(b.isApplicationPage) - Number(a.isApplicationPage) || b.confidence - a.confidence)[0];
  const state: TabState = { url, job: best ?? null, analyzedAt: Date.now() };
  await session.set({ [tabKey(tabId)]: state });
  await chrome.action.setBadgeText({ tabId, text: best?.isApplicationPage ? "●" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f46e5" });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  frameReports.delete(tabId);
  void session.remove([tabKey(tabId)]);
});

// --------------------------------------------------------------------- messaging

function fail(error: unknown): Reply {
  if (error instanceof AuthError) return { ok: false, error: error.message, code: error.code };
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
}

async function handlePanel(raw: unknown): Promise<Reply<unknown>> {
  const parsed = panelMessageSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid message" };
  const message = parsed.data;
  try {
    switch (message.type) {
      case "SIGN_IN": {
        const state = await auth.signIn(message.email, message.password);
        void profileSync.sync(true);
        return { ok: true, data: state };
      }
      case "SIGN_OUT":
        await auth.signOut();
        return { ok: true };
      case "SYNC_PROFILE":
        return { ok: true, data: await profileSync.sync(message.force) };
      case "RESCAN_TAB":
        await chrome.tabs.sendMessage(message.tabId, { type: "ANALYZE_PAGE" }).catch(() => undefined);
        return { ok: true };
      case "ENABLE_ALL_SITES": {
        const enabled = await ensureAllSitesScript();
        await local.set({ allSitesEnabled: enabled });
        return { ok: true, data: enabled };
      }
    }
  } catch (error) {
    return fail(error);
  }
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  // Only this extension's own contexts may talk to the background.
  if (sender.id !== chrome.runtime.id) return false;

  // Extension pages (side panel, or the panel opened in a tab) are identified by
  // their URL; anything else with a tab is a content script running in a web page.
  const fromExtensionPage = sender.url?.startsWith(chrome.runtime.getURL("")) ?? false;
  if (!fromExtensionPage && sender.tab?.id !== undefined) {
    const parsed = contentMessageSchema.safeParse(raw);
    if (parsed.success) {
      void recordTab(sender.tab.id, sender.frameId ?? 0, sender.tab.url ?? parsed.data.url, parsed.data.job);
    }
    return false;
  }
  if (!fromExtensionPage) return false;

  void handlePanel(raw).then(sendResponse);
  return true; // async response
});

const WEB_ORIGIN = new URL(WEB_URL).origin;

chrome.runtime.onMessageExternal.addListener((raw, sender, sendResponse) => {
  // Defense in depth: the manifest's externally_connectable already restricts origins.
  if (!sender.origin || sender.origin !== WEB_ORIGIN) {
    sendResponse({ ok: false, error: "Origin not allowed" });
    return false;
  }
  const parsed = externalMessageSchema.safeParse(raw);
  if (!parsed.success) {
    sendResponse({ ok: false, error: "Invalid message" });
    return false;
  }
  if (parsed.data.type === "PING") {
    void auth.state().then((state) => sendResponse({ ok: true, data: { version: chrome.runtime.getManifest().version, signedIn: state.status === "signed_in" } }));
    return true;
  }
  void auth
    .acceptHandoff(parsed.data.refreshToken)
    .then(async (state) => {
      await profileSync.sync(true);
      sendResponse({ ok: true, data: { email: state.user?.email } });
    })
    .catch((error) => sendResponse(fail(error)));
  return true;
});
