import { labelFor, nearbyText } from "@/content/dom/labels";
import { isVisible } from "@/content/dom/visibility";
import { deepQueryAll } from "@/content/forms/scanner";

/** Field purposes that strongly indicate a job application form. */
const APPLICATION_FIELDS: [string, RegExp][] = [
  ["first_name", /\bfirst\s*name|given\s*name|forename/i],
  ["last_name", /\blast\s*name|surname|family\s*name/i],
  ["full_name", /\bfull\s*name|^name\b|your name/i],
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|telephone|\bcell\b|contact\s*(?:number|no\b)|whats\s*app/i],
  ["resume", /resume|résumé|\bcv\b|curriculum/i],
  ["portfolio", /portfolio|github|personal (?:website|site)/i],
  ["position", /position|applying for|job title|role you|designation|vacancy/i],
  ["cover_letter", /cover\s*letter/i],
  ["linkedin", /linkedin/i],
  ["work_authorization", /authori[sz]ed to work|work authori[sz]ation|sponsorship|visa/i],
  ["salary", /salary|compensation|\bctc\b/i],
  ["notice_period", /notice period|joining|earliest start|availability to start/i],
  ["experience", /years? of experience|total experience|\bexperience\b.*\byears?\b|current (company|employer|designation)/i],
  ["qualification", /qualification|highest degree|college|university|year of passing/i],
];

/** Fields that only an application asks for (a contact form has name, email and phone too). */
export const JOB_ONLY_FIELDS = new Set(["resume", "position", "cover_letter", "linkedin", "work_authorization", "salary", "notice_period", "experience", "qualification", "portfolio"]);

export interface FormSignals {
  fieldCount: number;
  matchedFields: string[];
  hasResumeUpload: boolean;
}

const CONTROL_SELECTOR =
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]):not([type=image]), textarea, select, [contenteditable='true']";

const isFileInput = (el: Element) => el instanceof HTMLInputElement && el.type === "file";

export function analyzeForms(root: Document): FormSignals {
  // Upload buttons are often custom drop zones that hide the real file input, so file
  // inputs count even when hidden. Forms inside web components (open shadow roots) count too.
  const controls = deepQueryAll(root, CONTROL_SELECTOR).filter((el) => !el.closest("copilot-assistant") && (isFileInput(el) || isVisible(el)));
  const matched = new Set<string>();
  let hasResumeUpload = false;
  for (const control of controls) {
    const descriptor = [labelFor(control), control.getAttribute("name"), control.id, control.getAttribute("autocomplete")]
      .filter(Boolean)
      .join(" ");
    for (const [key, pattern] of APPLICATION_FIELDS) {
      if (pattern.test(descriptor)) matched.add(key);
    }
    if (isFileInput(control) && /resume|résumé|\bcv\b|curriculum/i.test(`${descriptor} ${nearbyText(control)}`)) {
      hasResumeUpload = true;
      matched.add("resume");
    }
  }
  return { fieldCount: controls.length, matchedFields: [...matched], hasResumeUpload };
}

const APPLY_TEXT =
  /apply (?:for this|now|to this|for the (?:position|role|job))|submit (?:your )?(?:application|cv|resume)|application form|easy apply|job application|upload (?:your )?(?:cv|resume)|(?:current|open) (?:openings|positions|vacancies)|join our team|we(?:'re| are) hiring|candidate (?:details|information|profile)/i;
const JOB_URL =
  /\/(?:jobs?|careers?|career-?page|positions?|openings?|vacanc(?:y|ies)|apply|application|postings?|join-?us|work-?with-?us|hiring|recruit(?:ment|ing)?|talents?|opportunit(?:y|ies)|requisitions?|internships?|karriere|stellen(?:angebote)?|empleo|emplois?|vacatures?)(?:[/_-]|$|\?|\.)|\/job-listings-|\/viewjob\b|[?&](?:gh_jid|jobid|job_id|jid|reqid|req_id|requisitionid|postingid)=/i;

export function pageSignals(doc: Document, url: URL) {
  const bodyText = doc.body?.innerText ?? doc.body?.textContent ?? "";
  return {
    applyText: APPLY_TEXT.test(bodyText.slice(0, 50_000)),
    jobUrl: JOB_URL.test(url.pathname + url.search),
    jobMeta: /\b(?:jobs?|careers?|hiring|vacanc(?:y|ies)|openings?|recruitment|join us)\b/i.test(
      `${doc.title} ${doc.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? ""} ${[...doc.querySelectorAll("h1, h2")].slice(0, 6).map((h) => h.textContent).join(" ")}`,
    ),
  };
}
