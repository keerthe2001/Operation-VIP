export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  // Also hidden when a parent is (display:none sections of multi-step forms). Browsers expose
  // this through checkVisibility(); jsdom doesn't, so tests fall through to the checks below.
  if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true })) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  // Layout is unavailable in jsdom; treat zero-size elements as visible there.
  return true;
}

export const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
