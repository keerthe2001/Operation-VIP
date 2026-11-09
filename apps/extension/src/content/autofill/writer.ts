/**
 * Writes values into form controls the way a user would, so that frameworks
 * (React, Vue, Angular) observe the change and update their own state.
 */
import { isVisible } from "@/content/dom/visibility";
import { deepQueryAll, findField } from "@/content/forms/scanner";
import type { FillInstruction, FillResult } from "@/shared/fields";

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  // React tracks the last value it set; calling the prototype setter bypasses the
  // instance-level override so the following "input" event is seen as a change.
  const prototype = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function dispatch(el: Element, ...types: string[]) {
  for (const type of types) {
    el.dispatchEvent(type === "input" ? new InputEvent("input", { bubbles: true, composed: true }) : new Event(type, { bubbles: true, composed: true }));
  }
}

function hasValue(el: HTMLElement, instruction: FillInstruction): boolean {
  if (instruction.kind === "radio" && !(el instanceof HTMLInputElement)) {
    return [...(el.parentElement?.children ?? [])].some((b) => b.getAttribute("aria-pressed") === "true");
  }
  if (instruction.kind === "radio") return radioGroup(el as HTMLInputElement).some((r) => r.checked);
  if (instruction.kind === "checkbox") return false;
  if (instruction.kind === "checkboxes") return groupBoxes(el as HTMLInputElement).some((b) => b.checked);
  if (instruction.kind === "combobox" && instruction.multi) return false;
  if (instruction.kind === "listbox") {
    const shown = (el.textContent ?? "").trim();
    return shown !== "" && !/^(select|choose|please select|--|none selected)/i.test(shown);
  }
  if (el instanceof HTMLSelectElement) return el.selectedIndex > 0 && el.value !== "";
  if (el instanceof HTMLInputElement && el.type === "file") return (el.files?.length ?? 0) > 0;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim() !== "";
  return (el.textContent ?? "").trim() !== "";
}

function highlight(el: HTMLElement) {
  const previous = el.style.boxShadow;
  el.style.transition = "box-shadow 0.3s";
  el.style.boxShadow = "0 0 0 2px rgba(79, 70, 229, 0.55)";
  setTimeout(() => {
    el.style.boxShadow = previous;
  }, 1600);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function needsTyping(el: HTMLElement): boolean {
  const id = el.getAttribute("data-automation-id") ?? "";
  return el.getAttribute("role") === "spinbutton" || /dateSection/i.test(id);
}

/** Types a value the way a keyboard would: key events plus the value growing one character at a time. */
async function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string, options: { keepFocus?: boolean } = {}) {
  input.focus();
  try {
    input.select?.();
  } catch {
    // Some input types (email, number) can't be selected.
  }
  setNativeValue(input, "");
  dispatch(input, "input");
  let typed = "";
  for (const char of value) {
    const init = { key: char, code: /\d/.test(char) ? `Digit${char}` : undefined, bubbles: true, cancelable: true, composed: true };
    input.dispatchEvent(new KeyboardEvent("keydown", init));
    input.dispatchEvent(new KeyboardEvent("keypress", init));
    typed += char;
    // The browser's own text insertion fires a genuine input event, which React widgets
    // (react-select and others) act on; fall back to setting the value directly.
    const inserted = input.ownerDocument.activeElement === input && input.ownerDocument.execCommand?.("insertText", false, char);
    if (!inserted) {
      setNativeValue(input, typed);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: char, inputType: "insertText" }));
    }
    input.dispatchEvent(new KeyboardEvent("keyup", init));
    await wait(15);
  }
  dispatch(input, "change");
  if (!options.keepFocus) input.blur();
}

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

