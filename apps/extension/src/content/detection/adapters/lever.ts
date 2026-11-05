import type { PortalAdapter } from "@/content/detection/adapters/types";
import { clean, fromSlug } from "@/content/detection/text";
import { text } from "@/content/dom/visibility";

export const lever: PortalAdapter = {
  id: "lever",
  matches: (url) => url.hostname === "jobs.lever.co" || url.hostname === "jobs.eu.lever.co",
  extract(doc, url) {
    const [slug, postingId] = url.pathname.split("/").filter(Boolean);
    const title = clean(text(doc.querySelector(".posting-headline h2, .posting-header h2, h2")));
    const logoAlt = doc.querySelector(".main-header-logo img")?.getAttribute("alt")?.replace(/\s*logo$/i, "");
    const form = doc.querySelector("#application-form, form.application-form, form[action*='/apply']");
    return {
      title,
      company: clean(logoAlt) ?? fromSlug(slug),
      isApplicationPage: !!form || url.pathname.endsWith("/apply"),
      isJobPage: !!postingId,
    };
  },
};
