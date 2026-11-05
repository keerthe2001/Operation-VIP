import { attrWords, norm } from "@/mapping/normalize";
import { matchBoolean, matchNumber, matchText } from "@/mapping/options";
import { RULES, RULES_BY_KEY } from "@/mapping/taxonomy";
import type { FieldDescriptor, FieldStatus, MappedField } from "@/shared/fields";
import type { ExtensionProfile } from "@/shared/types";

export const AUTO_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.6;

/** Never filled automatically: the user decides what to disclose. */
const SENSITIVE_KEYS = new Set(["gender", "pronouns", "nationality", "work_authorization", "requires_sponsorship", "expected_salary", "current_salary"]);
const EEO = /\b(race|ethnic|hispanic|latino|veteran|disabilit|sexual orientation|transgender)\b/;
const CONSENT = /\b(agree|consent|acknowledge|privacy|terms|certify|confirm that)\b/;

const KIND_TYPES: Record<FieldDescriptor["kind"], string> = {
  text: "text", email: "email", tel: "tel", url: "url", number: "number", date: "date", textarea: "text",
  select: "select", radio: "radio", checkbox: "checkbox", file: "file", contenteditable: "text", combobox: "select",
};

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
  return { ...best, confidence: Math.round(best.confidence * 100) / 100 };
}

// ------------------------------------------------------------------ values

type ProfileData = ExtensionProfile["profile"];
type Value = string | number | boolean | string[] | null | undefined;

function profileValue(key: string, profile: ProfileData, resumeName: string | null): Value {
  const p = profile.personal_information;
  const s = profile.professional_summary;
  const extra = profile.additional_info;
  const current = profile.experience.find((e) => e.is_current) ?? profile.experience[0];
  const edu = profile.education[0];
  const nameParts = (p.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  switch (key) {
    case "first_name": return p.first_name ?? nameParts[0];
    case "last_name": return p.last_name ?? (nameParts.length > 1 ? nameParts.slice(1).join(" ") : null);
    case "full_name": return p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || null);
    case "email": return p.email;
    case "phone": return p.phone;
    case "location": return p.location;
    case "linkedin": return p.linkedin;
    case "github": return p.github;
    case "portfolio": return p.portfolio;
    case "current_company": return current?.company_name;
    case "current_title": return s.current_designation ?? current?.designation;
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
    default: return null;
  }
}

export interface ResolvedValue {
  value: string;
  optionValue: string | null;
}

/** Turns a profile value into what this specific control needs, or null if it can't. */
export function resolveValue(key: string, field: FieldDescriptor, profile: ProfileData, resumeName: string | null): ResolvedValue | null {
  let raw = profileValue(key, profile, resumeName);
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

export function mapField(field: FieldDescriptor, frameId: number, profile: ProfileData | null, resumeName: string | null): MappedField {
  const { key, confidence, question } = classify(field);
  let status: FieldStatus = "unmapped";
  let resolved: ResolvedValue | null = null;
  if (question) status = "question";
  else if (key && confidence >= REVIEW_THRESHOLD) {
    resolved = profile ? resolveValue(key, field, profile, resumeName) : null;
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
