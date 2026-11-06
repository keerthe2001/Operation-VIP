/**
 * Makes room for the docked drawer. Narrowing <html> is enough for normal pages, but
 * app-style sites (Workday, some ATSs) lay out in full-screen fixed layers or 100vw boxes
 * that ignore it, so those are pulled in from the right too. Everything is restored on close.
 */

type Saved = { el: HTMLElement; prop: string; value: string; priority: string };

const MAX_ELEMENTS = 4000;

function set(saved: Saved[], el: HTMLElement, prop: string, value: string) {
  saved.push({
    el,
    prop,
    value: el.style.getPropertyValue(prop),
    priority: el.style.getPropertyPriority(prop),
  });
  el.style.setProperty(prop, value, "important");
}

export function shrinkPage(
  width: number,
  doc: Document = document,
  host?: Element,
): () => void {
  const win = doc.defaultView!;
  const saved: Saved[] = [];
  const handled = new WeakSet<Element>();
  set(saved, doc.documentElement, "width", `calc(100% - ${width}px)`);
  scan();
  win.dispatchEvent(new Event("resize"));

  // Single-page apps (Workday steps) add new layers as you go.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new win.MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  });
  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });

  function scan() {
    const viewport = win.innerWidth;
    let checked = 0;
    for (const el of doc.body?.querySelectorAll<HTMLElement>("*") ?? []) {
      if (++checked > MAX_ELEMENTS) break;
      if (handled.has(el) || (host && (el === host || host.contains(el))))
        continue;
      const style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      // Layers pinned to the viewport's right edge: headers, app shells, cookie bars.
      if (
        style.position === "fixed" &&
        rect.width > viewport * 0.4 &&
        rect.right >= viewport - 2
      ) {
        if (rect.left <= 2) set(saved, el, "width", `calc(100vw - ${width}px)`);
        set(saved, el, "right", `${width}px`);
        set(saved, el, "max-width", `calc(100vw - ${width}px)`);
      } else if (
        style.position !== "fixed" &&
        rect.width >= viewport - 2 &&
        rect.width > viewport - width + 4
      ) {
        // 100vw boxes that would still run under the drawer.
        set(saved, el, "max-width", "100%");
      } else continue;
      handled.add(el);
    }
  }

  return () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const { el, prop, value, priority } of saved.reverse()) {
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
    }
    win.dispatchEvent(new Event("resize"));
  };
}
