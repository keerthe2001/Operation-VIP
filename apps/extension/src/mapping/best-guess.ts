/**
 * Answers for questions the profile doesn't cover, chosen by rules (no AI):
 * - required consent / acknowledgement boxes are ticked,
 * - self-identification questions without a profile answer use the form's own
 *   "prefer not to say" option,
 * - marketing opt-ins are answered "No",
 * - "Have you worked for <company> before?" is answered from the work history.
 * Nothing here invents facts about the person.
 */
import type { MappedField } from "@/shared/fields";

const CONSENT = /\b(i agree|agree to|consent|acknowledge|i accept|accept the|certify|i confirm|confirm that|i understand|privacy (policy|notice|statement)|terms (and|&) conditions)\b/i;
const MARKETING = /\b(newsletter|marketing|promotional|job alerts?|sms|text messages?|keep me (updated|informed)|talent (community|network)|future (opportunities|openings))\b/i;
const DECLINE = /\b(decline|prefer not|don'?t wish|do not wish|not wish to|choose not|rather not|not to (say|disclose|answer|self.?identify)|not disclose|i don'?t want)\b/i;
const EEO_KEYS = new Set(["gender", "ethnicity", "hispanic", "veteran_status", "armed_forces", "disability_status", "lgbt", "pronouns"]);
const WORKED_HERE =
  /\b(previously|ever|formerly|currently or previously|before|prior)\b.*\b(work(ed)?|employed|consulted|been an? (employee|contractor|intern))\b|\b(former|previous|prior) (employee|contractor|employment)\b|\bworked (at|for) .* before\b/i;

const isChoice = (f: MappedField) => ["radio", "select", "combobox", "listbox", "checkboxes"].includes(f.kind);
const label = (f: MappedField) => `${f.label} ${f.helpText} ${f.section ?? ""}`;
/** Dropdowns whose options load only when opened (react-select, Workday): answer by text. */
const opensLater = (f: MappedField) => (f.kind === "listbox" || f.kind === "combobox") && f.options.length === 0;

function pick(f: MappedField, test: (text: string) => boolean): { value: string; optionValue: string | null } | null {
  if (opensLater(f)) return null;
  const option = f.options.find((o) => test(o.label));
  return option ? { value: option.label, optionValue: option.value } : null;
}

const yes = (f: MappedField) => pick(f, (t) => /^\s*yes\b/i.test(t)) ?? (opensLater(f) ? { value: "Yes", optionValue: null } : null);
const no = (f: MappedField) => pick(f, (t) => /^\s*no\b/i.test(t)) ?? (opensLater(f) ? { value: "No", optionValue: null } : null);

export interface GuessContext {
  /** Company of the job being applied to. */
  company: string | null;
  /** Companies in the user's work history. */
  employers: string[];
}

export function bestGuess(fields: MappedField[], context: GuessContext): MappedField[] {
  return fields.map((f) => {
    if (f.status === "auto" || f.status === "review" || f.result === "filled") return f;
    const text = label(f);
    let answer: { value: string; optionValue: string | null } | null = null;

    if (f.kind === "checkbox") {
      // Required consent boxes, and the bare "I agree" box of an account form (Workday marks it
      // required only when you press Create Account).
      const bareAgree = /^\s*(i agree|i accept|agree|accept)\s*[.*]?\s*$/i.test(f.label) || /createAccountCheckbox/.test(f.automationId ?? "");
      if (CONSENT.test(text) && !MARKETING.test(text) && (f.required || /\*\s*$/.test(f.label) || bareAgree)) answer = { value: "Yes", optionValue: "true" };
    } else if (isChoice(f)) {
      if (f.key && EEO_KEYS.has(f.key)) {
        answer = pick(f, (t) => DECLINE.test(t)) ?? (opensLater(f) ? { value: "Decline to self identify", optionValue: null } : null);
      } else if (MARKETING.test(text)) {
        answer = no(f);
      } else if (WORKED_HERE.test(text) && context.company && text.toLowerCase().includes(context.company.toLowerCase().split(/\s+/)[0]!)) {
        const company = context.company.toLowerCase();
        const worked = context.employers.some((e) => e.toLowerCase().includes(company) || company.includes(e.toLowerCase()));
        answer = worked ? yes(f) : no(f);
      }
    }
    if (!answer) return f;
    return { ...f, status: "auto", value: answer.value, optionValue: answer.optionValue, key: f.key ?? "best_guess" };
  });
}
