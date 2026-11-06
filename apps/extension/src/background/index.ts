import { createApi } from "@/background/api";
import { AutofillCoordinator } from "@/background/autofill";
import { AuthError, AuthManager } from "@/background/auth";
import { ensureAllSitesScript } from "@/background/content-scripts";
import { ProfileSync } from "@/background/profile-sync";
import { ApplicationTracker } from "@/background/tracker";
import { readyKeys, widgetState } from "@/background/widget";
import { DEFAULT_SETTINGS, type AutofillSettings } from "@/shared/settings";
import { API_URL, WEB_URL } from "@/shared/config";
import {
  contentMessageSchema,
  externalMessageSchema,
  panelMessageSchema,
  widgetMessageSchema,
  type Reply,
} from "@/shared/messages";
import type { FillResult } from "@/shared/fields";
import { appKey, chromeArea, DEFAULT_LOCAL, DEFAULT_WIDGET, formKey, tabEntry, tabKey, type LocalStore, type SessionStore } from "@/shared/storage";
import type { DetectedJob, TabState } from "@/shared/types";

const local = chromeArea<LocalStore>(chrome.storage.local);
const session = chromeArea<SessionStore>(chrome.storage.session);
const auth = new AuthManager(API_URL, local, session);
const api = createApi(API_URL, auth);
const profileSync = new ProfileSync(api, local);
const tracker = new ApplicationTracker(api, session);
const autofill = new AutofillCoordinator(local, session, api, async (tabId, frameId, instructions) => {
  // Filled one by one, scrolling to each field, so the user can follow along.
  const reply = (await chrome.tabs.sendMessage(tabId, { type: "FILL", instructions, interactive: true }, { frameId })) as
    | { ok: true; data: FillResult[] }
    | { ok: false; error: string }
    | undefined;
  if (!reply?.ok) throw new Error(reply && !reply.ok ? reply.error : "No response from page");
  return reply.data;
});

const settings = async () => ({ ...DEFAULT_SETTINGS, ...(await local.get("settings")) });

/** Live fill progress on the page (popup or blurred modal, per Settings). */
async function showProgress(tabId: number, phase: "start" | "field" | "done", items: ReturnType<AutofillCoordinator["progressItems"]>) {
  const view = (await settings()).fillProgress;
  if (view === "off" || items.length === 0) return;
  await chrome.tabs.sendMessage(tabId, { type: "WIDGET_PROGRESS", phase, view, items }, { frameId: 0 }).catch(() => undefined);
}
autofill.onStart = (tabId, items) => void showProgress(tabId, "start", items);
autofill.onDone = (tabId, items) => void showProgress(tabId, "done", items);

/** Tabs where the user started autofill: later steps of the same application fill by themselves
 * when "Continuously autofill multipage forms" is on. */
const activeFill = new Map<number, { host: string; at: number }>();
const filling = new Set<number>();

/** Fills every ready field, then (if enabled) presses the page's Continue button. */
async function fillReady(tabId: number) {
  if (filling.has(tabId)) return { filled: 0, skipped: 0, failed: 0 };
  filling.add(tabId);
  try {
    const state = await autofill.state(tabId);
    const keys = readyKeys(state?.fields ?? []);
    const summary = keys.length ? await autofill.fill(tabId, keys, false) : { filled: 0, skipped: 0, failed: 0 };
    const after = await autofill.state(tabId);
    const filled = after?.fields.filter((f) => f.result === "filled").length ?? 0;
    void tracker.onFilled(tabId, (await session.get(tabKey(tabId)))?.job, filled);
    if (state) activeFill.set(tabId, { host: new URL(state.url).hostname, at: Date.now() });
    const requiredLeft = after?.fields.some((f) => f.required && !f.currentValue && f.result !== "filled") ?? true;
    if ((await settings()).autoContinue && !requiredLeft) {
      await chrome.tabs.sendMessage(tabId, { type: "CLICK_ACTION", continueOnly: true }, { frameId: 0 }).catch(() => undefined);
    }
    return summary;
  } finally {
    filling.delete(tabId);
  }
}

const continueTimers = new Map<number, ReturnType<typeof setTimeout>>();
async function maybeContinueFilling(tabId: number, url: string) {
  const active = activeFill.get(tabId);
  if (!active || active.host !== new URL(url).hostname || Date.now() - active.at > 60 * 60 * 1000) return;
  if (!(await settings()).continuousFill) return;
  clearTimeout(continueTimers.get(tabId));
  // Wait for the new step to settle before filling it.
  continueTimers.set(tabId, setTimeout(() => void fillReady(tabId), 800));
}

const promptedSubmission = new Set<string>();
async function onSubmittedPage(tabId: number, url: string) {
  const tracked = await tracker.get(tabId);
  if (!(await settings()).submissionPrompt || promptedSubmission.has(url)) return;
  if (tracked && ["submitted", "interview", "offer", "rejected"].includes(tracked.status)) return;
  promptedSubmission.add(url);
  await chrome.tabs.sendMessage(tabId, { type: "WIDGET_SUBMITTED" }, { frameId: 0 }).catch(() => undefined);
}

