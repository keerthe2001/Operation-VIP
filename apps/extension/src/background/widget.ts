import { jobMatch } from "@copilot/shared";

import type { MappedField } from "@/shared/fields";
import type { KeyValueArea, LocalStore, SessionStore } from "@/shared/storage";
import { DEFAULT_WIDGET, appKey, formKey, tabKey } from "@/shared/storage";
import type { ExtensionProfile, WidgetState } from "@/shared/types";

const hasValue = (field: MappedField) => field.currentValue.trim() !== "" || field.result === "filled";

/** Confident fields that are still empty: what one click on "Autofill" fills. */
export function readyKeys(fields: MappedField[]): string[] {
  return fields.filter((f) => f.status === "auto" && !hasValue(f)).map((f) => `${f.frameId}:${f.id}`);
}

function quickProfile(data: ExtensionProfile | null): WidgetState["profile"] {
  if (!data) return [];
  const { profile } = data;
  const p = profile.personal_information;
  const s = profile.professional_summary;
  const current = profile.experience.find((e) => e.is_current) ?? profile.experience[0];
  const edu = profile.education[0];
  const extra = profile.additional_info;
  const skills = Object.values(profile.skills ?? {}).flat();
  const rows: [string, unknown][] = [
    ["Full name", p.full_name],
    ["Email", p.email],
    ["Phone", p.phone],
    ["Location", p.location],
    ["LinkedIn", p.linkedin],
    ["GitHub", p.github],
    ["Portfolio", p.portfolio],
    ["Current title", s.current_designation ?? current?.designation],
    ["Current company", current?.company_name],
    ["Experience", s.total_experience_years != null ? `${s.total_experience_years} years` : null],
    ["Degree", [edu?.degree, edu?.specialization].filter(Boolean).join(", ")],
    ["College", edu?.institution],
    ["Graduation year", edu?.graduation_year],
    ["Skills", skills.slice(0, 12).join(", ")],
    ["Notice period", extra.notice_period],
    ["Expected salary", extra.expected_salary],
    ["Summary", s.summary],
  ];
  return rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => ({ label, value: String(value) }));
}

export async function widgetState(
  tabId: number,
  url: string | undefined,
  local: KeyValueArea<LocalStore>,
  session: KeyValueArea<SessionStore>,
): Promise<WidgetState> {
  const [auth, data, prefs, tab, form, tracked, theme] = await Promise.all([
    local.get("auth"),
    local.get("profile"),
    local.get("widget"),
    session.get(tabKey(tabId)),
    session.get(formKey(tabId)),
    session.get(appKey(tabId)),
    local.get("theme"),
  ]);
  const widget = { ...DEFAULT_WIDGET, ...prefs };
  const host = url ? new URL(url).hostname : "";
  const fields = form?.fields ?? [];
  const job = tab?.job ?? null;
  const match = job?.description ? jobMatch(data?.profile ?? null, job.description) : null;
  const user = auth?.user;
  return {
    signedIn: auth?.status === "signed_in",
    firstName: data?.profile.personal_information.first_name ?? user?.full_name?.split(" ")[0] ?? null,
    job,
    tracked: tracked && job && tracked.url === job.url ? tracked : null,
    form: {
      detected: fields.length,
      ready: readyKeys(fields).length,
      review: fields.filter((f) => f.status === "review" && !hasValue(f)).length,
      missing: fields.filter((f) => f.status === "missing" && !hasValue(f)).length,
      questions: fields.filter((f) => f.status === "question" && !hasValue(f)).length,
      filled: fields.filter(hasValue).length,
      hasCoverLetterField: fields.some((f) => /cover\s*letter/i.test(`${f.label} ${f.name}`)),
      hasResumeField: fields.some((f) => f.kind === "file" && f.key === "resume"),
      needsPassword: fields.some((f) => f.key === "account_password" && f.status === "missing"),
    },
    resumeName: data?.primary_resume?.status === "ready" ? data.primary_resume.file_name : null,
    match: match && {
      score: match.score,
      matched: match.skills.matched,
      missing: match.skills.missing,
      requiredYears: match.experience.required,
      haveYears: match.experience.have,
      experienceOk: match.experience.ok,
      location: match.location.job,
      locationOk: match.location.ok,
    },
    profile: quickProfile(data ?? null),
    prefs: {
      mode: widget.mode,
      autoOpen: widget.autoOpen,
      y: widget.y,
      theme: theme ?? "system",
      hidden: widget.hiddenHosts.includes(host),
    },
  };
}
