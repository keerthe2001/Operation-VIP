import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Copy,
  EyeOff,
  FileText,
  Gauge,
  MapPin,
  Minus,
  PanelRight,
  Sparkles,
  UserRound,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import type { Reply } from "@/shared/messages";
import type { WidgetState } from "@/shared/types";
import { BUBBLE, clampY, DRAG_THRESHOLD, panelTop, snap, type Dock } from "@/widget/position";

export type Send = <T = unknown>(message: Record<string, unknown>) => Promise<Reply<T>>;
type Tab = "autofill" | "match" | "profile";

function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 12.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--good)" : score >= 45 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="ring" role="img" aria-label={`Match score ${score} out of 100`}>
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r={r} stroke="var(--surface-2)" strokeWidth="5" fill="none" />
        <circle cx="23" cy="23" r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span>{score}</span>
    </div>
  );
}

export function Widget({ send, url }: { send: Send; url: () => string }) {
  const [state, setState] = useState<WidgetState | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("autofill");
  const [dockState, setDock] = useState<Dock | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const autoOpened = useRef(new Set<string>());
  const pointer = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(560);

  const refresh = useCallback(async () => {
    const reply = await send<WidgetState>({ type: "WIDGET_STATE" });
    if (!reply.ok || !reply.data) return;
    const next = reply.data;
    setState(next);
    // Open by itself once per page when an application form shows up.
    const href = url();
    if (next.job?.isApplicationPage && next.prefs.autoOpen && next.signedIn && !autoOpened.current.has(href)) {
      autoOpened.current.add(href);
      setOpen(true);
    }
  }, [send, url]);

  // Poll while the page is visible: faster when open. Detection runs in the content script;
  // the background holds the result, so this only reads it.
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), open ? 1500 : 4000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [open, refresh]);

  useEffect(() => {
    const onResize = () => setDock((d) => (d ? { ...d, y: clampY(d.y, window.innerHeight) } : d));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Track the panel's height so it can be kept on screen next to the bubble.
  useEffect(() => {
    const el = panelRef.current;
    if (!open || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setPanelHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  if (!state || gone) return null;
  // Until the user moves it, the bubble sits where they last left it (saved preference).
  const dock = dockState ?? { side: state.prefs.side, y: clampY(state.prefs.y, window.innerHeight) };
  const visible =
    !state.prefs.hidden &&
    state.prefs.mode !== "off" &&
    (state.prefs.mode === "always" || !!state.job);
  if (!visible) return null;

  const job = state.job;
  const form = state.form;

  function saveDock(next: Dock) {
    setDock(next);
    void send({ type: "WIDGET_PREFS", prefs: { side: next.side, y: next.y } });
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const p = pointer.current;
    if (!p) return;
    if (!p.moved && Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < DRAG_THRESHOLD) return;
    p.moved = true;
    setDrag({ x: event.clientX - p.offsetX, y: event.clientY - p.offsetY });
  }
  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    if (p.moved) {
      saveDock(snap(event.clientX - p.offsetX, event.clientY - p.offsetY, window.innerWidth, window.innerHeight));
      setDrag(null);
    } else {
      setOpen((o) => !o);
    }
  }
  function onBubbleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      saveDock({ ...dock, y: clampY(dock.y + (event.key === "ArrowUp" ? -40 : 40), window.innerHeight) });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      saveDock({ ...dock, side: event.key === "ArrowLeft" ? "left" : "right" });
    }
  }

  async function act(message: Record<string, unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    const reply = await send<{ filled?: number }>(message);
    setBusy(false);
    setNotice(reply.ok ? { kind: "ok", text: success } : { kind: "error", text: reply.error });
    void refresh();
    return reply;
  }

  async function fill() {
    setBusy(true);
    setNotice(null);
    const reply = await send<{ filled: number; failed?: number }>({ type: "WIDGET_FILL" });
    setBusy(false);
    if (!reply.ok) setNotice({ kind: "error", text: reply.error });
    else setNotice({ kind: "ok", text: `Filled ${reply.data?.filled ?? 0} field${reply.data?.filled === 1 ? "" : "s"}. Review the form before you submit.` });
    void refresh();
  }

  async function openPanel() {
    const reply = await send({ type: "WIDGET_OPEN_PANEL" });
    if (!reply.ok) setNotice({ kind: "error", text: "Click the Copilot icon in the toolbar to open the full panel." });
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setNotice({ kind: "error", text: "Couldn't copy on this page." });
    }
  }

  const sideStyle = dock.side === "right" ? { right: 16 } : { left: 16 };
  const bubbleStyle = drag ? { left: drag.x, top: drag.y } : { ...sideStyle, top: dock.y };
  const panelStyle = {
    ...(dock.side === "right" ? { right: 16 + BUBBLE + 10 } : { left: 16 + BUBBLE + 10 }),
    top: panelTop(dock.y, panelHeight, window.innerHeight),
  };
  const status = !job
    ? { text: "No job found", cls: "" }
    : job.isApplicationPage
      ? { text: "Application", cls: "good" }
      : { text: "Job posting", cls: "accent" };

  return (
    <>
      <div className="bubble-wrap" data-side={dock.side} style={bubbleStyle}>
        <button
          type="button"
          className={`bubble${drag ? " dragging" : ""}`}
          aria-label={open ? "Minimise Copilot" : "Open Copilot"}
          aria-expanded={open}
          title="Copilot · drag to move"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            pointer.current = null;
            setDrag(null);
          }}
          onKeyDown={onBubbleKey}
        >
          <Logo size={26} />
        </button>
        {!open && form.ready > 0 && <span className="bubble-badge">{form.ready}</span>}
        {!open && job?.isApplicationPage && <span className="bubble-dot" />}
        {!open && !drag && (
          <button
            type="button"
            className="bubble-hide"
            aria-label="Hide Copilot on this site"
            title="Hide on this site"
            onClick={() => {
              setGone(true);
              void send({ type: "WIDGET_PREFS", prefs: { hideOnHost: location.hostname } });
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          className="panel"
          style={panelStyle}
          role="dialog"
          aria-label="Copilot assistant"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <div className="head">
            <span className="logo">
              <Logo size={18} />
            </span>
            <div className="brand">
              Copilot <span className={`chip ${status.cls}`}>{status.text}</span>
            </div>
            <button type="button" className="icon-btn" aria-label="Open the full side panel" title="Open side panel" onClick={openPanel}>
              <PanelRight size={17} />
            </button>
            <button type="button" className="icon-btn" aria-label="Minimise" title="Minimise" onClick={() => setOpen(false)}>
              <Minus size={17} />
            </button>
          </div>

          {job && (
            <div className="job">
              <div className="job-text">
                <div className="job-title">{job.title ?? "Untitled role"}</div>
                <div className="job-company">{[job.company, state.tracked ? "Saved to tracker" : null].filter(Boolean).join(" · ")}</div>
              </div>
              {state.match?.score != null && <ScoreRing score={state.match.score} />}
            </div>
          )}

          <div className="tabs" role="tablist" aria-label="Copilot sections">
            {(
              [
                ["autofill", "Autofill", <Wand2 key="i" size={14} />],
                ["match", "Match", <Gauge key="i" size={14} />],
                ["profile", "Profile", <UserRound key="i" size={14} />],
              ] as [Tab, string, ReactNode][]
            ).map(([id, label, icon]) => (
              <button key={id} type="button" role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {icon} {label}
              </button>
            ))}
          </div>

          <div className="body" role="tabpanel">
            {!state.signedIn ? (
              <div className="card">
                <div className="row-title">Sign in to Copilot</div>
                <div className="note">Open the side panel and sign in to fill applications from your profile.</div>
                <button type="button" className="primary" onClick={openPanel}>
                  <PanelRight size={16} /> Open Copilot
                </button>
              </div>
            ) : tab === "autofill" ? (
              <AutofillTab
                state={state}
                busy={busy}
                onFill={fill}
                onForce={() => act({ type: "WIDGET_FORCE" }, "Looking for fields on this page…")}
                onSave={() => act({ type: "WIDGET_SAVE_JOB" }, "Saved to your tracker.")}
                onPanel={openPanel}
              />
            ) : tab === "match" ? (
              <MatchTab state={state} />
            ) : (
              <ProfileTab state={state} copied={copied} onCopy={copy} />
            )}
            {notice && <div className={notice.kind === "ok" ? "success" : "error"} role="status">{notice.text}</div>}
          </div>
        </div>
      )}
    </>
  );
}

