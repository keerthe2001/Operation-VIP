import { labelFor, nearbyText } from "@/content/dom/labels";
import { isVisible, text } from "@/content/dom/visibility";
import type { FieldDescriptor, FieldKind } from "@/shared/fields";

export const FIELD_ATTR = "data-copilot-field";
const SKIPPED_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "search"]);
const MAX_FIELDS = 300;

let counter = 0;

/** Elements in the document and in every open shadow root. */
export function deepQueryAll(root: Document | ShadowRoot | Element, selector: string): Element[] {
  const found = [...root.querySelectorAll(selector)];
  for (const host of root.querySelectorAll("*")) {
    // Never our own in-page drawer.
    if (host.shadowRoot && host.tagName !== "COPILOT-ASSISTANT") found.push(...deepQueryAll(host.shadowRoot, selector));
  }
  return found;
}

export function findField(id: string): HTMLElement | null {
  return (deepQueryAll(document, `[${FIELD_ATTR}="${CSS.escape(id)}"]`)[0] as HTMLElement | undefined) ?? null;
}

function fieldId(el: Element): string {
  let id = el.getAttribute(FIELD_ATTR);
  if (!id) {
    counter += 1;
    id = `f${counter}`;
    el.setAttribute(FIELD_ATTR, id);
  }
  return id;
}

function isFillable(el: Element): boolean {
  if (el instanceof HTMLInputElement && (SKIPPED_TYPES.has(el.type) || el.readOnly)) return false;
  if ((el as HTMLInputElement).disabled) return false;
  if (el.closest("[aria-hidden='true'], [hidden]")) return false;
  const descriptor = `${el.getAttribute("name") ?? ""} ${el.id}`.toLowerCase();
  if (/honeypot|captcha|recaptcha|\bbot\b/.test(descriptor)) return false;
  // Custom "Browse files" buttons usually hide the real file input; it still accepts files.
  if (el instanceof HTMLInputElement && el.type === "file") return true;
  return isVisible(el);
}

function kindOf(el: Element): FieldKind {
  // Custom dropdowns: a button (or div) that opens a list of options.
  if (!(el instanceof HTMLInputElement) && (el.getAttribute("aria-haspopup") === "listbox" || el.getAttribute("role") === "combobox")) {
    return "listbox";
  }
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLInputElement) {
    const role = el.getAttribute("role");
    // Searchable dropdowns (Workday's "selectinput" prompts among them).
    if (role === "combobox" || el.getAttribute("aria-autocomplete") === "list" || el.getAttribute("data-uxi-widget-type") === "selectinput") {
      return "combobox";
    }
    switch (el.type) {
      case "email": case "tel": case "url": case "number": case "date": case "radio": case "checkbox": case "file": case "password":
        return el.type;
      default:
        return "text";
    }
  }
  return "contenteditable";
}

function describedText(el: Element): string {
  const ids = el.getAttribute("aria-describedby");
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => text(el.ownerDocument.getElementById(id)))
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

/** Question text for a radio group: fieldset legend, radiogroup label, or the text before the options. */
function groupLabel(first: HTMLInputElement): string {
  const legend = first.closest("fieldset")?.querySelector("legend");
  if (legend && text(legend)) return text(legend);
  const group = first.closest("[role='radiogroup']");
  if (group) {
    const label = labelFor(group);
    if (label) return label;
  }
  let container: Element | null = first.parentElement;
  for (let depth = 0; container && depth < 4; depth += 1, container = container.parentElement) {
    const candidate = container.querySelector(":scope > label, :scope > .label, :scope > [class*='label'], :scope > p, :scope > span");
    if (candidate && !candidate.querySelector("input") && text(candidate)) return text(candidate);
  }
  return first.name;
}

function selectedLabel(el: HTMLSelectElement): string {
  const option = el.selectedOptions[0];
  return option && option.value !== "" ? text(option) || option.value : "";
}

