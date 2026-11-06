/** Pure helpers for the floating bubble's position (kept separate so they can be tested). */

export const BUBBLE = 52;
const MARGIN = 12;

export interface Dock {
  side: "left" | "right";
  y: number;
}

/** Keeps the bubble fully on screen vertically. */
export function clampY(y: number, viewportHeight: number): number {
  return Math.round(Math.min(Math.max(y, MARGIN), Math.max(MARGIN, viewportHeight - BUBBLE - MARGIN)));
}

/** Where a drag that ended with the bubble's top-left corner at (x, y) docks. */
export function snap(x: number, y: number, viewportWidth: number, viewportHeight: number): Dock {
  return { side: x + BUBBLE / 2 < viewportWidth / 2 ? "left" : "right", y: clampY(y, viewportHeight) };
}

/** Top of the panel so it sits next to the bubble without leaving the screen. */
export function panelTop(dockY: number, panelHeight: number, viewportHeight: number): number {
  return Math.round(Math.min(Math.max(dockY - 8, MARGIN), Math.max(MARGIN, viewportHeight - panelHeight - MARGIN)));
}

/** A pointer that moved this far is dragging, not clicking. */
export const DRAG_THRESHOLD = 5;