function AutofillTab({
  state,
  busy,
  onFill,
  onForce,
  onSave,
  onPanel,
}: {
  state: WidgetState;
  busy: boolean;
  onFill: () => void;
  onForce: () => void;
  onSave: () => void;
  onPanel: () => void;
}) {
  const { job, form } = state;
  const saveButton = job && (
    <button type="button" className="secondary" onClick={onSave} disabled={busy || !!state.tracked}>
      {state.tracked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {state.tracked ? "Saved to tracker" : "Save job"}
    </button>
  );

  if (!job?.isApplicationPage) {
    return (
      <>
        <div className="card">
          <div className="row-title">{job ? "This is a job posting" : `Hi${state.firstName ? ` ${state.firstName}` : ""}, no application form here yet`}</div>
          <div className="note">
            {job
              ? "Open the application form (click Apply on the page) and Copilot will fill it in. You can also fill any form on this page."
              : "If this page has a form you want to fill, Copilot can fill whatever matches your profile."}
          </div>
        </div>
        <button type="button" className="primary" onClick={onForce} disabled={busy}>
          <Wand2 size={16} /> Fill this page anyway
        </button>
        {saveButton}
      </>
    );
  }

  return (
    <>
      <button type="button" className="primary" onClick={onFill} disabled={busy || form.ready === 0}>
        <Sparkles size={16} />
        {form.ready > 0 ? `Autofill ${form.ready} field${form.ready === 1 ? "" : "s"}` : form.filled > 0 ? "Everything ready is filled" : "Nothing to fill yet"}
      </button>
      <div className="stats">
        <div className="stat"><b>{form.filled}</b><span>Filled</span></div>
        <div className="stat"><b>{form.review}</b><span>Review</span></div>
        <div className="stat"><b>{form.questions}</b><span>Questions</span></div>
        <div className="stat"><b>{form.missing}</b><span>Missing</span></div>
      </div>
      <div className="card">
        <div className="row">
          <FileText size={18} className={state.resumeName ? "ok" : "warn"} />
          <div className="row-main">
            <div className="row-title">Resume</div>
            <div className="row-sub">
              {state.resumeName ?? "No resume uploaded"}
              {state.resumeName && !form.hasResumeField ? " · no upload field on this step" : ""}
            </div>
          </div>
        </div>
        <div className="row">
          <FileText size={18} className={form.hasCoverLetterField ? "ok" : ""} />
          <div className="row-main">
            <div className="row-title">Cover letter</div>
            <div className="row-sub">{form.hasCoverLetterField ? "Field found · write it in the side panel" : "No field found"}</div>
          </div>
        </div>
      </div>
      {(form.review > 0 || form.questions > 0) && (
        <button type="button" className="secondary" onClick={onPanel}>
          <PanelRight size={16} /> Review {form.review + form.questions} answer{form.review + form.questions === 1 ? "" : "s"} in the side panel
        </button>
      )}
      {saveButton}
      <div className="note">Copilot never submits. Check the form, then submit it yourself.</div>
    </>
  );
}

function MatchTab({ state }: { state: WidgetState }) {
  const match = state.match;
  if (!match) {
    return (
      <div className="card">
        <div className="row-title">No job description found</div>
        <div className="note">Open the job's description page to see how your profile matches it.</div>
      </div>
    );
  }
  const label = match.score == null ? "Not enough detail" : match.score >= 70 ? "Strong match" : match.score >= 45 ? "Fair match" : "Low match";
  return (
    <>
      <div className="row">
        {match.score != null && <ScoreRing score={match.score} />}
        <div className="row-main">
          <div className="row-title">{label}</div>
          <div className="note">Based on the skills, experience and location in the job description.</div>
        </div>
      </div>
      <div className="card">
        <div className="section-title">Skills you have ({match.matched.length})</div>
        <div className="pills">
          {match.matched.length ? match.matched.map((s) => <span key={s} className="pill good">{s}</span>) : <span className="muted">None of your skills are mentioned.</span>}
        </div>
        <div className="section-title" style={{ marginTop: 6 }}>Mentioned, not in your profile ({match.missing.length})</div>
        <div className="pills">
          {match.missing.length ? match.missing.map((s) => <span key={s} className="pill warn">{s}</span>) : <span className="muted">Nothing missing.</span>}
        </div>
      </div>
      <div className="card">
        <div className="row">
          {match.experienceOk === false ? <XCircle size={18} className="warn" /> : <CheckCircle2 size={18} className={match.experienceOk ? "ok" : ""} />}
          <div className="row-main">
            <div className="row-title">Experience</div>
            <div className="row-sub">
              {match.requiredYears != null ? `Asks for ${match.requiredYears}+ years` : "No years mentioned"}
              {match.haveYears != null ? ` · you have ${match.haveYears}` : ""}
            </div>
          </div>
        </div>
        <div className="row">
          <MapPin size={18} className={match.locationOk ? "ok" : match.locationOk === false ? "warn" : ""} />
          <div className="row-main">
            <div className="row-title">Location</div>
            <div className="row-sub">
              {match.location ?? "Not mentioned"}
              {match.locationOk === true ? " · fits your preferences" : match.locationOk === false ? " · outside your locations" : ""}
            </div>
          </div>
        </div>
      </div>
      <div className="note">Copilot's own estimate from keywords, not an employer's screening result. Add missing skills you really have to your profile.</div>
    </>
  );
}

function ProfileTab({ state, copied, onCopy }: { state: WidgetState; copied: string | null; onCopy: (label: string, value: string) => void }) {
  if (state.profile.length === 0) return <div className="note">Your profile is empty. Upload a resume on the Copilot website.</div>;
  return (
    <>
      <div className="note">Click a value to copy it, for fields Copilot can't fill.</div>
      <div>
        {state.profile.map(({ label, value }) => (
          <button key={label} type="button" className="copy-row" onClick={() => onCopy(label, value)} aria-label={`Copy ${label}`}>
            <div className="row-main">
              <div className="row-title">{label}</div>
              <div className="row-sub">{value}</div>
            </div>
            {copied === label ? <Check size={16} className="ok" /> : <Copy size={15} className="copy-icon" />}
          </button>
        ))}
      </div>
      <div className="note">
        <EyeOff size={12} style={{ verticalAlign: "-2px" }} /> Visible only to you; nothing is shared until you fill a form.
      </div>
    </>
  );
}
