/**
 * Content script: watches the page, detects job applications and reports to the
 * background worker. It never talks to the network and has no UI.
 */
import { detectJob } from "@/content/detection/engine";
import { toContentSchema } from "@/shared/messages";

let lastReport = "";
let timer: ReturnType<typeof setTimeout> | undefined;

function report(force = false) {
  let job = null;
  try {
    job = detectJob(document, location.href);
  } catch (error) {
    console.debug("[copilot] detection failed", error);
  }
  const payload = JSON.stringify({ job, url: location.href });
  if (!force && payload === lastReport) return;
  lastReport = payload;
  chrome.runtime.sendMessage({ type: "PAGE_ANALYZED", job, url: location.href }).catch(() => {
    // The background may be restarting; the next mutation will report again.
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => report(), 600);
}

// Single-page apps change content and URL without reloading.
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    schedule();
  }
}, 1000);

chrome.runtime.onMessage.addListener((raw, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  const parsed = toContentSchema.safeParse(raw);
  if (parsed.success && parsed.data.type === "ANALYZE_PAGE") report(true);
});

report(true);
