import { z } from "zod";

export const FIELD_KINDS = [
  "text", "email", "tel", "url", "number", "date", "textarea", "select", "radio",
  "checkbox", "file", "contenteditable", "combobox", "password",
  // A button that opens a list of options (Workday and other custom dropdowns).
  "listbox",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const fieldOptionSchema = z.object({ value: z.string().max(300), label: z.string().max(300) });

/** What the content script reports for each form control (no profile data involved). */
export const fieldDescriptorSchema = z.object({
  id: z.string().max(40),
  kind: z.enum(FIELD_KINDS),
  label: z.string().max(500),
  name: z.string().max(200),
  htmlId: z.string().max(200),
  placeholder: z.string().max(300),
  autocomplete: z.string().max(100),
  helpText: z.string().max(500),
  required: z.boolean(),
  options: z.array(fieldOptionSchema).max(400),
  currentValue: z.string().max(5000),
  accept: z.string().max(200),
  maxLength: z.number().int().nullable(),
  /** Heading of the form section the field is in ("Work Experience", "Education"…). */
  section: z.string().max(200).optional(),
});
export type FieldDescriptor = z.infer<typeof fieldDescriptorSchema>;

export type FieldStatus =
  | "auto" // high confidence, filled by "Autofill all"
  | "review" // medium confidence, user should check
  | "missing" // recognized, but the profile has no value
  | "question" // free-text application question (answer library, Phase 4)
  | "unmapped"; // not recognized

export interface MappedField extends FieldDescriptor {
  frameId: number;
  key: string | null;
  confidence: number;
  status: FieldStatus;
  /** Human-readable value we would put in. */
  value: string | null;
  /** For selects/radios: the option value to choose. */
  optionValue: string | null;
  result?: FillResultStatus;
  resultMessage?: string;
}

export type FillResultStatus = "filled" | "skipped" | "failed";

export interface FillInstruction {
  id: string;
  kind: FieldKind;
  value: string | null;
  optionValue: string | null;
  checked?: boolean;
  file?: { name: string; type: string; base64: string };
  overwrite: boolean;
  /** A search box that takes one value at a time (Workday "Type to Add Skills"). */
  multi?: boolean;
}

export const fillResultSchema = z.object({
  id: z.string().max(40),
  status: z.enum(["filled", "skipped", "failed"]),
  message: z.string().max(300).optional(),
});
export type FillResult = z.infer<typeof fillResultSchema>;

export interface FormState {
  url: string;
  fields: MappedField[];
  updatedAt: number;
  lastFill?: { at: number; filled: number; skipped: number; failed: number };
  /** Fields being filled right now, in order (cleared when done). */
  filling?: string[];
  /** Text of the page's main button (Continue, Create Account…), if one was found. */
  action?: string | null;
  actionKind?: ActionKind | null;
  /** The site says an account already exists for this email. */
  accountExists?: boolean;
  /** Everything is filled and the next button submits the application: waiting for the user's OK. */
  awaitingSubmit?: boolean;
}

/** What the page's main button does. */
export type ActionKind = "continue" | "account" | "submit";