// Keep every open form's mapping current when the profile changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !("profile" in changes || "accountPassword" in changes)) return;
  void chrome.storage.session.get(null).then((all) => {
    const tabIds = Object.keys(all).filter((k) => k.startsWith("form:")).map((k) => Number(k.slice(5)));
    return autofill.remapAll(tabIds);
  });
});

const SYNC_ALARM = "profile-sync";

chrome.runtime.onInstalled.addListener(async () => {
  for (const [key, value] of Object.entries(DEFAULT_LOCAL)) {
    if ((await local.get(key as keyof LocalStore)) === undefined) {
      await local.set({ [key]: value } as Partial<LocalStore>);
    }
  }
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
  await session.set(tabEntry(tabId, state));
  await chrome.action.setBadgeText({ tabId, text: best?.isApplicationPage ? "●" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f46e5" });
  // "Applications you submit without autofill: track them" (otherwise only after autofill).
  if (best?.isApplicationPage && (await auth.state()).status === "signed_in" && (await settings()).trackWithoutAutofill) {
    void tracker.onDetected(tabId, best);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  frameReports.delete(tabId);
  void session.remove([tabKey(tabId), formKey(tabId), appKey(tabId)]);
  void chrome.storage.session.remove(`embed:${tabId}`);
});

/**
 * "Fill this page anyway": treat whatever form is on the page as an application. If the
 * content script isn't running there yet (a site outside the job portals, or a tab opened
 * before Copilot got access), inject it first.
 */
async function forceScan(tabId: number): Promise<Reply> {
  const ask = () => chrome.tabs.sendMessage(tabId, { type: "ANALYZE_PAGE", force: true });
  try {
    await ask();
    return { ok: true };
  } catch {
    // No content script in this tab yet.
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["widget.js"] }).catch(() => undefined);
    await ask();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Copilot can't read this page yet. Click the Copilot icon in the toolbar while on this page, then try again.",
    };
  }
}

/** Codes for the panel embedded in each tab's drawer (only our drawer script gets them). Kept in
 * session storage because the service worker can be stopped between requests. */
const embedKey = (tabId: number) => `embed:${tabId}`;

// The toolbar icon opens the drawer on the current page, and closes it on the next click.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  void (async () => {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "WIDGET_TOGGLE" }, { frameId: 0 });
    } catch {
      // Not on this page yet (a site outside the job portals): the click grants access.
      try {
        await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ["widget.js"] });
        await chrome.tabs.sendMessage(tabId, { type: "WIDGET_TOGGLE" }, { frameId: 0 });
      } catch {
        // Browser pages (chrome://, the Web Store) can't host the drawer.
      }
    }
  })();
});

