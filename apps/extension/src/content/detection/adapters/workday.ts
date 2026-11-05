import type { PortalAdapter } from "@/content/detection/adapters/types";
import { clean, fromSlug, splitTitle } from "@/content/detection/text";
import { text } from "@/content/dom/visibility";

export const workday: PortalAdapter = {
  id: "workday",
  matches: (url) => /\.myworkdayjobs\.com$|\.myworkday\.com$/.test(url.hostname),
  extract(doc, url) {
    const title =
      clean(text(doc.querySelector('[data-automation-id="jobPostingHeader"], [data-automation-id="jobTitle"]'))) ??
      splitTitle(doc.title).title;
    // acme.wd5.myworkdayjobs.com → "Acme"
    const company = fromSlug(url.hostname.split(".")[0]);
    const applying =
      /\/apply(\/|$)/.test(url.pathname) ||
      !!doc.querySelector('[data-automation-id="applyFlowPage"], [data-automation-id="progressBar"]');
    return { title, company, isApplicationPage: applying, isJobPage: /\/job\//.test(url.pathname) || applying };
  },
};
