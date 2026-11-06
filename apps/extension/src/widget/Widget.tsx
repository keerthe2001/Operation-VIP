import { useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";

import type { Reply } from "@/shared/messages";
import type { WidgetState } from "@/shared/types";
import { clampY, DRAG_THRESHOLD, DRAWER_WIDTH } from "@/widget/position";
import { shrinkPage } from "@/widget/shrink";

export type Send = <T = unknown>(message: Record<string, unknown>) => Promise<Reply<T>>;

/** What the toolbar icon and the panel's close button can do to the drawer. */
export interface WidgetHandle {
  toggle(): void;
  collapse(): void;
  progress(update: ProgressUpdate): void;
  submitted(): void;
}

export interface ProgressUpdate {
  phase: "start" | "field" | "done";
  view: "popup" | "modal";
  items: { id: string; label: string; status: "pending" | "filling" | "filled" | "skipped" | "failed" }[];
}

function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The in-page Copilot: a tab on the right edge and a drawer that docks beside the page
 * (the page narrows to make room). The drawer shows the full Copilot panel in an iframe.
 */
export function Widget({
  send,
  url,
  panelUrl,
  handle,
}: {
  send: Send;
  url: () => string;
  /** Builds the embedded panel's address for this tab. */
  panelUrl: (tabId: number, nonce: string) => string;
  handle?: Ref<WidgetHandle>;
}) {
  const [state, setState] = useState<WidgetState | null>(null);
  const [open, setOpen] = useState(false);
  // Opened from the toolbar icon: shown even on pages without a detected job.
  const [forced, setForced] = useState(false);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [y, setY] = useState<number | null>(null);
  const [dragY, setDragY] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [askSubmitted, setAskSubmitted] = useState<"ask" | "done" | null>(null);
  const hideProgress = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoOpened = useRef(new Set<string>());
  const pointer = useRef<{ startY: number; offset: number; moved: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const reply = await send<WidgetState>({ type: "WIDGET_STATE" });
    if (!reply.ok || !reply.data) return;
    const next = reply.data;
    setState(next);
    // Open by itself once per page when an application form shows up.
    const href = url();
    if (next.job?.isApplicationPage && next.prefs.autoOpen && next.signedIn && !next.prefs.hidden && !autoOpened.current.has(href)) {
      autoOpened.current.add(href);
      setOpen(true);
    }
  }, [send, url]);

  useImperativeHandle(handle, () => ({
    toggle() {
      setGone(false);
      setForced(true);
      setOpen((o) => !o);
    },
    collapse() {
      setOpen(false);
    },
    progress(update) {
      clearTimeout(hideProgress.current);
      setProgress(update);
      if (update.phase === "done") hideProgress.current = setTimeout(() => setProgress(null), 3500);
    },
    submitted() {
      setAskSubmitted("ask");
    },
  }));

  // Poll while the page is visible. Detection runs in the content script; the background
  // holds the result, so this only reads it.
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), open ? 3000 : 4000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [open, refresh]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Load the panel the first time the drawer opens; keep it loaded afterwards.
  useEffect(() => {
    if (!open || frameSrc) return;
    let active = true;
    void send<{ tabId: number; nonce: string }>({ type: "WIDGET_EMBED" }).then((reply) => {
      if (active && reply.ok && reply.data) setFrameSrc(panelUrl(reply.data.tabId, reply.data.nonce));
    });
    return () => {
      active = false;
    };
  }, [open, frameSrc, send, panelUrl]);

  // Docked like a side panel: while open, the page narrows to make room (on narrow windows
  // the drawer overlays it).
  const docked = open && !gone;
  useEffect(() => {
    if (!docked || window.innerWidth < 900) return;
    return shrinkPage(DRAWER_WIDTH, document, document.querySelector("copilot-assistant") ?? undefined);
  }, [docked]);

  if (gone) return null;
  const visible =
    open ||
    forced ||
    (!!state && !state.prefs.hidden && state.prefs.mode !== "off" && (state.prefs.mode === "always" || !!state.job));
  if (!visible) return null;

  const top = dragY ?? y ?? clampY(state?.prefs.y ?? 160, window.innerHeight);
  const theme = state?.prefs.theme ?? "system";
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const ready = state?.form.ready ?? 0;

  // The edge tab only moves up and down; a short press opens the drawer.
  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    pointer.current = { startY: event.clientY, offset: event.clientY - top, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const p = pointer.current;
    if (!p) return;
    if (!p.moved && Math.abs(event.clientY - p.startY) < DRAG_THRESHOLD) return;
    p.moved = true;
    setDragY(clampY(event.clientY - p.offset, window.innerHeight));
  }
  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    if (p.moved) {
      const next = clampY(event.clientY - p.offset, window.innerHeight);
      setY(next);
      setDragY(null);
      void send({ type: "WIDGET_PREFS", prefs: { y: next } });
    } else {
      setOpen(true);
    }
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const next = clampY(top + (event.key === "ArrowUp" ? -40 : 40), window.innerHeight);
    setY(next);
    void send({ type: "WIDGET_PREFS", prefs: { y: next } });
  }

  return (
    <div className={`root${dark ? " dark" : ""}`}>
      {!open && (
        <div className="edge" style={{ top }}>
          <button
            type="button"
            className={`edge-tab${dragY !== null ? " dragging" : ""}`}
            aria-label="Open Copilot"
            aria-expanded={false}
            title="Copilot · drag to move"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              pointer.current = null;
              setDragY(null);
            }}
            onKeyDown={onTabKey}
          >
            <Logo size={22} />
            {ready > 0 && <span className="edge-badge">{ready}</span>}
            {ready === 0 && state?.prefs.showMatch && state.match?.score != null && (
              <span className="edge-badge" title="Match score">
                {state.match.score}%
              </span>
            )}
            {state?.job?.isApplicationPage && <span className="edge-dot" />}
          </button>
          <button
            type="button"
            className="edge-hide"
            aria-label="Hide Copilot on this site"
            title="Hide on this site"
            onClick={() => {
              setGone(true);
              void send({ type: "WIDGET_PREFS", prefs: { hideOnHost: location.hostname } });
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {progress && <FillProgress update={progress} onClose={() => setProgress(null)} />}
      {askSubmitted && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Application submitted?">
          <div className="modal-card">
            <Logo size={26} />
            {askSubmitted === "ask" ? (
              <>
                <p className="modal-title">Did you submit this application?</p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      const reply = await send({ type: "WIDGET_MARK_SUBMITTED" });
                      setAskSubmitted(reply.ok ? "done" : null);
                      if (reply.ok) setTimeout(() => setAskSubmitted(null), 1500);
                    }}
                  >
                    Yes, mark submitted
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setAskSubmitted(null)}>
                    Not yet
                  </button>
                </div>
              </>
            ) : (
              <p className="modal-title">Marked as submitted ✓</p>
            )}
          </div>
        </div>
      )}

      <aside
        className={`drawer${open ? " open" : ""}`}
        aria-label="Copilot"
        aria-hidden={!open}
        inert={!open}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        {frameSrc ? (
          <iframe className="panel-frame" src={frameSrc} title="Copilot panel" allow="clipboard-write" />
        ) : (
          <div className="loading" role="status">
            <Logo size={28} />
          </div>
        )}
      </aside>
    </div>
  );
}

const ICON: Record<ProgressUpdate["items"][number]["status"], string> = {
  pending: "○",
  filling: "◌",
  filled: "✓",
  skipped: "–",
  failed: "!",
};

/** Live list of fields being filled: a popup at the top right or a blurred overlay. */
function FillProgress({ update, onClose }: { update: ProgressUpdate; onClose: () => void }) {
  const done = update.items.filter((i) => i.status === "filled").length;
  const failed = update.items.filter((i) => i.status === "failed").length;
  const finished = update.phase === "done";
  const card = (
    <div className={`progress-card ${update.view}`} role="status" aria-live="polite">
      <div className="progress-head">
        <span className="progress-title">{finished ? (failed ? `Done · ${failed} need you` : "Completed!") : `Filling ${done + 1 > update.items.length ? update.items.length : done + 1} of ${update.items.length}`}</span>
        <button type="button" className="progress-close" aria-label="Close progress" onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="progress-list">
        {update.items.map((item) => (
          <li key={item.id} className={`progress-item ${item.status}`}>
            <span className="progress-icon" aria-hidden="true">
              {ICON[item.status]}
            </span>
            <span className="progress-label">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return update.view === "modal" ? <div className="progress-modal">{card}</div> : card;
}