/** Requests from the floating in-page assistant. */
async function handleWidget(raw: unknown, tab: chrome.tabs.Tab): Promise<Reply<unknown>> {
  const parsed = widgetMessageSchema.safeParse(raw);
  if (!parsed.success || tab.id === undefined) return { ok: false, error: "Invalid message" };
  const tabId = tab.id;
  const message = parsed.data;
  try {
    switch (message.type) {
      case "WIDGET_STATE":
        return { ok: true, data: await widgetState(tabId, tab.url, local, session) };
      case "WIDGET_FILL":
        return { ok: true, data: await fillReady(tabId) };
      case "WIDGET_MARK_SUBMITTED": {
        const job = (await session.get(tabKey(tabId)))?.job;
        if (!(await tracker.get(tabId)) && job) await tracker.save(tabId, job);
        return { ok: true, data: await tracker.setStatus(tabId, "submitted") };
      }
      case "WIDGET_FORCE":
        return await forceScan(tabId);
      case "WIDGET_SAVE_JOB": {
        const job = (await session.get(tabKey(tabId)))?.job;
        if (!job) return { ok: false, error: "No job found on this page." };
        const saved = await tracker.save(tabId, job);
        return saved ? { ok: true, data: saved } : { ok: false, error: "Couldn't save the job. Are you signed in?" };
      }
      case "WIDGET_EMBED": {
        const nonce = crypto.randomUUID();
        await chrome.storage.session.set({ [embedKey(tabId)]: nonce });
        return { ok: true, data: { tabId, nonce } };
      }
      case "WIDGET_THEME":
        await local.set({ theme: message.theme });
        return { ok: true };
      case "WIDGET_PREFS": {
        const current = { ...DEFAULT_WIDGET, ...(await local.get("widget")) };
        const { hideOnHost, ...position } = message.prefs;
        const hiddenHosts = hideOnHost ? [...new Set([...current.hiddenHosts, hideOnHost])].slice(-200) : current.hiddenHosts;
        await local.set({ widget: { ...current, ...position, hiddenHosts } });
        return { ok: true };
      }
    }
  } catch (error) {
    return fail(error);
  }
}

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
      case "FORCE_SCAN":
        return await forceScan(message.tabId);
      case "VERIFY_EMBED":
        return { ok: true, data: (await chrome.storage.session.get(embedKey(message.tabId)))[embedKey(message.tabId)] === message.nonce };
      case "SAVE_JOB": {
        const job = (await session.get(tabKey(message.tabId)))?.job;
        if (!job) return { ok: false, error: "No job on this page." };
        const saved = await tracker.save(message.tabId, job);
        return saved ? { ok: true, data: saved } : { ok: false, error: "Couldn't save. Are you signed in?" };
      }
      case "COLLAPSE_EMBED":
        await chrome.tabs.sendMessage(message.tabId, { type: "WIDGET_COLLAPSE" }, { frameId: 0 }).catch(() => undefined);
        return { ok: true };
      case "SET_THEME":
        await local.set({ theme: message.theme });
        return { ok: true };
      case "SET_ACCOUNT_PASSWORD":
        await local.set({ accountPassword: message.password || null });
        return { ok: true };
      case "SET_WIDGET_PREFS": {
        const current = { ...DEFAULT_WIDGET, ...(await local.get("widget")) };
        const { showOnAllHosts, ...rest } = message.prefs;
        await local.set({ widget: { ...current, ...rest, ...(showOnAllHosts ? { hiddenHosts: [] } : {}) } });
        return { ok: true };
      }
      case "FILL_FIELDS": {
        const summary = await autofill.fill(message.tabId, message.fields, message.overwrite);
        const state = await autofill.state(message.tabId);
        const filled = state?.fields.filter((f) => f.result === "filled").length ?? 0;
        void tracker.onFilled(message.tabId, (await session.get(tabKey(message.tabId)))?.job, filled);
        if (state) activeFill.set(message.tabId, { host: new URL(state.url).hostname, at: Date.now() });
        return { ok: true, data: summary };
      }
      case "CLICK_ACTION": {
        const reply = (await chrome.tabs
          .sendMessage(message.tabId, { type: "CLICK_ACTION" }, { frameId: 0 })
          .catch(() => null)) as Reply | null;
        return reply ?? { ok: false, error: "The page didn't respond." };
      }
      case "SET_SETTINGS": {
        const next = { ...(await settings()), ...message.settings } as AutofillSettings;
        await local.set({ settings: next });
        return { ok: true };
      }
      case "DISMISS_WHATS_NEW":
        await local.set({ seenVersion: chrome.runtime.getManifest().version });
        return { ok: true };
      case "SET_APPLICATION_STATUS":
        return { ok: true, data: await tracker.setStatus(message.tabId, message.status) };
      case "INSERT_ANSWER": {
        const result = await autofill.insertText(message.tabId, message.field, message.text);
        if (result.status === "filled") {
          const job = (await session.get(tabKey(message.tabId)))?.job;
          const applicationId = (await tracker.get(message.tabId))?.id ?? null;
          // History only; a failure here must not affect the user's form.
          void api("/api/v1/answers/usages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              saved_answer_id: message.savedAnswerId,
              application_id: applicationId,
              question_text: message.question.slice(0, 500) || "Question",
              final_answer: message.text,
              source: message.savedAnswerId ? "library" : "manual",
              company: job?.company ?? null,
              job_title: job?.title ?? null,
              url: job?.url ?? null,
            }),
          }).catch(() => undefined);
        }
        return result.status === "filled" ? { ok: true, data: result } : { ok: false, error: result.message ?? "Couldn't insert the answer." };
      }
      case "SAVE_ANSWER": {
        const response = await api("/api/v1/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_text: message.question, answer_template: message.answer, category: message.category, variants: [] }),
        });
        if (!response.ok) return { ok: false, error: "Couldn't save the answer." };
        await profileSync.sync(true);
        return { ok: true };
      }
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
  // (The panel embedded in a page's drawer has a per-session extension address, so match the scheme.)
  const fromExtensionPage = sender.url?.startsWith("chrome-extension://") ?? false;
  if (!fromExtensionPage && sender.tab?.id !== undefined) {
    const parsed = contentMessageSchema.safeParse(raw);
    if (!parsed.success) {
      // Not a report: a request from the in-page assistant, answered asynchronously.
      void handleWidget(raw, sender.tab).then(sendResponse);
      return true;
    }
    const frameId = sender.frameId ?? 0;
    const tabId = sender.tab.id;
    const message = parsed.data;
    if (message.type === "PAGE_ANALYZED") {
      void recordTab(tabId, frameId, sender.tab.url ?? message.url, message.job);
      if (message.submitted && frameId === 0) void onSubmittedPage(tabId, sender.tab.url ?? message.url);
    } else if (message.type === "FIELDS_SCANNED") {
      const url = sender.tab.url ?? message.url;
      void autofill
        .onFieldsScanned(tabId, frameId, url, message.fields, message.action)
        .then(() => {
          if (!filling.has(tabId)) void maybeContinueFilling(tabId, url);
        });
    } else {
      void autofill.onProgress(tabId, frameId, message.id, message.status, message.message).then((items) => {
        if (items) void showProgress(tabId, "field", items);
      });
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