export function scanFields(root: Document = document): FieldDescriptor[] {
  const controls = deepQueryAll(
    root,
    "input, textarea, select, [contenteditable='true'], [contenteditable=''], button[aria-haspopup='listbox'], [role='combobox']:not(input)",
  ).filter(isFillable);
  const descriptors: FieldDescriptor[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();
  // Where each radio group sits among the other fields, so the list follows the page.
  const radioSlots = new Map<string, number>();

  for (const el of controls) {
    if (el instanceof HTMLInputElement && el.type === "radio") {
      const key = `${el.form?.id ?? ""}|${el.name || fieldId(el)}`;
      if (!radioGroups.has(key)) radioSlots.set(key, descriptors.length + radioSlots.size);
      radioGroups.set(key, [...(radioGroups.get(key) ?? []), el]);
      continue;
    }
    const kind = kindOf(el);
    const input = el as HTMLInputElement;
    let currentValue: string;
    if (el instanceof HTMLSelectElement) currentValue = selectedLabel(el);
    else if (kind === "checkbox") currentValue = input.checked ? "checked" : "";
    else if (kind === "file") currentValue = input.files?.length ? input.files[0]!.name : "";
    else if (kind === "contenteditable") currentValue = text(el);
    // A dropdown button shows its choice, or a prompt like "Select One" when empty.
    else if (kind === "listbox") currentValue = /^(select|choose|please select|--|none selected)/i.test(text(el)) ? "" : text(el);
    // Never report what's typed in a password box, only whether it's filled.
    else if (kind === "password") currentValue = input.value ? "••••••••" : "";
    else currentValue = input.value ?? "";

    let label = labelFor(el);
    const section = sectionOf(el);
    if (kind === "file" && (!label || label === el.getAttribute("name"))) label = nearbyText(el) || label;
    // An upload box that only says "Drop files here" is named by its section ("Resume/CV").
    if (kind === "file" && !/resume|cv|cover|portfolio|transcript/i.test(label) && section) label = `${section} ${label}`.trim();
    // Split dates (Workday): "Month"/"Year" boxes take the name of their group ("From").
    if (/^(month|year|day|mm|yyyy|dd)$/i.test(label.trim())) {
      const group = groupLabelFor(el);
      if (group) label = `${group} ${label}`;
    }
    descriptors.push({
      id: fieldId(el),
      kind,
      label: label.slice(0, 500),
      name: (el.getAttribute("name") ?? "").slice(0, 200),
      htmlId: el.id.slice(0, 200),
      placeholder: (el.getAttribute("placeholder") ?? "").slice(0, 300),
      autocomplete: (el.getAttribute("autocomplete") ?? "").slice(0, 100),
      helpText: describedText(el),
      required: input.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label),
      options:
        el instanceof HTMLSelectElement
          ? [...el.options].slice(0, 400).map((o) => ({ value: o.value.slice(0, 300), label: (text(o) || o.value).slice(0, 300) }))
          : [],
      currentValue: currentValue.slice(0, 5000),
      accept: (el.getAttribute("accept") ?? "").slice(0, 200),
      maxLength: input.maxLength > 0 ? input.maxLength : null,
      section: section.slice(0, 200),
    });
  }

  for (const [key, radios] of radioGroups) {
    const first = radios[0]!;
    const label = groupLabel(first);
    const checked = radios.find((r) => r.checked);
    descriptors.splice(radioSlots.get(key) ?? descriptors.length, 0, {
      id: fieldId(first),
      kind: "radio",
      label: label.slice(0, 500),
      name: first.name.slice(0, 200),
      htmlId: first.id.slice(0, 200),
      placeholder: "",
      autocomplete: "",
      helpText: describedText(first),
      required: radios.some((r) => r.required) || /\*\s*$/.test(label),
      options: radios.map((r) => ({ value: (r.value || fieldId(r)).slice(0, 300), label: (labelFor(r) || r.value).slice(0, 300) })),
      currentValue: checked ? labelFor(checked) || checked.value : "",
      accept: "",
      maxLength: null,
      section: sectionOf(first),
    });
  }
  return descriptors.slice(0, MAX_FIELDS);
}

