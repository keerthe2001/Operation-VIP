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

async function pickComboboxOption(input: HTMLInputElement, value: string): Promise<boolean> {
  const listId = input.getAttribute("aria-controls") ?? input.getAttribute("aria-owns");
  const target = value.toLowerCase();
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const scope: ParentNode = (listId && input.ownerDocument.getElementById(listId)) || input.ownerDocument;
    const options = [...scope.querySelectorAll("[role='option']")] as HTMLElement[];
    const match =
      options.find((o) => (o.textContent ?? "").trim().toLowerCase() === target) ??
      options.find((o) => (o.textContent ?? "").trim().toLowerCase().startsWith(target)) ??
      options.find((o) => (o.textContent ?? "").toLowerCase().includes(target));
    if (match) {
      // Many dropdown libraries select on mousedown rather than click.
      for (const type of ["mousedown", "mouseup", "click"]) {
        match.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      return true;
    }
    await wait(100);
  }
  return false;
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
      case "combobox": {
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

export async function fillFields(instructions: FillInstruction[]): Promise<FillResult[]> {
  const results: FillResult[] = [];
  // Sequential on purpose: dependent fields (e.g. country → state) need the page to react.
  for (const instruction of instructions) results.push(await fillField(instruction));
  return results;
}
