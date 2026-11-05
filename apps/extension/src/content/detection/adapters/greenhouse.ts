import type { PortalAdapter } from "@/content/detection/adapters/types";
import { clean, fromSlug } from "@/content/detection/text";
import { text } from "@/content/dom/visibility";

export const greenhouse: PortalAdapter = {
  id: "greenhouse",
  matches: (url) => /(^|\.)greenhouse\.io$/.test(url.hostname),
  extract(doc, url) {
    const title = clean(text(doc.querySelector(".app-title, .job__title h1, h1.section-header, h1")));
    const companyText = text(doc.querySelector(".company-name, .job__header .company"));
    const slug = url.searchParams.get("for") ?? url.pathname.split("/").filter(Boolean)[0];
    const company = clean(companyText.replace(/^at\s+/i, "")) ?? (slug === "embed" ? null : fromSlug(slug));
    const form = doc.querySelector("#application_form, #application-form, form[action*='applications']");
    return { title, company, isApplicationPage: !!form, isJobPage: /\/jobs\/\d+|job_app|token=/.test(url.href) || !!form };
  },
};
