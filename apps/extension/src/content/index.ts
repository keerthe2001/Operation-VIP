/**
 * Content script: watches the page, detects job applications, describes their form
 * fields and executes fill instructions from the background worker. It never talks
 * to the network and has no UI.
 */
import { fillFields } from "@/content/autofill/writer";
import { detectJob, forcedJob } from "@/content/detection/engine";
import { actionText, CONTINUE_TEXT, findAction, scanFields } from "@/content/forms/scanner";
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
  const fields = job?.isApplicationPage ? scanFields() : [];
  const actionEl = job?.isApplicationPage ? findAction() : null;
  const action = actionEl ? actionText(actionEl).slice(0, 80) : null;
  const fieldsPayload = JSON.stringify({ fields, action });
  if (force || fieldsPayload !== lastFields) {
    lastFields = fieldsPayload;
    post({ type: "FIELDS_SCANNED", url: location.href, fields, action });
  }
}

function schedule() {
  if (filling) return; // our own edits shouldn't trigger a rescan mid-fill
  clearTimeout(timer);
  timer = setTimeout(() => report(), 600);
}

// Single-page apps and multi-step forms change content without reloading.
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("change", schedule, true);
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
    // Automatic clicks only ever press Continue / Next, never a final submit.
    if (!button || (parsed.data.continueOnly && !CONTINUE_TEXT.test(actionText(button)))) {
      sendResponse({ ok: false, error: "No button to click on this page." });
      return false;
    }
    button.scrollIntoView?.({ block: "center" });
    button.click();
    sendResponse({ ok: true });
    return false;
  }
  filling = true;
  void fillFields(parsed.data.instructions, {
    interactive: parsed.data.interactive,
    onProgress: (id, status, message) => post({ type: "FILL_PROGRESS", id, status, message }),
  })
    .then((results) => sendResponse({ ok: true, data: results }))
    .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }))
    .finally(() => {
      filling = false;
      schedule();
    });
  return true;
});

report(true);
