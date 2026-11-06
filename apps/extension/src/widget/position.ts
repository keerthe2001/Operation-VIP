/** The edge tab's vertical position (kept separate so it can be tested). */

export const TAB_HEIGHT = 56;
export const DRAWER_WIDTH = 360;
const MARGIN = 12;

/** Keeps the tab fully on screen. */
export function clampY(y: number, viewportHeight: number): number {
  return Math.round(Math.min(Math.max(y, MARGIN), Math.max(MARGIN, viewportHeight - TAB_HEIGHT - MARGIN)));
}

/** A pointer that moved this far is dragging, not clicking. */
export const DRAG_THRESHOLD = 5;
