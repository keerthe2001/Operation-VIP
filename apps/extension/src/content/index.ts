/**
 * Content script: watches the page, detects job applications, describes their form
 * fields and executes fill instructions from the background worker. It never talks
 * to the network and has no UI.
 */
import { fillFields } from "@/content/autofill/writer";
import { expandSections } from "@/content/forms/sections";
import { detectJob, forcedJob } from "@/content/detection/engine";
import { accountExists, actionKind, actionText, findAction, findCreateAccount, findField, findSignIn, pageErrors, scanFields } from "@/content/forms/scanner";
import { toContentSchema } from "@/shared/messages";

// Confirmation pages after applying.
const SUBMITTED_TEXT =
  /thank you for (applying|your application|submitting)|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)/i;

let lastJob = "";
let lastFields = "";
let timer: ReturnType<typeof setTimeout> | undefined;
let filling = false;
// Set when the user asks to fill this page; kept until the page navigates.
let forcedUrl: string | null = null;

function post(message: unknown) {
  chrome.runtime.sendMessage(message).catch(() => {
    // The background may be restarting; the next change will report again.
  });
}

function report(force = false) {
  let job = null;
  try {
    job = detectJob(document, location.href);
  } catch (error) {
    console.debug("[copilot] detection failed", error);
  }
  if (forcedUrl === location.href && !job?.isApplicationPage) {
    const count = scanFields().length;
    if (count > 0) job = { ...forcedJob(document, location.href, count), ...(job ? { title: job.title, company: job.company } : {}) };
  }
  const submitted = window === window.top && SUBMITTED_TEXT.test((document.body?.innerText ?? "").slice(0, 20_000));
  const jobPayload = JSON.stringify({ job, url: location.href, submitted });
  if (force || jobPayload !== lastJob) {
    lastJob = jobPayload;
    post({ type: "PAGE_ANALYZED", job, url: location.href, submitted });
  }
  // Field details are only collected on application pages.
  // The page's main button is reported from the top frame even without form fields, so a final
  // "Review → Submit" page of an application still gets its Submit step.
  const fields = job?.isApplicationPage ? scanFields() : [];
  const actionEl = job?.isApplicationPage || window === window.top ? findAction() : null;
  const action = actionEl ? actionText(actionEl).slice(0, 80) : null;
  const kind = action ? actionKind(action) : null;
  const exists = !!job?.isApplicationPage && accountExists();
  const errors = job?.isApplicationPage ? pageErrors() : [];
  const fieldsPayload = JSON.stringify({ fields, action, exists, errors });
  if (force || fieldsPayload !== lastFields) {
    lastFields = fieldsPayload;
    post({ type: "FIELDS_SCANNED", url: location.href, fields, action, actionKind: kind, accountExists: exists, pageErrors: errors });
  }
}

function schedule() {
  if (filling) return; // our own edits shouldn't trigger a rescan mid-fill
  clearTimeout(timer);
  timer = setTimeout(() => report(), 600);
}

// Single-page apps and multi-step forms change content without reloading: new elements, and
// existing ones shown or hidden through attributes (Workday toggles style/class/aria-hidden).
// Copilot may be injected into a tab that already runs it (toolbar click, "every site" turned
// on with tabs open): start once per page.
const RUNNING = "__copilotContentRunning";
const pageState = globalThis as unknown as Record<string, boolean>;
if (!pageState[RUNNING]) {
  pageState[RUNNING] = true;
  start();
}

