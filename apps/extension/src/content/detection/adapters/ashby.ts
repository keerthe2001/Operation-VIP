import type { PortalAdapter } from "@/content/detection/adapters/types";
import { clean, fromSlug } from "@/content/detection/text";
import { text } from "@/content/dom/visibility";

export const ashby: PortalAdapter = {
  id: "ashby",
  matches: (url) => url.hostname === "jobs.ashbyhq.com",
  extract(doc, url) {
    const [slug, postingId, step] = url.pathname.split("/").filter(Boolean);
    const title = clean(text(doc.querySelector("h1")));
    const form = doc.querySelector("form, [class*='application-form']");
    return {
      title,
      company: fromSlug(slug),
      isApplicationPage: step === "application" || (!!form && !!postingId),
      isJobPage: !!postingId,
    };
  },
};
