import { classifyIntent } from "@copilot/shared";

import { splitLocation } from "@/mapping/location";
import { attrWords, norm } from "@/mapping/normalize";
import { matchBoolean, matchNumber, matchText } from "@/mapping/options";
import { RULES, RULES_BY_KEY } from "@/mapping/taxonomy";
import type { FieldDescriptor, FieldStatus, MappedField } from "@/shared/fields";
import type { ExtensionProfile } from "@/shared/types";

export const AUTO_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.6;

/** Never filled automatically: the user decides what to disclose. */
const SENSITIVE_KEYS = new Set([
  "gender", "pronouns", "nationality", "work_authorization", "requires_sponsorship",
  "ethnicity", "veteran_status", "disability_status",
]);

/** Keys that belong to one job or one degree: repeated blocks map to the 1st, 2nd, … entry. */
export const EXPERIENCE_KEYS = new Set(["current_company", "current_title", "job_duration", "employment_start", "employment_end"]);
export const EDUCATION_KEYS = new Set(["school", "degree", "discipline", "graduation_year", "gpa"]);
// Race, veteran and disability questions map to the user's own answers but always go to
// review; these more personal ones are never touched.
const EEO = /\b(sexual orientation|transgender|lgbtq)\b/;
const CONSENT = /\b(agree|consent|acknowledge|privacy|terms|certify|confirm that)\b/;

const KIND_TYPES: Record<FieldDescriptor["kind"], string> = {
  text: "text", email: "email", tel: "tel", url: "url", number: "number", date: "date", textarea: "text",
  select: "select", radio: "radio", checkbox: "checkbox", file: "file", contenteditable: "text", combobox: "select",
  password: "password",
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

export function classify(field: FieldDescriptor): Classification {
  const label = norm(field.label);
  const placeholder = norm(field.placeholder);
  const help = norm(field.helpText);
  const attrs = attrWords(`${field.name} ${field.htmlId}`);
  const autocomplete = field.autocomplete.toLowerCase().split(/\s+/);
  const everything = `${label} ${placeholder} ${attrs}`;

  if (EEO.test(everything)) return { key: null, confidence: 0, question: false };
  if (field.kind === "checkbox" && CONSENT.test(everything)) return { key: null, confidence: 0, question: false };

  let best: Classification = { key: null, confidence: 0, question: false };
  for (const rule of RULES) {
    if (rule.exclude?.some((p) => p.test(label) || p.test(attrs))) continue;
    if (field.kind === "file" && rule.key !== "resume") continue;
    if (rule.key === "resume" && field.kind !== "file") continue;
    if ((field.kind === "password") !== (rule.key === "account_password")) continue;

    let score = 0;
    if (rule.autocomplete?.some((token) => autocomplete.includes(token))) score = 0.97;
    const onLabel = rule.patterns.some((p) => p.test(label));
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
    if (onLabel && wordCount(label) > 8 && !["select", "radio", "combobox", "checkbox"].includes(field.kind)) score *= 0.75;
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
    case "current_title": return index === 0 ? (s.current_designation ?? job?.designation) : job?.designation;
    case "years_experience": return s.total_experience_years;
    case "school": return edu?.institution;
    case "degree": return edu?.degree;
    case "discipline": return edu?.specialization;
    case "graduation_year": return edu?.graduation_year;
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
  if (/\bmm\/yyyy\b/i.test(`${field.placeholder} ${field.helpText}`)) return `${m}/${y}`;
  if (/\bdd\/mm\/yyyy\b/i.test(`${field.placeholder} ${field.helpText}`) || (iso?.[3] ?? dmy)) return `${d}/${m}/${y}`;
  return monthYear(raw) ?? raw;
}

export function resolveValue(key: string, field: FieldDescriptor, profile: ProfileData, resumeName: string | null, index = 0): ResolvedValue | null {
  let raw = profileValue(key, profile, resumeName, index);
  if (typeof raw === "string" && ["date_of_birth", "employment_start", "employment_end"].includes(key) && raw !== "Present") {
    raw = formatDate(raw, field);
  }
  if (key === "employment_end" && raw === "Present" && field.kind === "date") return null;
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
  const seen = new Map<string, number>();
  return fields.map((field) => {
    const first = mapField(field, frameId, profile, resumeName);
    if (!first.key || !(EXPERIENCE_KEYS.has(first.key) || EDUCATION_KEYS.has(first.key))) return first;
    const index = seen.get(first.key) ?? 0;
    seen.set(first.key, index + 1);
    return index === 0 ? first : mapField(field, frameId, profile, resumeName, index);
  });
}
