import type { components } from "@copilot/api-types";

import type { Profile, ProfileWrite } from "@/lib/profile/profile-service";

type Schemas = components["schemas"];
export type FieldMeta = Schemas["FieldMeta"];
export type ExperienceItem = Schemas["ExperienceItem"];
export type EducationItem = Schemas["EducationItem"];
export type ProjectItem = Schemas["ProjectItem"];
export type CertificationItem = Schemas["CertificationItem"];
export type ListSection = "experience" | "education" | "projects" | "certifications";

export const SKILL_CATEGORIES = [
  ["programming_languages", "Programming languages"],
  ["frameworks", "Frameworks & libraries"],
  ["databases", "Databases"],
  ["cloud", "Cloud & DevOps"],
  ["ai_ml", "AI / ML"],
  ["tools", "Tools & practices"],
  ["soft_skills", "Soft skills"],
  ["other", "Other"],
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number][0];

/** Converts the API's read model into the editable write model. */
export function toFormValues(profile: Profile): ProfileWrite {
  return {
    personal_information: profile.personal_information,
    professional_summary: profile.professional_summary,
    experience: profile.experience,
    education: profile.education,
    skills: profile.skills,
    projects: profile.projects,
    certifications: profile.certifications,
    additional_info: profile.additional_info,
    field_meta: profile.field_meta,
  };
}

export function emptyItem<S extends ListSection>(section: S): ProfileWrite[S][number] {
  const base = { confidence: null, is_confirmed: true };
  const items = {
    experience: {
      ...base, company_name: null, designation: null, employment_type: null, location: null,
      start_date: null, end_date: null, is_current: false, responsibilities: [""], achievements: [],
      technologies: [],
    },
    education: {
      ...base, degree: null, institution: null, specialization: null, start_year: null,
      graduation_year: null, grade: null,
    },
    projects: { ...base, project_name: null, role: null, url: null, points: [""] },
    certifications: {
      ...base, certification_name: null, issuing_organization: null, issue_date: null, credential_url: null,
    },
  } satisfies { [K in ListSection]: ProfileWrite[K] extends (infer I)[] | undefined ? I : never };
  return items[section] as ProfileWrite[S][number];
}

/** A field "needs review" when it was extracted automatically and nobody confirmed it. */
export function needsReview(meta: Record<string, FieldMeta> | undefined, path: string): boolean {
  const entry = meta?.[path];
  return !!entry && !entry.is_confirmed;
}

type Dirty = boolean | Dirty[] | { [key: string]: Dirty } | undefined;

function anyDirty(value: Dirty): boolean {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(anyDirty);
  if (value && typeof value === "object") return Object.values(value).some(anyDirty);
  return false;
}

const LIST_SECTIONS: ListSection[] = ["experience", "education", "projects", "certifications"];

/**
 * Anything the user edited counts as confirmed: dirty scalar fields get a confirmed
 * meta entry and dirty list items get `is_confirmed: true`.
 */
export function applyEdits(values: ProfileWrite, dirty: Record<string, Dirty>): ProfileWrite {
  const meta: Record<string, FieldMeta> = { ...(values.field_meta ?? {}) };
  const confirm = (path: string) => {
    meta[path] = { confidence: meta[path]?.confidence ?? 1, source: meta[path]?.source ?? null, is_confirmed: true };
  };

  for (const section of ["personal_information", "professional_summary"] as const) {
    const fields = dirty[section];
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      for (const [key, value] of Object.entries(fields)) if (anyDirty(value)) confirm(`${section}.${key}`);
    }
  }
  if (anyDirty(dirty.skills)) confirm("skills");

  const next: ProfileWrite = { ...values, field_meta: meta };
  for (const section of LIST_SECTIONS) {
    const dirtyItems = dirty[section];
    const items = values[section] ?? [];
    (next as Record<ListSection, unknown[]>)[section] = items.map((item, index) =>
      Array.isArray(dirtyItems) && anyDirty(dirtyItems[index]) ? { ...item, is_confirmed: true } : item,
    );
  }
  return next;
}

export function confirmAll(values: ProfileWrite): ProfileWrite {
  const meta = Object.fromEntries(
    Object.entries(values.field_meta ?? {}).map(([path, entry]) => [path, { ...entry, is_confirmed: true }]),
  );
  const next: ProfileWrite = { ...values, field_meta: meta };
  for (const section of LIST_SECTIONS) {
    (next as Record<ListSection, unknown[]>)[section] = (values[section] ?? []).map((item) => ({
      ...item,
      is_confirmed: true,
    }));
  }
  return next;
}

export function countUnconfirmed(values: ProfileWrite): number {
  const meta = Object.values(values.field_meta ?? {}).filter((m) => !m.is_confirmed).length;
  const items = LIST_SECTIONS.reduce(
    (total, section) => total + (values[section] ?? []).filter((item) => !item.is_confirmed).length,
    0,
  );
  return meta + items;
}

/** Normalizes form strings: blank → null, so the API never stores empty strings. */
export function cleanForSave(values: ProfileWrite): ProfileWrite {
  const blankToNull = (value: unknown): unknown => {
    if (typeof value === "string") return value.trim() === "" ? null : value.trim();
    if (Array.isArray(value)) {
      return value.map(blankToNull).filter((v) => v !== null && v !== "");
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blankToNull(v)]));
    }
    return value;
  };
  const cleaned = blankToNull(values) as ProfileWrite;
  // Number inputs come back as NaN when cleared.
  for (const item of cleaned.education ?? []) {
    for (const key of ["start_year", "graduation_year"] as const) {
      if (typeof item[key] !== "number" || Number.isNaN(item[key])) item[key] = null;
    }
  }
  const years = cleaned.professional_summary?.total_experience_years;
  if (cleaned.professional_summary && (typeof years !== "number" || Number.isNaN(years))) {
    cleaned.professional_summary.total_experience_years = null;
  }
  return cleaned;
}
