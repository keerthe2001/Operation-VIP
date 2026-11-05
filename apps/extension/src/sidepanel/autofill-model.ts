import { fieldKey } from "@/background/autofill";
import type { FormState, MappedField } from "@/shared/fields";

export const keyOf = fieldKey;

export function hasValue(field: MappedField): boolean {
  return field.currentValue.trim() !== "" || field.result === "filled";
}

export interface FormSummary {
  detected: number;
  ready: MappedField[];
  review: MappedField[];
  missing: MappedField[];
  questions: MappedField[];
  unmapped: MappedField[];
  completed: number;
  remaining: number;
  attention: number;
  percentage: number;
}

/** Pure view model for the side panel's autofill and progress sections. */
export function summarize(form: FormState | null): FormSummary {
  const fields = form?.fields ?? [];
  const by = (status: MappedField["status"]) => fields.filter((f) => f.status === status);
  const completed = fields.filter(hasValue).length;
  // Unfilled fields the user has to deal with: checks, missing data, questions, failures.
  const attention = fields.filter(
    (f) => !hasValue(f) && (f.result === "failed" || ["review", "missing", "question"].includes(f.status)),
  ).length;
  return {
    detected: fields.length,
    ready: by("auto"),
    review: by("review"),
    missing: by("missing"),
    questions: by("question"),
    unmapped: by("unmapped"),
    completed,
    remaining: fields.length - completed,
    attention,
    percentage: fields.length ? Math.round((completed / fields.length) * 100) : 0,
  };
}
