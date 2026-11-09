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
  if (wrapping) {
    // Lever-style <label><div>Caption</div><div><input>…dropdown hints</div></label>: only
    // the caption, not the text that sits around the control itself.
    const own = textOutside(wrapping, el);
    if (own) return own;
  }
  // The caption somewhere above the control in its own question block (<div><label>Name</label>
  // <div><input></div></div>, Lever's ".application-label .text", Greenhouse's field wrapper).
  const caption = nearestCaption(el);
  if (caption) return caption;
  return el.getAttribute("placeholder")?.trim() || el.getAttribute("name") || "";
}

const CAPTION = "label, legend, .label, [class*='label'], [class*='Label'], [class*='question-text'], [class*='questionText'], .text, [class*='title']";
const CONTROLS = "input:not([type=hidden]), select, textarea, [role='combobox'], [role='listbox'], [contenteditable='true']";

/** A label-like element above the control in the smallest block that holds only this question. */
export function nearestCaption(el: Element): string {
  const own = el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox") && el.name ? el.name : null;
  let node = el.parentElement;
  for (let depth = 0; node && depth < 6 && node !== el.ownerDocument.body; depth += 1, node = node.parentElement) {
    // Stop once the block holds other questions' controls too.
    const others = [...node.querySelectorAll(CONTROLS)].filter((c) => c !== el && !el.contains(c) && !(own && (c as HTMLInputElement).name === own));
    if (others.length > 0) break;
    for (const candidate of node.querySelectorAll(CAPTION)) {
      if (candidate.contains(el) || candidate.querySelector(CONTROLS)) continue;
      // A <label for> that names some other control (Ashby points some at ids that don't exist).
      const target = candidate.getAttribute("for");
      if (target && target !== (el as HTMLElement).id && el.ownerDocument.getElementById(target)) continue;
      if (!(candidate.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const value = text(candidate);
      if (value && value.length < 400) return value;
    }
    // Plain text beside the control in its own block: <div><span>Current CTC</span><input></div>,
    // or a table row <tr><td>Name</td><td><input></td></tr>.
    // Not for a choice's own option text ("Yes", "English"): those questions are found by their group.
    if (own || node.tagName === "LABEL") continue;
    const loose = captionBefore(node, el);
    if (loose && loose.length <= 200 && !/^(select|choose|browse|upload|or|click to|drag|drop|attach)\b/i.test(loose)) return loose;
  }
  return "";
}

/** Text of a label minus the part that wraps the control (and its dropdown hints). */
function textOutside(label: Element, el: Element): string {
  if (!label.contains(el) || label === el) return text(label);
  let branch: Node = el;
  while (branch.parentNode && branch.parentNode !== label) branch = branch.parentNode;
  // The control sits directly in a label: <label><input> Yes</label> keeps its text.
  if (branch === el && label.tagName === "LABEL") return text(label);
  const parts: string[] = [];
  for (const child of label.childNodes) {
    if (child === branch) continue;
    parts.push(child.textContent ?? "");
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
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

/** The first piece of text before the control inside `block` (captions precede their field;
 * "Click to upload" hints and help paragraphs come after the caption or the field). */
function captionBefore(block: Element, el: Element): string {
  let branch: Node = el;
  while (branch.parentNode && branch.parentNode !== block) branch = branch.parentNode;
  for (const child of block.childNodes) {
    if (child === branch) break;
    const first = firstText(child);
    if (first) return first;
  }
  return "";
}

function firstText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!(node instanceof Element) || node.matches("script, style, svg, button, [aria-hidden='true']")) return "";
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if ((t.textContent ?? "").trim()) return text(t.parentElement === node ? node : (t.parentElement ?? node));
  }
  return "";
}
