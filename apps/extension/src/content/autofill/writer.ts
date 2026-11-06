/**
 * Writes values into form controls the way a user would, so that frameworks
 * (React, Vue, Angular) observe the change and update their own state.
 */
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
  if (instruction.kind === "radio") {
    const name = (el as HTMLInputElement).name;
    return !!name && deepQueryAll(el.getRootNode() as Document, `input[type=radio][name="${CSS.escape(name)}"]`).some((r) => (r as HTMLInputElement).checked);
  }
  if (instruction.kind === "checkbox") return false;
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

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

/** The option that best matches a value: exact, then prefix, then containment, then shared words. */
export function bestOption<T extends { text: string }>(options: T[], value: string): T | null {
  const target = norm(value);
  if (!target) return null;
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
  // Many dropdown libraries react to pointer/mouse down rather than click.
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Event = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: true }));
  }
}

function visibleOptions(doc: Document, listId: string | null): HTMLElement[] {
  const scope: ParentNode = (listId && doc.getElementById(listId)) || doc;
  return ([...scope.querySelectorAll("[role='option']")] as HTMLElement[]).filter((o) => {
    if (o.getAttribute("aria-disabled") === "true" || o.closest("[hidden], [aria-hidden='true']")) return false;
    const style = o.ownerDocument.defaultView?.getComputedStyle(o);
    return !style || (style.display !== "none" && style.visibility !== "hidden");
  });
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

async function pickComboboxOption(input: HTMLInputElement, value: string): Promise<boolean> {
  if (await pickOption(input, value, 6)) return true;
  // Workday-style search prompts only list matches after Enter.
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  return pickOption(input, value, 15);
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
        const name = (el as HTMLInputElement).name;
        const radios = name
          ? (deepQueryAll(el.getRootNode() as Document, `input[type=radio][name="${CSS.escape(name)}"]`) as HTMLInputElement[])
          : [el as HTMLInputElement];
        const radio = radios.find((r) => r.value === instruction.optionValue || r.getAttribute("data-copilot-field") === instruction.optionValue);
        if (!radio) return { id: instruction.id, status: "failed", message: "Option not found" };
        if (!radio.checked) radio.click();
        if (!radio.checked) {
          radio.checked = true;
          dispatch(radio, "input", "change");
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
        press(el);
        const picked = await pickOption(el, instruction.value ?? "");
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
            input.focus();
            setNativeValue(input, value);
            dispatch(input, "input");
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
        input.focus();
        setNativeValue(input, instruction.value ?? "");
        dispatch(input, "input");
        const picked = await pickComboboxOption(input, instruction.value ?? "");
        if (!picked) {
          dispatch(input, "change");
          highlight(input);
          return { id: instruction.id, status: "filled", message: "Typed the value; check the selection" };
        }
        break;
      }
      default: {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        input.focus();
        setNativeValue(input, instruction.value ?? "");
        dispatch(input, "input", "change");
        input.blur();
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
