import { labelFor } from "@/content/dom/labels";
import { isVisible, text } from "@/content/dom/visibility";
import type { FieldDescriptor, FieldKind } from "@/shared/fields";

export const FIELD_ATTR = "data-copilot-field";
const SKIPPED_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "search", "password"]);
const MAX_FIELDS = 300;

let counter = 0;

/** Elements in the document and in every open shadow root. */
export function deepQueryAll(root: Document | ShadowRoot | Element, selector: string): Element[] {
  const found = [...root.querySelectorAll(selector)];
  for (const host of root.querySelectorAll("*")) {
    if (host.shadowRoot) found.push(...deepQueryAll(host.shadowRoot, selector));
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
  return isVisible(el);
}

function kindOf(el: Element): FieldKind {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  if (el instanceof HTMLInputElement) {
    const role = el.getAttribute("role");
    if (role === "combobox" || el.getAttribute("aria-autocomplete") === "list") return "combobox";
    switch (el.type) {
      case "email": case "tel": case "url": case "number": case "date": case "radio": case "checkbox": case "file":
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
  const controls = deepQueryAll(root, "input, textarea, select, [contenteditable='true'], [contenteditable='']").filter(isFillable);
  const descriptors: FieldDescriptor[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();

  for (const el of controls) {
    if (el instanceof HTMLInputElement && el.type === "radio") {
      const key = `${el.form?.id ?? ""}|${el.name || fieldId(el)}`;
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
    else currentValue = input.value ?? "";

    const label = labelFor(el);
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
    });
  }

  for (const radios of radioGroups.values()) {
    const first = radios[0]!;
    const label = groupLabel(first);
    const checked = radios.find((r) => r.checked);
    descriptors.push({
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
    });
  }
  return descriptors.slice(0, MAX_FIELDS);
}