/** The option that best matches a value: exact, then prefix, then containment, then shared words. */
const DECLINE = /\b(decline|prefer not|don'?t wish|do not wish|not wish to|choose not|rather not|not to (say|disclose|answer|self.?identify)|not disclose)\b/i;

export function bestOption<T extends { text: string }>(options: T[], value: string): T | null {
  const target = norm(value);
  if (!target) return null;
  // "Decline" means the form's own way of not answering, whatever its wording.
  if (DECLINE.test(value)) {
    const decline = options.find((o) => DECLINE.test(o.text));
    if (decline) return decline;
  }
  const words = new Set(target.split(" "));
  let best: { option: T; score: number } | null = null;
  for (const option of options) {
    const text = norm(option.text);
    if (!text) continue;
    let score: number;
    if (text === target) score = 100;
    else if (text.startsWith(target) || target.startsWith(text)) score = 80;
    else if (text.includes(target) || target.includes(text)) score = 60;
    else {
      const shared = text.split(" ").filter((w) => words.has(w)).length;
      score = shared ? (40 * shared) / Math.max(words.size, 1) : 0;
    }
    if (score > (best?.score ?? 0)) best = { option, score };
  }
  return best && best.score >= 20 ? best.option : null;
}

function press(el: Element) {
  // Many dropdown libraries react to pointer/mouse down rather than click, and check that the
  // primary button is held (react-select).
  const view = el.ownerDocument.defaultView;
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Event = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
    const down = type.endsWith("down");
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: down ? 1 : 0, pointerType: "mouse", isPrimary: true } as PointerEventInit;
    let event: Event;
    try {
      event = new Event(type, { ...init, view });
    } catch {
      event = new Event(type, init); // test DOMs without a real window
    }
    el.dispatchEvent(event);
  }
}

/** The clickable box of a searchable dropdown (react-select's "control"), or the input itself. */
function controlOf(input: HTMLElement): HTMLElement {
  return (input.closest("[class*='__control'], [class*='-control'], [class*='Control']") as HTMLElement | null) ?? input;
}

function visibleOptions(doc: Document, listId: string | null): HTMLElement[] {
  const scope: ParentNode = (listId && doc.getElementById(listId)) || doc;
  // Hidden lists stay in the page (intl-tel-input keeps ~240 country options in a closed
  // dropdown), so check the option's real visibility, parents included.
  return ([...scope.querySelectorAll("[role='option']")] as HTMLElement[]).filter(
    (o) => o.getAttribute("aria-disabled") !== "true" && !o.closest("[hidden], [aria-hidden='true']") && isVisible(o),
  );
}

async function pickOption(owner: HTMLElement, value: string, attempts = 20): Promise<boolean> {
  const listId = owner.getAttribute("aria-controls") ?? owner.getAttribute("aria-owns");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const options = visibleOptions(owner.ownerDocument, listId).map((el) => ({ el, text: el.textContent ?? "" }));
    const match = bestOption(options, value);
    if (match) {
      match.el.scrollIntoView?.({ block: "nearest" });
      press(match.el);
      return true;
    }
    await wait(100);
  }
  return false;
}

/** A radio's group: same name, or (no name) the radios in its nearest block. */
function radioGroup(first: HTMLInputElement): HTMLInputElement[] {
  if (first.name) return deepQueryAll(first.getRootNode() as Document, `input[type=radio][name="${CSS.escape(first.name)}"]`) as HTMLInputElement[];
  let node = first.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    const radios = [...node.querySelectorAll("input[type=radio]:not([name])")] as HTMLInputElement[];
    if (radios.length > 1) return radios;
  }
  return [first];
}

/** The boxes of a "check all that apply" question: same name, or the same fieldset/group. */
function groupBoxes(first: HTMLInputElement): HTMLInputElement[] {
  const named = first.name ? (deepQueryAll(first.getRootNode() as Document, `input[type=checkbox][name="${CSS.escape(first.name)}"]`) as HTMLInputElement[]) : [];
  if (named.length > 1) return named;
  const root = first.closest("fieldset, [role='group']");
  return root ? ([...root.querySelectorAll("input[type=checkbox]")] as HTMLInputElement[]) : [first];
}

const MENU_ITEMS = "[role='option'], [role='menuitem'], [role='menuitemradio'], li, [role='button'], button, [tabindex], div, span";

function menuItems(doc: Document): HTMLElement[] {
  return ([...doc.querySelectorAll(MENU_ITEMS)] as HTMLElement[]).filter((e) => isVisible(e) && e.childElementCount <= 3);
}

/**
 * Home-made dropdowns without ARIA roles: the items that appeared when it opened are its
 * options. Chooses the best match among them.
 */
async function pickNewItem(owner: HTMLElement, before: Set<HTMLElement>, value: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const fresh = menuItems(owner.ownerDocument)
      .filter((e) => !before.has(e) && !owner.contains(e) && !e.closest("copilot-assistant"))
      .map((el) => ({ el, text: (el.textContent ?? "").replace(/\s+/g, " ").trim() }))
      .filter((o) => o.text && o.text.length <= 80);
    const match = bestOption(fresh, value);
    if (match) {
      match.el.scrollIntoView?.({ block: "nearest" });
      press(match.el);
      return true;
    }
    await wait(100);
  }
  return false;
}

