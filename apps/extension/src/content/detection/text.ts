export function clean(value: string | null | undefined, max = 200): string | null {
  const result = (value ?? "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, max) : null;
}

/** "acme-corp" → "Acme Corp" */
export function fromSlug(slug: string | undefined): string | null {
  if (!slug) return null;
  const words = decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return null;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Splits "Senior Engineer - Acme" / "Senior Engineer at Acme" document titles. */
export function splitTitle(title: string): { title: string | null; company: string | null } {
  const at = title.match(/^(.+?)\s+at\s+(.+?)(?:\s+[|–—-]\s+.*)?$/i);
  if (at) return { title: clean(at[1]), company: clean(at[2]) };
  const parts = title.split(/\s+[|–—-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { title: clean(parts[0]), company: clean(parts[1]) };
  return { title: clean(title), company: null };
}
