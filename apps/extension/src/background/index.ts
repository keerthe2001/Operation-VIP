import { createApi } from "@/background/api";
import { activeError, AutofillCoordinator, holdsValue } from "@/background/autofill";
import { fieldLabel } from "@/mapping/engine";
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
import type { FillResult, FormState, MappedField } from "@/shared/fields";
import { appKey, chromeArea, DEFAULT_LOCAL, DEFAULT_WIDGET, formKey, tabEntry, tabKey, type LocalStore, type SessionStore } from "@/shared/storage";
import type { ActivityEntry, DetectedJob, TabState } from "@/shared/types";

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

const filling = new Set<number>();

// ---------------------------------------------------------------- activity log (shown in the panel)

const activityKey = (tabId: number) => `activity:${tabId}`;
async function log(tabId: number, text: string, kind: ActivityEntry["kind"] = "info") {
  const key = activityKey(tabId);
  const current = ((await chrome.storage.session.get(key))[key] as ActivityEntry[] | undefined) ?? [];
  if (current.at(-1)?.text === text) return;
  await chrome.storage.session.set({ [key]: [...current, { at: Date.now(), text, kind }].slice(-40) });
}

/** How many entries the profile has for each repeatable section. */
async function sectionCounts() {
  const p = (await local.get("profile"))?.profile;
  const info = p?.personal_information;
  return {
    experience: p?.experience.length ?? 0,
    education: p?.education.length ?? 0,
    languages: p?.additional_info.languages?.length ?? 0,
    websites: [info?.portfolio, info?.github, info?.twitter, info?.behance, info?.dribbble].filter(Boolean).length,
  };
}

