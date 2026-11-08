import { classifyIntent } from "@copilot/shared";

import { splitLocation } from "@/mapping/location";
import { attrWords, norm } from "@/mapping/normalize";
import { matchBoolean, matchNumber, matchText } from "@/mapping/options";
import { RULES, RULES_BY_KEY } from "@/mapping/taxonomy";
import { workdayKey } from "@/mapping/workday";
import type { FieldDescriptor, FieldStatus, MappedField } from "@/shared/fields";
import type { ExtensionProfile } from "@/shared/types";

export const AUTO_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.6;

/** Never filled automatically: the user decides what to disclose. */
const SENSITIVE_KEYS = new Set([
  "gender", "pronouns", "nationality", "work_authorization", "requires_sponsorship",
  "ethnicity", "veteran_status", "disability_status", "hispanic", "armed_forces", "lgbt",
]);

/** Keys that belong to one job or one degree: repeated blocks map to the 1st, 2nd, … entry. */
export const EXPERIENCE_KEYS = new Set([
  "current_company", "current_title", "job_duration", "employment_start", "employment_end", "role_description", "job_location", "currently_working",
]);
export const EDUCATION_KEYS = new Set(["school", "degree", "discipline", "graduation_year", "gpa", "education_start"]);
const LIST_KEYS = new Set(["language_item", "website_item"]);
const CONSENT = /\b(agree|consent|acknowledge|privacy|terms|certify|confirm that)\b/;

const KIND_TYPES: Record<FieldDescriptor["kind"], string> = {
  text: "text", email: "email", tel: "tel", url: "url", number: "number", date: "date", textarea: "text",
  select: "select", radio: "radio", checkbox: "checkbox", file: "file", contenteditable: "text", combobox: "select",
  password: "password", listbox: "select", checkboxes: "radio",
};

/** Shown instead of the account password; the real one is only read when filling. */
export const PASSWORD_MASK = "••••••••";

