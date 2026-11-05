import { labelFor } from "@/content/dom/labels";
import { isVisible } from "@/content/dom/visibility";

/** Field purposes that strongly indicate a job application form. */
const APPLICATION_FIELDS: [string, RegExp][] = [
  ["first_name", /\bfirst\s*name|given\s*name|forename/i],
  ["last_name", /\blast\s*name|surname|family\s*name/i],
  ["full_name", /\bfull\s*name|^name\b|your name/i],
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|telephone/i],
  ["resume", /resume|résumé|\bcv\b|curriculum/i],
  ["cover_letter", /cover\s*letter/i],
  ["linkedin", /linkedin/i],
  ["work_authorization", /authori[sz]ed to work|work authori[sz]ation|sponsorship|visa/i],
  ["salary", /salary|compensation/i],
];

export interface FormSignals {
  fieldCount: number;
  matchedFields: string[];
  hasResumeUpload: boolean;
}

const CONTROL_SELECTOR =
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]):not([type=image]), textarea, select, [contenteditable='true']";

export function analyzeForms(root: Document | ShadowRoot): FormSignals {
  const controls = [...root.querySelectorAll(CONTROL_SELECTOR)].filter(isVisible);
  const matched = new Set<string>();
  let hasResumeUpload = false;
  for (const control of controls) {
    const descriptor = [labelFor(control), control.getAttribute("name"), control.id, control.getAttribute("autocomplete")]
      .filter(Boolean)
      .join(" ");
    for (const [key, pattern] of APPLICATION_FIELDS) {
      if (pattern.test(descriptor)) matched.add(key);
    }
    if (control instanceof HTMLInputElement && control.type === "file" && /resume|résumé|\bcv\b/i.test(descriptor)) {
      hasResumeUpload = true;
    }
  }
  return { fieldCount: controls.length, matchedFields: [...matched], hasResumeUpload };
}

const APPLY_TEXT = /apply (?:for this|now|to this)|submit (?:your )?application|application form|easy apply/i;
const JOB_URL = /\/(?:jobs?|careers?|positions?|openings?|vacanc(?:y|ies)|apply|application|postings?)(?:\/|$|\?)/i;

export function pageSignals(doc: Document, url: URL) {
  const bodyText = doc.body?.innerText ?? doc.body?.textContent ?? "";
  return {
    applyText: APPLY_TEXT.test(bodyText.slice(0, 50_000)),
    jobUrl: JOB_URL.test(url.pathname + url.search),
    jobMeta: /\b(?:jobs?|careers?|hiring)\b/i.test(`${doc.title} ${doc.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? ""}`),
  };
}