/** Presses "Add" in empty repeatable sections (Work Experience, Education…); returns how many. */
async function expandSections(tabId: number): Promise<number> {
  const reply = (await chrome.tabs
    .sendMessage(tabId, { type: "EXPAND_SECTIONS", counts: await sectionCounts() }, { frameId: 0 })
    .catch(() => null)) as Reply<number> | null;
  const added = reply?.ok ? (reply.data ?? 0) : 0;
  if (added) await log(tabId, `Added ${added} section${added === 1 ? "" : "s"} to fill (experience, education…)`);
  return added;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fills fields, then checks each one took its value (the page re-renders after a fill, so the
 * check reads the rescan). Fields that didn't take it, or show an error, are filled once more
 * by typing; what still fails goes to "needs you" with the reason.
 */
async function fillAndVerify(tabId: number, keys: string[], overwrite: boolean) {
  const summary = await autofill.fill(tabId, keys, overwrite);
  await sleep(900);
  const retry = await autofill.unverified(tabId, keys);
  if (retry.length) {
    await log(tabId, `Re-checking ${retry.length} field${retry.length === 1 ? "" : "s"} that didn't take the value`);
    await autofill.fill(tabId, retry, true, { typing: true });
    await sleep(900);
    const stuck = await autofill.unverified(tabId, retry);
    await autofill.markFailed(tabId, stuck, "Didn't take the value. Please check it.");
    summary.failed += stuck.length;
    summary.filled -= stuck.length;
  }
  return summary;
}

/** Fills every ready field on the page. */
async function fillReady(tabId: number) {
  if (filling.has(tabId)) return { filled: 0, skipped: 0, failed: 0 };
  filling.add(tabId);
  try {
    const state = await autofill.state(tabId);
    const keys = readyKeys(state?.fields ?? []);
    const summary = keys.length ? await fillAndVerify(tabId, keys, false) : { filled: 0, skipped: 0, failed: 0 };
    const after = await autofill.state(tabId);
    const filled = after?.fields.filter((f) => f.result === "filled").length ?? 0;
    void tracker.onFilled(tabId, (await session.get(tabKey(tabId)))?.job, filled);
    if (summary.filled) void log(tabId, `Filled ${summary.filled} field${summary.filled === 1 ? "" : "s"}`, "done");
    if (summary.failed) void log(tabId, `${summary.failed} field${summary.failed === 1 ? "" : "s"} couldn't be filled`, "need");
    return summary;
  } finally {
    filling.delete(tabId);
  }
}

// ---------------------------------------------------------------- auto apply

/** Steps already handled, so a page that re-renders after an error isn't clicked again. */
const handledSteps = new Map<number, Set<string>>();
const flowTimers = new Map<number, ReturnType<typeof setTimeout>>();

const needsYou = (state: FormState) =>
  state.fields.filter((f) => (f.required && !hasValue(f) && f.result !== "filled") || (f.result === "failed" && !f.currentValue.trim()) || !!activeError(f));
const hasValue = (f: MappedField) => f.currentValue.trim() !== "" || f.result === "filled";

/** Called whenever a page step changes: fill it, then move to the next step on its own. */
function scheduleFlow(tabId: number) {
  clearTimeout(flowTimers.get(tabId));
  // Let the step settle before acting on it.
  flowTimers.set(tabId, setTimeout(() => void runFlow(tabId), 900));
}

async function runFlow(tabId: number) {
  if (filling.has(tabId) || (await settings()).applyMode !== "auto") return;
  if ((await auth.state()).status !== "signed_in") return;
  const job = (await session.get(tabKey(tabId)))?.job;
  const state = await autofill.state(tabId);
  // Workday's "Start Your Application" dialog appears on the job page once the user pressed Apply.
  const startDialog = state?.actionKind === "start" && /\b(manually|start (your |my )?application)\b/i.test(state.action ?? "");
  if ((!job?.isApplicationPage && !startDialog) || !state || (state.fields.length === 0 && !state.action)) return;

  const step = `${state.url}|${state.action ?? ""}|${state.fields.map((f) => f.id).join(",")}`;
  const done = handledSteps.get(tabId) ?? new Set<string>();
  handledSteps.set(tabId, done);

  // The site says the account exists: switch to its Sign In form.
  if (state.accountExists && state.actionKind === "account" && !done.has(`signin|${state.url}`)) {
    done.add(`signin|${state.url}`);
    await log(tabId, "Account already exists: signing in");
    await chrome.tabs.sendMessage(tabId, { type: "CLICK_SIGN_IN" }, { frameId: 0 }).catch(() => undefined);
    return;
  }
  if (startDialog && !done.has(`start|${state.url}`)) {
    done.add(`start|${state.url}`);
    await log(tabId, `${state.action}…`);
    await chrome.tabs.sendMessage(tabId, { type: "CLICK_ACTION", kinds: ["start"] }, { frameId: 0 }).catch(() => undefined);
    return;
  }

  // Open empty "Add" sections first, so experience and education get filled too.
  if (!done.has(`expand|${step}`)) {
    done.add(`expand|${step}`);
    if ((await expandSections(tabId)) > 0) {
      scheduleFlow(tabId); // the new fields are scanned, then filled
      return;
    }
  }

  if (!done.has(`fill|${step}`) && readyKeys(state.fields).length > 0) {
    done.add(`fill|${step}`);
    await fillReady(tabId);
    scheduleFlow(tabId);
    return;
  }

  // Fields the page marks as wrong get one more try, typed, before asking the user.
  const latest = (await autofill.state(tabId)) ?? state;
  const clicks = [1, 2, 3].filter((n) => done.has(`click#${n}|${step}`)).length;
  const erroring = latest.fields.filter((f) => activeError(f) && f.value && f.result !== "failed");
  if (erroring.length && !done.has(`fix|${step}`)) {
    done.add(`fix|${step}`);
    done.add(`refill#${clicks}|${step}`);
    await log(tabId, `Fixing ${erroring.length} field${erroring.length === 1 ? "" : "s"} the page flagged`);
    filling.add(tabId);
    try {
      await autofill.fill(tabId, erroring.map((f) => `${f.frameId}:${f.id}`), true, { typing: true });
    } finally {
      filling.delete(tabId);
    }
    scheduleFlow(tabId);
    return;
  }

  const missing = needsYou(latest);
  if (missing.length > 0) {
    await log(tabId, `${missing.length} field${missing.length === 1 ? "" : "s"} need${missing.length === 1 ? "s" : ""} you`, "need");
    return;
  }

  const kind = state.actionKind;
  if (!kind || !state.action) return;
  // A sign-in that the site refused: no account yet, so create one (once). Never retry a
  // password, which can lock the account.
  const signingIn = kind === "account" && /^(sign in|log ?in)$/i.test(state.action);
  if (signingIn && done.has(`signin-tried|${state.url}`)) {
    const errors = [...(latest.pageErrors ?? []), ...latest.fields.map((f) => activeError(f)).filter(Boolean)];
    if (!errors.length) return; // still signing in
    if (!done.has(`create|${state.url}`) && !done.has(`signin|${state.url}`)) {
      done.add(`create|${state.url}`);
      await log(tabId, "No account with this email yet: creating one");
      await chrome.tabs.sendMessage(tabId, { type: "CLICK_CREATE_ACCOUNT" }, { frameId: 0 }).catch(() => undefined);
      return;
    }
    if (!done.has(`stuck|${state.url}`)) {
      done.add(`stuck|${state.url}`);
      await log(tabId, `Sign in didn't work: ${errors[0]!.slice(0, 100)}. Please sign in yourself`, "need");
    }
    return;
  }
  if (signingIn) done.add(`signin-tried|${state.url}`);
  if (clicks > 0) {
    // Still on the same step after pressing the button: the page refused. Read its errors,
    // put back what it rejected or cleared, then press again (three tries at most).
    const errors = [...(latest.pageErrors ?? []), ...latest.fields.filter((f) => activeError(f)).map((f) => `${fieldLabel(f)}: ${activeError(f)}`)];
    const lost = latest.fields.filter((f) => f.value && f.result === "filled" && !holdsValue(f));
    const refilled = done.has(`refill#${clicks}|${step}`);
    if (!refilled && !errors.length && !lost.length) return; // the next step is still loading
    if (clicks >= 3) {
      if (!done.has(`stuck|${step}`)) {
        done.add(`stuck|${step}`);
        await log(tabId, `The page didn't continue: ${(errors[0] ?? "a field was cleared").slice(0, 120)}`, "need");
      }
      return;
    }
    if (!refilled) {
      done.add(`refill#${clicks}|${step}`);
      await log(tabId, `The page didn't continue (${(errors[0] ?? "a field was cleared").slice(0, 100)}). Fixing it`);
      const keys = [...lost, ...latest.fields.filter((f) => activeError(f) && f.value)].map((f) => `${f.frameId}:${f.id}`);
      if (keys.length) {
        filling.add(tabId);
        try {
          await autofill.fill(tabId, [...new Set(keys)], true, { typing: true });
        } finally {
          filling.delete(tabId);
        }
      }
      scheduleFlow(tabId); // re-read the page, then press again if nothing needs the user
      return;
    }
  }
  if (kind === "submit") {
    await log(tabId, "Everything is filled. Ready to submit", "need");
    return; // the final Submit always waits for the user's OK
  }
  done.add(`click#${clicks + 1}|${step}`);
  await log(tabId, kind === "account" ? `${state.action}…` : clicks ? `${state.action} (try ${clicks + 1})` : `${state.action} → next page`);
  await chrome.tabs.sendMessage(tabId, { type: "CLICK_ACTION", kinds: [kind] }, { frameId: 0 }).catch(() => undefined);
  // If the page doesn't move on, look again for its errors.
  setTimeout(() => scheduleFlow(tabId), 3500);
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

/** The application a tab is in the middle of (by site), for its later pages. */
const applyContext = new Map<number, { host: string; job: DetectedJob; at: number }>();

/** Several frames can report (e.g. an embedded Greenhouse iframe): keep the best one. */
const frameReports = new Map<number, Map<number, DetectedJob | null>>();

async function recordTab(tabId: number, frameId: number, url: string, reported: DetectedJob | null) {
  const frames = frameReports.get(tabId) ?? new Map<number, DetectedJob | null>();
  if (frameId === 0) frames.clear(); // a top-level navigation resets the page
  frames.set(frameId, reported);
  frameReports.set(tabId, frames);
  const best = [...frames.values()]
    .filter((j): j is DetectedJob => j !== null)
    .sort((a, b) => Number(b.isApplicationPage) - Number(a.isApplicationPage) || b.confidence - a.confidence)[0];
  // Later pages of an application in progress (a review page without fields, say) stay part of it.
  const flow = applyContext.get(tabId);
  let job = best ?? null;
  if (!job?.isApplicationPage && flow && flow.host === new URL(url).hostname && Date.now() - flow.at < 60 * 60 * 1000) {
    job = { ...flow.job, url, isApplicationPage: true, signals: [...flow.job.signals, "same-application"] };
  }
  if (job?.isApplicationPage) applyContext.set(tabId, { host: new URL(url).hostname, job, at: Date.now() });
  const state: TabState = { url, job, analyzedAt: Date.now() };
  await session.set(tabEntry(tabId, state));
  await chrome.action.setBadgeText({ tabId, text: job?.isApplicationPage ? "●" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f46e5" });
  // "Applications you submit without autofill: track them" (otherwise only after autofill).
  if (job?.isApplicationPage && (await auth.state()).status === "signed_in" && (await settings()).trackWithoutAutofill) {
    void tracker.onDetected(tabId, job);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  frameReports.delete(tabId);
  void session.remove([tabKey(tabId), formKey(tabId), appKey(tabId)]);
  void chrome.storage.session.remove([`embed:${tabId}`, `activity:${tabId}`]);
  handledSteps.delete(tabId);
  applyContext.delete(tabId);
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
        if ((await expandSections(tabId)) > 0) await sleep(1500);
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
        // Open empty "Add" sections first; then fill what the user chose plus the new fields.
        let fields = message.fields;
        if ((await expandSections(message.tabId)) > 0) {
          await sleep(1500);
          const fresh = await autofill.state(message.tabId);
          fields = [...new Set([...fields, ...readyKeys(fresh?.fields ?? [])])];
        }
        const summary = await fillAndVerify(message.tabId, fields, message.overwrite);
        const state = await autofill.state(message.tabId);
        const filled = state?.fields.filter((f) => f.result === "filled").length ?? 0;
        void tracker.onFilled(message.tabId, (await session.get(tabKey(message.tabId)))?.job, filled);
        return { ok: true, data: summary };
      }
      case "CLICK_ACTION": {
        // The user pressed it in the panel: any step except the final submit (see below).
        const reply = (await chrome.tabs
          .sendMessage(message.tabId, { type: "CLICK_ACTION", kinds: ["start", "continue", "account"] }, { frameId: 0 })
          .catch(() => null)) as Reply | null;
        return reply ?? { ok: false, error: "The page didn't respond." };
      }
      case "SUBMIT_APPLICATION": {
        const reply = (await chrome.tabs
          .sendMessage(message.tabId, { type: "CLICK_ACTION", kinds: ["submit"] }, { frameId: 0 })
          .catch(() => null)) as Reply | null;
        if (!reply?.ok) return reply ?? { ok: false, error: "The page didn't respond." };
        const job = (await session.get(tabKey(message.tabId)))?.job;
        if (!(await tracker.get(message.tabId)) && job) await tracker.save(message.tabId, job);
        const tracked = await tracker.setStatus(message.tabId, "submitted").catch(() => null);
        const tab = await chrome.tabs.get(message.tabId).catch(() => null);
        if (tab?.url) promptedSubmission.add(tab.url);
        await log(message.tabId, tracked ? "Submitted and saved to your tracker" : "Submitted", "done");
        return { ok: true };
      }
      case "FOCUS_FIELD": {
        const [frameId, id] = [Number(message.key.split(":")[0]), message.key.split(":").slice(1).join(":")];
        const reply = (await chrome.tabs
          .sendMessage(message.tabId, { type: "FOCUS_FIELD", id }, { frameId })
          .catch(() => null)) as Reply | null;
        return reply ?? { ok: false, error: "The page didn't respond." };
      }
      case "SET_SETTINGS": {
        const next = { ...(await settings()), ...message.settings } as AutofillSettings;
        await local.set({ settings: next });
        return { ok: true };
      }
      case "CLEAR_MEMORY":
        await local.set({ memory: {} });
        return { ok: true };
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
        .onFieldsScanned(tabId, frameId, url, message.fields, message.action, message.actionKind, message.accountExists, message.pageErrors)
        .then(() => {
          if (!filling.has(tabId)) scheduleFlow(tabId);
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