const ACTION_TEXT =
  /^(save and continue|save & continue|continue|next|next step|create account|sign up|register|sign in|log ?in|verify|review|submit( application| my application)?|apply( now)?|send application|finish)$/i;
export const CONTINUE_TEXT = /^(save and continue|save & continue|continue|next|next step|review)$/i;
const ACCOUNT_TEXT = /^(create account|sign up|register|sign in|log ?in|verify)$/i;
const SIGN_IN_LINK = /^(sign in|log ?in|already have an account\?? ?sign in)$/i;

export type ActionKind = "continue" | "account" | "submit";
export function actionKind(text: string): ActionKind {
  if (CONTINUE_TEXT.test(text)) return "continue";
  if (ACCOUNT_TEXT.test(text)) return "account";
  return "submit";
}

const ACCOUNT_EXISTS =
  /\b(already (exists|registered|in use|been registered|have an account with)|account (with this|for this) (email|e-mail)|email (address )?is already|an account already)\b/i;
export const accountExists = (doc: Document = document) => ACCOUNT_EXISTS.test((doc.body?.innerText ?? "").slice(0, 30_000));

/** The site's link or button to switch from Create Account to Sign In. */
export function findSignIn(root: Document = document): HTMLElement | null {
  const candidates = deepQueryAll(root, "a, button, [role='button'], [role='link']").filter(
    (el): el is HTMLElement => el instanceof HTMLElement && isVisible(el) && SIGN_IN_LINK.test(actionText(el)),
  );
  return candidates[0] ?? null;
}

/** The page's main button for this step (Continue, Create Account…), if there is one. */
export function findAction(root: Document = document): HTMLElement | null {
  const candidates = deepQueryAll(root, "button, input[type=submit], [role='button'], a[data-automation-id]")
    .filter((el): el is HTMLElement => el instanceof HTMLElement && isVisible(el) && !el.closest("copilot-assistant"))
    .filter((el) => !(el as HTMLButtonElement).disabled && ACTION_TEXT.test(actionText(el)));
  // A link inside a sentence ("Already have an account? Sign in") isn't the step's main button.
  const score = (el: HTMLElement, index: number) => {
    const parentText = (el.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim();
    const inSentence = parentText.length > actionText(el).length + 12;
    return (el.matches("button[type=submit], input[type=submit]") ? 4 : 0) + (el.closest("form") ? 2 : 0) - (inSentence ? 5 : 0) + index / 1000;
  };
  return candidates.map((el, i) => ({ el, s: score(el, i) })).sort((a, b) => b.s - a.s)[0]?.el ?? null;
}

export function actionText(el: HTMLElement): string {
  return ((el instanceof HTMLInputElement ? el.value : el.textContent) ?? "").replace(/\s+/g, " ").trim();
}

const HEADINGS = "h1, h2, h3, h4, h5, legend, [role='heading']";

/** The heading of the form section an element is in: the last heading before it in the
 * nearest ancestor that has one. */
export function sectionOf(el: Element): string {
  let node = el.parentElement;
  for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
    const before = [...node.querySelectorAll(HEADINGS)].filter(
      (h) => !h.contains(el) && h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const heading = before.at(-1);
    if (heading && text(heading)) return text(heading).slice(0, 200);
  }
  return "";
}

/** Label of the group a date part belongs to: an ARIA group, fieldset or the closest label above. */
function groupLabelFor(el: Element): string {
  const group = el.closest("[role='group'], fieldset");
  if (group) {
    const label = group instanceof HTMLFieldSetElement ? text(group.querySelector("legend")) : labelFor(group);
    if (label) return label.replace(/\*\s*$/, "").trim();
  }
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const label = node.querySelector("label");
    if (label && !label.contains(el) && text(label) && !/^(month|year|day)$/i.test(text(label))) return text(label).replace(/\*\s*$/, "").trim();
  }
  return "";
}