const SUGGESTIONS = "[role='option'], .dropdown-results > *, .pac-item, [class*='suggestion'] li, li[class*='suggestion'], [class*='autocomplete'] li, [class*='typeahead'] li";

/** Suggestions a place box shows near itself (or Google Places' list at the end of the page). */
function suggestionsFor(input: HTMLInputElement): HTMLElement[] {
  let node: Element | null = input.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const near = ([...node.querySelectorAll(SUGGESTIONS)] as HTMLElement[]).filter((o) => isVisible(o) && (o.textContent ?? "").trim());
    if (near.length) return near;
  }
  return ([...input.ownerDocument.querySelectorAll(".pac-container .pac-item, [role='listbox'] [role='option']")] as HTMLElement[]).filter(isVisible);
}

/**
 * Type the place's first part ("Bengaluru") the way a person would, then choose the
 * suggestion that best matches the whole value. False when no suggestion list appears.
 */
async function pickSuggestion(input: HTMLInputElement, value: string): Promise<boolean> {
  const query = value.split(",")[0]!.trim();
  if (!query) return false;
  await typeInto(input, query, { keepFocus: true });
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await wait(120);
    const options = suggestionsFor(input).map((el) => ({ el, text: el.textContent ?? "" }));
    if (!options.length) continue;
    const match = bestOption(options, value) ?? bestOption(options, query) ?? options[0]!;
    match.el.scrollIntoView?.({ block: "nearest" });
    press(match.el);
    await wait(200);
    input.blur();
    return true;
  }
  // No list: put the full value back as plain text.
  setNativeValue(input, value);
  dispatch(input, "input", "change");
  input.blur();
  return false;
}

async function pickComboboxOption(input: HTMLInputElement, value: string): Promise<boolean> {
  if (await pickOption(input, value, 6)) return true;
  // Workday-style search prompts only list matches after Enter.
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  if (await pickOption(input, value, 10)) return true;
  // The search found nothing ("Decline" vs "I don't wish to answer"): clear it, open the
  // whole list and choose from every option.
  await typeInto(input, "", { keepFocus: true });
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
  if (await pickOption(input, value, 4)) return true;
  press(controlOf(input));
  return pickOption(input, value, 8);
}

