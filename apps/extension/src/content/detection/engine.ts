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
    isApplicationPage: Boolean(adapterResult?.isApplicationPage) || applicationForm,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    fieldCount: forms.fieldCount,
  };
}
