import { text } from "@/content/dom/visibility";

export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Finds the human-readable label for a form control using the usual HTML patterns. */
export function labelFor(el: Element): string {
  // Fields inside a shadow root are labelled by elements in that same root.
  const root = el.getRootNode() as Document | ShadowRoot;
  const doc = typeof root.getElementById === "function" ? root : el.ownerDocument;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const joined = labelledBy
      .split(/\s+/)
      .map((id) => text(doc.getElementById(id)))
      .filter(Boolean)
      .join(" ");
    if (joined) return joined;
  }
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  if (el.id) {
    const explicit = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (explicit && text(explicit)) return text(explicit);
  }
  const wrapping = el.closest("label");
  if (wrapping && text(wrapping)) return text(wrapping);
  // Common pattern: <div><label>Name</label><input></div> without for/id.
  const container = el.closest("div, li, fieldset, p");
  const sibling = container?.querySelector("label, legend, .label, [class*='label']");
  if (sibling && !sibling.contains(el) && text(sibling)) return text(sibling);
  return el.getAttribute("placeholder")?.trim() || el.getAttribute("name") || "";
}

/** Short text around a control, e.g. "Upload CV:" above a custom "Browse Files" drop zone. */
export function nearbyText(el: Element): string {
  let node = el.parentElement;
  for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
    let content = node.textContent ?? "";
    // Button captions ("Browse Files") don't say what the upload is for.
    for (const button of node.querySelectorAll("button, [role='button']")) {
      content = content.replace(button.textContent ?? "", " ");
    }
    content = content.replace(/\s+/g, " ").trim();
    if (content.length > 200) break;
    if (content) return content;
  }
  return "";
}