export async function fillField(instruction: FillInstruction): Promise<FillResult> {
  const el = findField(instruction.id);
  if (!el) return { id: instruction.id, status: "failed", message: "Field is no longer on the page" };
  if (!instruction.overwrite && hasValue(el, instruction)) {
    return { id: instruction.id, status: "skipped", message: "Already has a value" };
  }
  try {
    switch (instruction.kind) {
      case "select": {
        const select = el as HTMLSelectElement;
        const option = [...select.options].find((o) => o.value === instruction.optionValue);
        if (!option) return { id: instruction.id, status: "failed", message: "Option not found" };
        select.focus();
        setNativeValue(select, option.value);
        dispatch(select, "input", "change");
        select.blur();
        break;
      }
      case "radio": {
        // Toggle buttons standing in for radios (Ashby's Yes / No).
        if (!(el instanceof HTMLInputElement)) {
          const target = [...(el.parentElement?.children ?? [])].find((b) => b.getAttribute("data-copilot-field") === instruction.optionValue) as HTMLElement | undefined;
          if (!target) return { id: instruction.id, status: "failed", message: "Option not found" };
          if (target.getAttribute("aria-pressed") !== "true") press(target);
          break;
        }
        const radios = radioGroup(el as HTMLInputElement);
        const radio = radios.find((r) => r.value === instruction.optionValue || r.getAttribute("data-copilot-field") === instruction.optionValue);
        if (!radio) return { id: instruction.id, status: "failed", message: "Option not found" };
        if (!radio.checked) radio.click();
        if (!radio.checked) {
          radio.checked = true;
          dispatch(radio, "input", "change");
        }
        break;
      }
      case "checkboxes": {
        const boxes = groupBoxes(el as HTMLInputElement);
        const wanted = new Set((instruction.optionValue ?? "").split("\n").filter(Boolean));
        const targets = boxes.filter((b) => wanted.has(b.value) || wanted.has(b.getAttribute("data-copilot-field") ?? ""));
        if (!targets.length) return { id: instruction.id, status: "failed", message: "Option not found" };
        for (const box of targets) {
          if (!box.checked) box.click();
          if (!box.checked) {
            box.checked = true;
            dispatch(box, "input", "change");
          }
        }
        break;
      }
      case "checkbox": {
        const box = el as HTMLInputElement;
        if (instruction.checked !== undefined && box.checked !== instruction.checked) box.click();
        break;
      }
      case "file": {
        if (!instruction.file) return { id: instruction.id, status: "failed", message: "No file to attach" };
        const input = el as HTMLInputElement;
        const transfer = new DataTransfer();
        const blob = base64ToBytes(instruction.file.base64);
        transfer.items.add(new File([blob], instruction.file.name, { type: instruction.file.type }));
        input.files = transfer.files;
        dispatch(input, "input", "change");
        break;
      }
      case "contenteditable": {
        el.focus();
        const selection = el.ownerDocument.getSelection();
        selection?.selectAllChildren(el);
        const inserted = el.ownerDocument.execCommand?.("insertText", false, instruction.value ?? "");
        if (!inserted) {
          el.textContent = instruction.value ?? "";
          dispatch(el, "input");
        }
        el.blur();
        break;
      }
      case "listbox": {
        // Open the dropdown, then choose the option that best matches the value.
        el.scrollIntoView?.({ block: "center" });
        const before = new Set(menuItems(el.ownerDocument));
        press(el);
        const picked = (await pickOption(el, instruction.value ?? "", 12)) || (await pickNewItem(el, before, instruction.value ?? ""));
        if (!picked) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          return { id: instruction.id, status: "failed", message: "No matching option; choose it yourself" };
        }
        break;
      }
      case "combobox": {
        if (instruction.multi) {
          // One value at a time: type it, then choose the matching option (or press Enter).
          const input = el as HTMLInputElement;
          let added = 0;
          for (const value of (instruction.value ?? "").split(/\s*,\s*/).filter(Boolean).slice(0, 12)) {
            await typeInto(input, value, { keepFocus: true });
            if (await pickComboboxOption(input, value)) added += 1;
            setNativeValue(input, "");
            dispatch(input, "input");
            await wait(150);
          }
          input.blur();
          if (!added) return { id: instruction.id, status: "failed", message: "None of the values matched an option" };
          break;
        }
        const input = el as HTMLInputElement;
        // Open it like a click would, then type the start of the answer to narrow the list
        // ("India" for "India (+91)").
        press(controlOf(input));
        const query = (instruction.value ?? "").split(/\s*[(,]/)[0]!.trim() || (instruction.value ?? "");
        await typeInto(input, query, { keepFocus: true });
        const picked = await pickComboboxOption(input, instruction.value ?? "");
        if (!picked) {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
          // A free-text box with suggestions keeps the typed value; a pick-only list doesn't.
          setNativeValue(input, instruction.value ?? "");
          dispatch(input, "input", "change");
          input.blur();
          await wait(150);
          if (input.value.trim()) {
            highlight(input);
            return { id: instruction.id, status: "filled", message: "Typed the value; check the selection" };
          }
          return { id: instruction.id, status: "failed", message: "No matching option; choose it yourself" };
        }
        input.blur();
        break;
      }
      default: {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        if (instruction.suggest && input instanceof HTMLInputElement && (await pickSuggestion(input, instruction.value ?? ""))) break;
        // Date spin boxes (Workday) and widgets that ignore a set value get it typed key by key.
        if (instruction.typing || needsTyping(input)) await typeInto(input, instruction.value ?? "");
        else {
          input.focus();
          setNativeValue(input, instruction.value ?? "");
          dispatch(input, "input", "change");
          input.blur();
        }
      }
    }
  } catch (error) {
    return { id: instruction.id, status: "failed", message: error instanceof Error ? error.message.slice(0, 200) : "Could not fill" };
  }
  highlight(el);
  return { id: instruction.id, status: "filled" };
}

export interface FillOptions {
  /** Scroll to each field and pause briefly so the user can follow along. */
  interactive?: boolean;
  /** Called before and after each field. */
  onProgress?: (id: string, status: "filling" | FillResult["status"], message?: string) => void;
}

const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export async function fillFields(instructions: FillInstruction[], options: FillOptions = {}): Promise<FillResult[]> {
  const results: FillResult[] = [];
  // Sequential on purpose: dependent fields (e.g. country → state) need the page to react.
  for (const instruction of instructions) {
    if (options.interactive) {
      const el = findField(instruction.id);
      if (el) {
        el.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
        options.onProgress?.(instruction.id, "filling");
        await wait(reducedMotion() ? 60 : 260);
      }
    }
    const result = await fillField(instruction);
    results.push(result);
    options.onProgress?.(instruction.id, result.status, result.message);
    if (options.interactive) await wait(90);
  }
  return results;
}
