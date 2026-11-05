/**
 * Content script: watches the page, detects job applications, describes their form
 * fields and executes fill instructions from the background worker. It never talks
 * to the network and has no UI.
 */
import { fillFields } from "@/content/autofill/writer";
import { detectJob } from "@/content/detection/engine";
import { scanFields } from "@/content/forms/scanner";
import { toContentSchema } from "@/shared/messages";

let lastJob = "";
let lastFields = "";
let timer: ReturnType<typeof setTimeout> | undefined;
let filling = false;

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
  const jobPayload = JSON.stringify({ job, url: location.href });
  if (force || jobPayload !== lastJob) {
    lastJob = jobPayload;
    post({ type: "PAGE_ANALYZED", job, url: location.href });
  }
  // Field details are only collected on application pages.
  const fields = job?.isApplicationPage ? scanFields() : [];
  const fieldsPayload = JSON.stringify(fields);
  if (force || fieldsPayload !== lastFields) {
    lastFields = fieldsPayload;
    post({ type: "FIELDS_SCANNED", url: location.href, fields });
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
    report(true);
    return false;
  }
  filling = true;
  void fillFields(parsed.data.instructions)
    .then((results) => sendResponse({ ok: true, data: results }))
    .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }))
    .finally(() => {
      filling = false;
      schedule();
    });
  return true;
});

report(true);