export interface Classification {
  key: string | null;
  confidence: number;
  question: boolean;
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Free-text application questions ("Why do you want to work here?") go to the answer library. */
export function isQuestion(field: FieldDescriptor): boolean {
  const label = field.label.trim();
  const words = wordCount(label);
  if (field.kind === "textarea" || field.kind === "contenteditable") return label.endsWith("?") || words >= 5;
  if (field.kind === "text") return label.endsWith("?") && words >= 5;
  return false;
}

/** Which part of a split date a box takes ("From" → Month / Year boxes on Workday). */
export function datePart(field: FieldDescriptor): "month" | "year" | null {
  const text = `${field.label} ${field.placeholder} ${field.name} ${field.htmlId}`.toLowerCase();
  const id = `${field.htmlId} ${field.automationId ?? ""}`.toLowerCase();
  // A single "MM/YYYY" box takes the whole date; only separate boxes are parts.
  if (/mm\s*\/\s*yyyy/i.test(`${field.placeholder} ${field.label}`)) return null;
  if (/\b(month|mm)\b/.test(text) || /datesectionmonth/.test(id)) return "month";
  if (/\b(year|yyyy|yy)\b/.test(text) || /datesectionyear/.test(id)) return "year";
  return null;
}

const DATE_KEYS = new Set(["employment_start", "employment_end", "graduation_year", "education_start", "date_of_birth"]);

/**
 * What a field asks for, using its section too: "To" under Education is the graduation year,
 * "Location" under Work Experience is that job's location, "URL" under Websites is a link.
 */
export function classify(field: FieldDescriptor): Classification {
  const section = (field.section ?? "").toLowerCase();
  // Workday's own field ids are exact; date boxes still go through the label/section rules.
  const wd = datePart(field) ? undefined : workdayKey(field.automationId, section);
  if (wd !== undefined) return wd ? { key: wd, confidence: 0.97, question: false } : { key: null, confidence: 0, question: false };
  const part = datePart(field);
  // Match "From Month" as "From".
  const base = part ? { ...field, label: field.label.replace(/\b(month|year|day|mm|yyyy|dd)\b/gi, " ").trim() } : field;
  const original = classifyLabel(field);
  const stripped = part ? classifyLabel(base) : original;
  // "Graduation Year" is a field on its own; "From Year" is the year box of "From".
  const result = original.key && DATE_KEYS.has(original.key) ? original : stripped.key && DATE_KEYS.has(stripped.key) ? stripped : original;
  const inEducation = /\b(education|academic|school)\b/.test(section);
  const inWork = /\b(work experience|employment|experience)\b/.test(section) && !inEducation;
  const label = norm(base.label);
  if (inEducation) {
    if (result.key === "employment_start" || /^(from|start)( date)?\b/.test(label)) return { key: "education_start", confidence: 0.9, question: false };
    if (result.key === "employment_end" || /^(to|end)( date)?\b/.test(label)) return { key: "graduation_year", confidence: 0.9, question: false };
    if (/\b(overall result|gpa|grade|percentage)\b/.test(label)) return { key: "gpa", confidence: 0.9, question: false };
  }
  if (inWork && (result.key === "location" || result.key === "city" || /^location$/.test(label))) return { key: "job_location", confidence: 0.9, question: false };
  if (inWork && result.key === "currently_employed") return { key: "currently_working", confidence: 0.95, question: false };
  // "Country" inside the phone block is the dialling country (Greenhouse, Lever, iCIMS).
  if (/\bphone\b/.test(section) && /^country( code)?$/.test(label)) return { key: "phone_country", confidence: 0.95, question: false };
  // "What is your location?" answered from a list of countries is the country.
  if ((result.key === "location" || result.key === "city") && field.options.length > 40 && field.options.some((o) => /^(india|united states|united kingdom|germany|canada)\b/i.test(o.label))) {
    return { key: "country", confidence: 0.9, question: false };
  }
  if (/\blanguages?\b/.test(section) && /^language$/.test(label)) return { key: "language_item", confidence: 0.92, question: false };
  // A generic URL box in a "Websites" section; named ones (LinkedIn URL, GitHub URL) keep their key.
  const named = result.key && ["linkedin", "github", "portfolio", "twitter", "behance", "dribbble"].includes(result.key);
  if (!named && /\b(websites?|links?)\b/.test(section) && /\b(url|website|link)\b/.test(label)) return { key: "website_item", confidence: 0.9, question: false };
  if (part && result.key && !DATE_KEYS.has(result.key)) return { key: null, confidence: 0, question: false };
  return result;
}

function classifyLabel(field: FieldDescriptor): Classification {
  const label = norm(field.label);
  const placeholder = norm(field.placeholder);
  const help = norm(field.helpText);
  const attrs = attrWords(`${field.name} ${field.htmlId}`);
  const autocomplete = field.autocomplete.toLowerCase().split(/\s+/);
  const everything = `${label} ${placeholder} ${attrs}`;

  if (field.kind === "checkbox" && CONSENT.test(everything)) return { key: null, confidence: 0, question: false };

  let best: Classification = { key: null, confidence: 0, question: false };
  for (const rule of RULES) {
    if (rule.exclude?.some((p) => p.test(label) || p.test(attrs))) continue;
    if (field.kind === "file" && rule.key !== "resume") continue;
    if (rule.key === "resume" && field.kind !== "file") continue;
    if ((field.kind === "password") !== (rule.key === "account_password")) continue;

    let score = 0;
    if (rule.autocomplete?.some((token) => autocomplete.includes(token))) score = 0.97;
    const onSentence = rule.sentence?.some((p) => p.test(label)) ?? false;
    const onLabel = onSentence || rule.patterns.some((p) => p.test(label));
    const onAttr = rule.attrPatterns?.some((p) => p.test(attrs)) ?? false;
    const onPlaceholder = rule.patterns.some((p) => p.test(placeholder));
    if (onLabel && onAttr) score = Math.max(score, 0.97);
    else if (onLabel) score = Math.max(score, 0.9);
    else if (onAttr && !label) score = Math.max(score, 0.86);
    else if (onAttr) score = Math.max(score, 0.75);
    if (onPlaceholder) score = Math.max(score, onAttr ? 0.9 : 0.8);
    if (!score && rule.patterns.some((p) => p.test(help))) score = 0.6;
    if (!score) continue;

    // A sentence-like label that merely mentions a keyword is weaker evidence.
    if (onLabel && !onSentence && wordCount(label) > 8 && !["select", "radio", "combobox", "checkbox", "checkboxes", "file"].includes(field.kind)) score *= 0.75;
    if (rule.types && !rule.types.includes(KIND_TYPES[field.kind])) score *= 0.8;
    if (score > best.confidence) best = { key: rule.key, confidence: score, question: false };
  }

  if (best.confidence < AUTO_THRESHOLD && isQuestion(field)) {
    return { key: null, confidence: 0, question: true };
  }
  // Short labels for questions people answer in their own words ("Reason for change",
  // "Why should we hire you") go to the answer library too.
  if (best.confidence < REVIEW_THRESHOLD && ["text", "textarea", "contenteditable"].includes(field.kind) && classifyIntent(field.label)) {
    return { key: null, confidence: 0, question: true };
  }
  return { ...best, confidence: Math.round(best.confidence * 100) / 100 };
}

// ------------------------------------------------------------------ values

type ProfileData = ExtensionProfile["profile"];
type Value = string | number | boolean | string[] | null | undefined;

const DIAL_CODES: [string, string][] = [
  ["971", "United Arab Emirates"], ["966", "Saudi Arabia"], ["974", "Qatar"], ["977", "Nepal"], ["880", "Bangladesh"], ["353", "Ireland"],
  ["91", "India"], ["44", "United Kingdom"], ["61", "Australia"], ["65", "Singapore"], ["49", "Germany"], ["33", "France"],
  ["31", "Netherlands"], ["86", "China"], ["81", "Japan"], ["94", "Sri Lanka"], ["92", "Pakistan"], ["60", "Malaysia"],
  ["63", "Philippines"], ["64", "New Zealand"], ["27", "South Africa"], ["1", "United States"],
];

/** "India (+91)" from "+91 98765 43210" (or from the country when the number has no code). */
function phoneCountry(phone: string | null | undefined, country: string | null | undefined): string | null {
  const digits = phone?.trim().startsWith("+") ? phone.replace(/[^\d]/g, "") : null;
  const byCode = digits ? DIAL_CODES.find(([code]) => digits.startsWith(code)) : undefined;
  const entry = byCode ?? DIAL_CODES.find(([, name]) => name.toLowerCase() === country?.toLowerCase());
  return entry ? `${entry[1]} (+${entry[0]})` : null;
}

/** The number without its country code, for forms that ask for the code separately. */
export function nationalNumber(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  const code = DIAL_CODES.find(([c]) => digits.startsWith(c))?.[0];
  return code ? digits.slice(code.length) : trimmed;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (date: string | null | undefined) => {
  const m = date?.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  return m[2] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : m[1]!;
};

function monthsBetween(start: string, end: string): number {
  const [sy, sm = 1] = start.split("-").map(Number);
  const [ey, em = 1] = end.split("-").map(Number);
  return Math.max(0, (ey! - sy!) * 12 + (em - sm!));
}

/** "Jul 2024 – Jul 2026 (2 years)" from an experience entry's dates. */
function duration(start: string | null | undefined, end: string | null | undefined, current: boolean): string | null {
  if (!start) return null;
  const today = new Date();
  const endDate = current || !end ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` : end;
  const months = monthsBetween(start, endDate);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const length = [years ? `${years} year${years === 1 ? "" : "s"}` : "", rest ? `${rest} month${rest === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
  return `${monthYear(start)} – ${current || !end ? "Present" : monthYear(end)}${length ? ` (${length})` : ""}`;
}

function profileValue(key: string, profile: ProfileData, resumeName: string | null, index = 0): Value {
  const p = profile.personal_information;
  const s = profile.professional_summary;
  const extra = profile.additional_info;
  // Latest job first, so the first "Employer" block on a form is the current one.
  const jobs = [...profile.experience].sort((a, b) => Number(b.is_current) - Number(a.is_current));
  const job = jobs[index];
  const current = jobs[0];
  const edu = profile.education[index];
  const place = splitLocation(p.location);
  const nameParts = (p.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  switch (key) {
    case "first_name": return p.first_name ?? nameParts[0];
    case "last_name": return p.last_name ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : null);
    case "full_name": return p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || null);
    case "email": return p.email;
    case "phone": return p.phone;
    case "location": return p.location ?? ([p.city ?? place.city, p.state ?? place.state, p.country ?? place.country].filter(Boolean).join(", ") || null);
    case "city": return p.city ?? place.city;
    case "state": return p.state ?? place.state;
    case "country": return p.country ?? place.country;
    case "postal_code": return p.postal_code ?? place.postalCode;
    case "address": return p.address ?? p.location;
    case "alternate_phone": return p.alternate_phone;
    case "profile_links": return p.portfolio ?? p.linkedin ?? p.github;
    case "preferred_location": return extra.preferred_locations?.length ? extra.preferred_locations : (p.city ?? place.city);
    case "date_of_birth": return extra.date_of_birth;
    case "marital_status": return extra.marital_status;
    case "father_name": return extra.father_name;
    case "job_duration": return duration(job?.start_date, job?.end_date, !!job?.is_current);
    case "employment_start": return job?.start_date;
    case "employment_end": return job ? (job.is_current ? "Present" : job.end_date) : null;
    case "currently_employed":
      return s.employment_status ? s.employment_status === "employed" : current ? !!current.is_current : null;
    case "linkedin": return p.linkedin;
    case "github": return p.github;
    case "portfolio": return p.portfolio;
    case "current_company": return job?.company_name;
    case "current_title": return job?.designation ?? (index === 0 ? s.current_designation : null);
    case "years_experience": return s.total_experience_years;
    case "school": return edu?.institution;
    case "degree": return edu?.degree;
    case "discipline": return edu?.specialization;
    case "graduation_year": return edu?.graduation_year;
    case "education_start": return edu?.start_year;
    case "role_description": return job?.responsibilities?.length ? job.responsibilities.map((r) => `• ${r}`).join("\n") : null;
    case "job_location": return job?.location;
    case "currently_working": return job ? !!job.is_current : null;
    case "language_item": return extra.languages?.[index] ?? null;
    case "website_item":
      return [p.portfolio, p.github, p.twitter, p.behance, p.dribbble].filter((link): link is string => !!link)[index] ?? null;
    case "gpa": return edu?.grade;
    case "skills": return Object.values(profile.skills).flat();
    case "resume": return resumeName;
    case "work_authorization": return extra.work_authorization;
    case "requires_sponsorship": return extra.requires_sponsorship;
    case "notice_period": return extra.notice_period;
    case "expected_salary": return extra.expected_salary;
    case "current_salary": return extra.current_salary;
    case "willing_to_relocate": return extra.willing_to_relocate;
    case "gender": return extra.gender;
    case "pronouns": return extra.pronouns;
    case "nationality": return extra.nationality;
    case "languages": return extra.languages;
    case "account_password": return PASSWORD_MASK;
    case "website": return p.portfolio ?? p.github;
    case "twitter": return p.twitter;
    case "behance": return p.behance;
    case "dribbble": return p.dribbble;
    case "middle_name": return p.middle_name ?? (nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null);
    case "preferred_name": return p.preferred_name ?? p.first_name ?? nameParts[0];
    case "phone_type": return p.phone ? "Mobile" : null;
    case "phone_country": return phoneCountry(p.phone, p.country ?? place.country);
    case "username": return p.email;
    case "hispanic":
      return extra.ethnicity ? /hispanic|latin/i.test(extra.ethnicity) : null;
    case "armed_forces":
      return extra.veteran_status ? !/\bnot\b|^no\b|don't|do not/i.test(extra.veteran_status) : null;
    case "lgbt": return null;
    case "referred_by": return extra.referred_by;
    case "current_date": {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    }
    case "earliest_start_date":
      return extra.earliest_start_date ?? (extra.notice_period ? `After my notice period of ${extra.notice_period}` : null);
    case "work_mode_preference": return extra.work_mode_preference;
    case "referral_source": return extra.referral_source;
    case "ethnicity": return extra.ethnicity;
    case "veteran_status": return extra.veteran_status;
    case "disability_status": return extra.disability_status;
    default: return null;
  }
}

export interface ResolvedValue {
  value: string;
  optionValue: string | null;
}

/** Turns a profile value into what this specific control needs, or null if it can't. */
/** Dates as the control expects them: yyyy-mm-dd for date inputs, "Jul 2024" for text. */
function formatDate(raw: string, field: FieldDescriptor): string {
  const iso = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const [y, m, d] = iso ? [iso[1]!, iso[2]!, iso[3] ?? "01"] : dmy ? [dmy[3]!, dmy[2]!.padStart(2, "0"), dmy[1]!.padStart(2, "0")] : [];
  if (!y) return raw;
  if (field.kind === "date") return `${y}-${m}-${d}`;
  if (/\bmm\s*\/\s*yyyy\b/i.test(`${field.placeholder} ${field.helpText} ${field.label}`)) return `${m}/${y}`;
  if (/\bdd\/mm\/yyyy\b/i.test(`${field.placeholder} ${field.helpText}`) || (iso?.[3] ?? dmy)) return `${d}/${m}/${y}`;
  return monthYear(raw) ?? raw;
}

export function resolveValue(key: string, field: FieldDescriptor, profile: ProfileData, resumeName: string | null, index = 0): ResolvedValue | null {
  let raw = profileValue(key, profile, resumeName, index);
  const part = DATE_KEYS.has(key) ? datePart(field) : null;
  if (part && raw === "Present") return null; // a current job has no end date to type
  if (part && raw !== null && raw !== undefined) {
    // Split date boxes: "07" in Month, "2024" in Year.
    const m = String(raw).match(/^(\d{4})(?:-(\d{2}))?/);
    raw = m ? (part === "year" ? m[1]! : (m[2] ?? null)) : null;
    if (raw === null) return null;
  } else if (typeof raw === "string" && ["date_of_birth", "employment_start", "employment_end", "current_date"].includes(key) && raw !== "Present") {
    raw = formatDate(raw, field);
  }
  // A current job has no end date to type into a date box (the "currently work here" box covers it).
  if (key === "employment_end" && raw === "Present" && (field.kind === "date" || /mm|yyyy/i.test(`${field.placeholder} ${field.label}`))) return null;
  if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
  // Work authorization text answers a Yes/No question only when sponsorship is known to be unnecessary.
  if (key === "work_authorization" && ["radio", "select", "combobox"].includes(field.kind) && typeof raw === "string") {
    if (profile.additional_info.requires_sponsorship === false) raw = true;
    else if (field.options.some((o) => /^(yes|no)\b/i.test(o.label))) return null;
  }

  const choice = ["select", "radio", "combobox"].includes(field.kind) && field.options.length > 0;
  if (choice) {
    const option =
      typeof raw === "boolean" ? matchBoolean(field.options, raw)
      : typeof raw === "number" ? matchNumber(field.options, raw) ?? matchText(field.options, String(raw))
      : matchText(field.options, Array.isArray(raw) ? raw[0]! : String(raw));
    return option ? { value: option.label, optionValue: option.value } : null;
  }
  // "Check all that apply": tick every option the profile has ("English", "Hindi", …).
  if (field.kind === "checkboxes" && field.options.length > 0) {
    const wanted = typeof raw === "boolean" ? [raw] : Array.isArray(raw) ? raw : String(raw).split(/\s*[,;/]\s*/);
    const picked = wanted
      .map((w) => (typeof w === "boolean" ? matchBoolean(field.options, w) : matchText(field.options, String(w))))
      .filter((o): o is NonNullable<typeof o> => !!o);
    const unique = [...new Map(picked.map((o) => [o.value, o])).values()];
    return unique.length ? { value: unique.map((o) => o.label).join(", "), optionValue: unique.map((o) => o.value).join("\n") } : null;
  }
  if (field.kind === "checkbox") {
    return typeof raw === "boolean" ? { value: raw ? "Yes" : "No", optionValue: raw ? "true" : "false" } : null;
  }
  if (typeof raw === "boolean") return { value: raw ? "Yes" : "No", optionValue: null };
  if (typeof raw === "number") return { value: Number.isInteger(raw) ? String(raw) : raw.toFixed(1), optionValue: null };
  if (Array.isArray(raw)) return { value: raw.join(", "), optionValue: null };
  const value = field.maxLength && raw.length > field.maxLength ? raw.slice(0, field.maxLength) : raw;
  return { value, optionValue: null };
}

export function mapField(field: FieldDescriptor, frameId: number, profile: ProfileData | null, resumeName: string | null, index = 0): MappedField {
  const { key, confidence, question } = classify(field);
  let status: FieldStatus = "unmapped";
  let resolved: ResolvedValue | null = null;
  if (question) status = "question";
  else if (key && confidence >= REVIEW_THRESHOLD) {
    resolved = profile ? resolveValue(key, field, profile, resumeName, index) : null;
    if (!resolved) status = "missing";
    else if (confidence >= AUTO_THRESHOLD && !SENSITIVE_KEYS.has(key)) status = "auto";
    else status = "review";
  }
  return {
    ...field,
    frameId,
    key: key && confidence >= REVIEW_THRESHOLD ? key : null,
    confidence,
    status,
    value: resolved?.value ?? null,
    optionValue: resolved?.optionValue ?? null,
  };
}

export function fieldLabel(field: MappedField): string {
  return field.label || field.placeholder || (field.key ? RULES_BY_KEY[field.key]?.label : "") || field.name || "Unlabelled field";
}

/**
 * Maps a whole form. Repeated job or education blocks ("Employer name" twice) take the
 * 1st, 2nd, … entry from the profile in page order.
 */
export function mapFields(fields: FieldDescriptor[], frameId: number, profile: ProfileData | null, resumeName: string | null): MappedField[] {
  // Each group (jobs, schools, list items) counts entry blocks: a field that repeats within
  // the current block starts the next one, so a job without "To" dates doesn't shift the rest.
  const blocks = new Map<string, { index: number; seen: Set<string> }>();
  const groupOf = (key: string) => (EXPERIENCE_KEYS.has(key) ? "experience" : EDUCATION_KEYS.has(key) ? "education" : LIST_KEYS.has(key) ? key : null);
  const mapped = fields.map((field) => {
    const first = mapField(field, frameId, profile, resumeName);
    const key = first.key;
    const group = key ? groupOf(key) : null;
    if (!key || !group) return first;
    const part = datePart(field);
    const slot = part ? `${key}|${part}` : key;
    const block = blocks.get(group) ?? { index: 0, seen: new Set<string>() };
    if (block.seen.has(slot)) {
      block.index += 1;
      block.seen = new Set();
    }
    block.seen.add(slot);
    blocks.set(group, block);
    return block.index === 0 ? first : mapField(field, frameId, profile, resumeName, block.index);
  });
  // When the form asks for the country code separately, the phone box gets the number alone.
  if (mapped.some((f) => f.key === "phone_country")) {
    return mapped.map((f) => (f.key === "phone" && f.value ? { ...f, value: nationalNumber(f.value) } : f));
  }
  return mapped;
}