function start() {
  const WATCHED = ["style", "class", "hidden", "aria-hidden", "disabled", "aria-expanded", "open"];
  const observer = new MutationObserver((mutations) => {
    // Ignore Copilot's own drawer and the highlight it puts on fields while filling.
    if (mutations.every((m) => (m.target as Element).closest?.("copilot-assistant") || (m.type === "attributes" && m.attributeName === "style" && filling))) return;
    schedule();
  });
  const observe = (root: Node) => observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED });
  observe(document.documentElement);
  // Open shadow roots (web-component forms) are watched as they're found.
  const watchedRoots = new WeakSet<ShadowRoot>();
  function watchShadowRoots() {
    for (const host of document.querySelectorAll("*")) {
      const root = host.shadowRoot;
      if (root && !watchedRoots.has(root) && host.tagName !== "COPILOT-ASSISTANT") {
        watchedRoots.add(root);
        observe(root);
      }
    }
  }
  watchShadowRoots();
  setInterval(watchShadowRoots, 3000);
  document.addEventListener("change", schedule, true);
  // Clicks and focus often reveal the next part of a form (accordions, "Add", tabs).
  document.addEventListener("click", schedule, true);
  document.addEventListener("focusin", schedule, true);
  // Notice fields the user fills by hand, so the panel can move on to the next one.
  document.addEventListener("input", schedule, true);
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      schedule();
    }
  }, 1000);

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    const parsed = toContentSchema.safeParse(raw);
    if (!parsed.success) return false;
    if (parsed.data.type === "ANALYZE_PAGE") {
      if (parsed.data.force) forcedUrl = location.href;
      report(true);
      sendResponse({ ok: true });
      return false;
    }
    if (parsed.data.type === "CLICK_ACTION") {
      const button = findAction();
      // Only the kinds of step the caller allows (Submit only after the user's OK).
      if (!button || !parsed.data.kinds.includes(actionKind(actionText(button)))) {
        sendResponse({ ok: false, error: "No button to click on this page." });
        return false;
      }
      button.scrollIntoView?.({ block: "center" });
      activate(button);
      sendResponse({ ok: true, data: actionText(button) });
      schedule();
      return false;
    }
    if (parsed.data.type === "CLICK_CREATE_ACCOUNT") {
      const link = findCreateAccount();
      if (link) activate(link);
      sendResponse(link ? { ok: true } : { ok: false, error: "No Create Account link on this page." });
      schedule();
      return false;
    }
    if (parsed.data.type === "CLICK_SIGN_IN") {
      const link = findSignIn();
      if (link) activate(link);
      sendResponse(link ? { ok: true } : { ok: false, error: "No Sign In link on this page." });
      schedule();
      return false;
    }
    if (parsed.data.type === "EXPAND_SECTIONS") {
      filling = true;
      void expandSections(parsed.data.counts)
        .then((added) => sendResponse({ ok: true, data: added }))
        .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }))
        .finally(() => {
          filling = false;
          schedule();
        });
      return true;
    }
    if (parsed.data.type === "FOCUS_FIELD") {
      const el = findField(parsed.data.id);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // The click in the panel can pull focus back to it right after; make sure it lands here.
        const land = () => {
          if (document.activeElement !== el) el.focus({ preventScroll: true });
        };
        land();
        for (const delay of [150, 400, 900]) setTimeout(land, delay);
        el.animate?.(
          [{ boxShadow: "0 0 0 0 rgba(91,76,240,0.8)" }, { boxShadow: "0 0 0 6px rgba(91,76,240,0)" }],
          { duration: 900, iterations: 2 },
        );
      }
      sendResponse(el ? { ok: true } : { ok: false, error: "That field is no longer on the page." });
      return false;
    }
    filling = true;
    void fillFields(parsed.data.instructions, {
      interactive: parsed.data.interactive,
      onProgress: (id, status, message) => post({ type: "FILL_PROGRESS", id, status, message }),
    })
      .then(async (results) => {
        // Read back what each control now holds, so the fill can be verified right away
        // (some widgets drop a value moments after it's set).
        await new Promise((r) => setTimeout(r, 250));
        const now = new Map(scanFields().map((f) => [f.id, f]));
        sendResponse({
          ok: true,
          data: results.map((r) => {
            const f = now.get(r.id);
            return f ? { ...r, current: f.currentValue.slice(0, 2000), error: f.error?.slice(0, 300) ?? "" } : r;
          }),
        });
      })
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }))
      .finally(() => {
        filling = false;
        schedule();
      });
    return true;
  });

  report(true);
}

/** Clicks like a person would: some sites (Workday's click overlay) listen for the pointer events. */
function activate(el: HTMLElement) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    const Event = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: true, button: 0, buttons: type.endsWith("down") ? 1 : 0 }));
  }
  el.click();
}
