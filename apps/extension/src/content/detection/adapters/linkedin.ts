import type { PortalAdapter } from "@/content/detection/adapters/types";
import { clean } from "@/content/detection/text";
import { text } from "@/content/dom/visibility";

export const linkedin: PortalAdapter = {
  id: "linkedin",
  matches: (url) => /(^|\.)linkedin\.com$/.test(url.hostname) && url.pathname.startsWith("/jobs"),
  extract(doc, url) {
    const title = clean(
      text(doc.querySelector(".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .top-card-layout__title, h1")),
    );
    const company = clean(
      text(
        doc.querySelector(
          ".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link",
        ),
      ),
    );
    const easyApply = !!doc.querySelector(".jobs-easy-apply-modal, [data-test-modal-id='easy-apply-modal']");
    const isJobPage = /\/jobs\/view\//.test(url.pathname) || url.searchParams.has("currentJobId");
    return { title, company, isApplicationPage: easyApply, isJobPage };
  },
};
