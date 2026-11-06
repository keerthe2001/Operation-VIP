/**
 * Repeatable form sections (Workday's "Work Experience", "Education", "Languages",
 * "Websites") start empty with an "Add" button. Copilot presses Add once per entry it has
 * for that section, so the fields exist to be filled.
 */
import { labelFor } from "@/content/dom/labels";
import { isVisible, text } from "@/content/dom/visibility";
import { deepQueryAll } from "@/content/forms/scanner";

export interface SectionCounts {
  experience: number;
  education: number;
  languages: number;
  websites: number;
}

// Each entry has one of each of these fields; the most frequent one counts the entries.
const SECTIONS: { key: keyof SectionCounts; heading: RegExp; entryFields: RegExp[]; max: number }[] = [
  { key: "experience", heading: /^(work experience|employment( history)?|experience|professional experience)\b/i, entryFields: [/\b(job title|position)\b/i, /\b(company|employer)\b/i], max: 5 },
  { key: "education", heading: /^(education|academic)/i, entryFields: [/\b(school|university|college|institution)\b/i, /\bdegree\b/i], max: 3 },
  { key: "languages", heading: /^languages?\b/i, entryFields: [/^language\b/i], max: 5 },
  { key: "websites", heading: /^(websites?|links?)\b/i, entryFields: [/\b(url|website|link)\b/i], max: 3 },
];

const ADD = /^(add|add another|\+ ?add)( (work experience|experience|education|language|website))?$/i;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The section's container: the nearest ancestor of the heading that also holds an Add button. */
function container(heading: Element): Element | null {
  let node = heading.parentElement;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    const buttons = [...node.querySelectorAll("button, [role='button']")].filter((b) => ADD.test(text(b)));
    // Stop before reaching an ancestor that spans several sections.
    const headings = node.querySelectorAll("h1, h2, h3, h4, legend, [role='heading']").length;
    if (buttons.length && headings <= 3) return node;
  }
  return null;
}

function entries(section: Element, entryFields: RegExp[]): number {
  const labels = [...section.querySelectorAll("input, textarea, button[aria-haspopup='listbox']")].map((el) => labelFor(el));
  return Math.max(0, ...entryFields.map((pattern) => labels.filter((label) => pattern.test(label)).length));
}

function addButton(section: Element): HTMLElement | null {
  const buttons = ([...section.querySelectorAll("button, [role='button']")] as HTMLElement[]).filter((b) => isVisible(b) && ADD.test(text(b)));
  return buttons.at(-1) ?? null;
}

/** Presses Add until each section has as many entries as the profile; returns how many were added. */
export async function expandSections(counts: SectionCounts, root: Document = document): Promise<number> {
  let added = 0;
  for (const spec of SECTIONS) {
    const wanted = Math.min(counts[spec.key], spec.max);
    if (wanted <= 0) continue;
    const heading = deepQueryAll(root, "h1, h2, h3, h4, legend, [role='heading']").find((h) => spec.heading.test(text(h)));
    const section = heading && container(heading);
    if (!section) continue;
    for (let attempt = 0; attempt < wanted + 1 && entries(section, spec.entryFields) < wanted; attempt += 1) {
      const button = addButton(section);
      if (!button) break;
      button.scrollIntoView?.({ block: "center" });
      button.click();
      added += 1;
      await wait(700);
    }
  }
  return added;
}
