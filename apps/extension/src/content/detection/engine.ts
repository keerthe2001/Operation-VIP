import { ashby } from "@/content/detection/adapters/ashby";
import { greenhouse } from "@/content/detection/adapters/greenhouse";
import { lever } from "@/content/detection/adapters/lever";
import { linkedin } from "@/content/detection/adapters/linkedin";
import type { PortalAdapter } from "@/content/detection/adapters/types";
import { workday } from "@/content/detection/adapters/workday";
import { readJobPosting } from "@/content/detection/jsonld";
import { analyzeForms, pageSignals } from "@/content/detection/signals";
import { clean, splitTitle } from "@/content/detection/text";
import type { DetectedJob } from "@/shared/types";

export const ADAPTERS: PortalAdapter[] = [greenhouse, lever, workday, ashby, linkedin];

/** A page is reported as a job page from this confidence upwards. */
export const JOB_THRESHOLD = 0.5;

const DESCRIPTION_SELECTORS = [
  "#content .job-post-content", "#content", ".job__description", // Greenhouse
  "[data-qa='job-description']", ".posting-page .section-wrapper", // Lever
  "[data-automation-id='jobPostingDescription']", // Workday
  "[class*='descriptionText']", "[class*='job-description']", "[class*='jobDescription']", // Ashby / generic
  ".jobs-description__content", // LinkedIn
  "[class*='job-desc']", "[class*='JDC']", "[class*='jobdescription']", "#jobDescriptionText", // Naukri, Indeed, generic
];

function pageDescription(doc: Document): string | null {
  for (const selector of DESCRIPTION_SELECTORS) {
    const el = doc.querySelector(selector);
    const text = (el as HTMLElement | null)?.innerText ?? el?.textContent ?? "";
    const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
    if (cleaned.length >= 200) return cleaned.slice(0, 20_000);
  }
  return null;
}

/**
 * Generic detection with portal-specific adapters layered on top. Adapters only
 * improve title/company extraction and certainty; the generic signals (structured
 * data, form fields, URL and page text) work on any career site.
 */
export function detectJob(doc: Document, href: string): DetectedJob | null {
  const url = new URL(href);
  const adapter = ADAPTERS.find((a) => a.matches(url));
  const adapterResult = adapter?.extract(doc, url);
  const posting = readJobPosting(doc);
  const forms = analyzeForms(doc);
  const page = pageSignals(doc, url);

  const signals: string[] = [];
  let confidence = 0;
  if (adapterResult?.isJobPage) {
    confidence += 0.6;
    signals.push(`portal:${adapter!.id}`);
  }
  if (posting) {
    confidence += 0.4;
    signals.push("structured-data");
  }
  const applicationForm = forms.matchedFields.length >= 3 || (forms.hasResumeUpload && forms.matchedFields.length >= 2);
  if (applicationForm) {
    confidence += 0.35;
    signals.push(`form-fields:${forms.matchedFields.length}`);
  }
  if (forms.hasResumeUpload) {
    confidence += 0.15;
    signals.push("resume-upload");
  }
  if (page.jobUrl) {
    confidence += 0.15;
    signals.push("job-url");
  }
  if (page.applyText) {
    confidence += 0.1;
    signals.push("apply-text");
  }
  if (page.jobMeta) {
    confidence += 0.05;
    signals.push("job-metadata");
  }
  // A form that clearly asks for applicant details is enough on its own: name, email and
  // phone, or a couple of those next to a CV upload or on a careers URL.
  const strongForm =
    forms.matchedFields.length >= 3 ||
    (forms.matchedFields.length >= 2 && (forms.hasResumeUpload || page.jobUrl || page.applyText));
  if (strongForm) confidence = Math.max(confidence, 0.6);
  confidence = Math.min(1, confidence);
  if (confidence < JOB_THRESHOLD) return null;

  const fallback = splitTitle(clean(doc.querySelector('meta[property="og:title"]')?.getAttribute("content")) ?? doc.title);
  return {
    portal: adapter?.id ?? "generic",
    title: adapterResult?.title ?? posting?.title ?? fallback.title,
    company:
      adapterResult?.company ??
      posting?.company ??
      clean(doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")) ??
      fallback.company,
    url: url.href,
    isApplicationPage: Boolean(adapterResult?.isApplicationPage) || applicationForm || strongForm,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    fieldCount: forms.fieldCount,
    description: posting?.description ?? pageDescription(doc),
  };
}

/** What the user gets when they ask Copilot to fill a page it didn't recognise. */
export function forcedJob(doc: Document, href: string, fieldCount: number): DetectedJob {
  const fallback = splitTitle(clean(doc.querySelector('meta[property="og:title"]')?.getAttribute("content")) ?? doc.title);
  return {
    portal: "generic",
    title: fallback.title,
    company: clean(doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content")) ?? fallback.company ?? new URL(href).hostname.replace(/^www\./, ""),
    url: href,
    isApplicationPage: true,
    confidence: 0.5,
    signals: ["user-requested"],
    fieldCount,
    description: pageDescription(doc),
  };
}
