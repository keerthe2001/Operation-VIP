import {
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Gauge,
  MapPin,
  ChevronsRight,
  KeyRound,
  Moon,
  Sun,
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
import { clampY, DRAG_THRESHOLD, DRAWER_WIDTH } from "@/widget/position";
import { shrinkPage } from "@/widget/shrink";

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
  const [y, setY] = useState<number | null>(null);
  const [dragY, setDragY] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const autoOpened = useRef(new Set<string>());
  const pointer = useRef<{ startY: number; offset: number; moved: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const reply = await send<WidgetState>({ type: "WIDGET_STATE" });
    if (!reply.ok || !reply.data) return;
    const next = reply.data;
    setState(next);
    // Slide open by itself once per page when an application form shows up.
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
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Docked like a side panel: while open, the page narrows to make room instead of being
  // covered (on narrow windows the drawer overlays it).
  const docked = open && !!state && !gone;
  useEffect(() => {
    if (!docked || window.innerWidth < 900) return;
    return shrinkPage(DRAWER_WIDTH, document, document.querySelector("copilot-assistant") ?? undefined);
  }, [docked]);

  if (!state || gone) return null;
  const visible = !state.prefs.hidden && state.prefs.mode !== "off" && (state.prefs.mode === "always" || !!state.job);
  if (!visible) return null;

  const job = state.job;
  const form = state.form;
  const top = dragY ?? y ?? clampY(state.prefs.y, window.innerHeight);
  const dark = state.prefs.theme === "dark" || (state.prefs.theme === "system" && systemDark);

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

  async function act(message: Record<string, unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    const reply = await send(message);
    setBusy(false);
    setNotice(reply.ok ? { kind: "ok", text: success } : { kind: "error", text: reply.error });
    void refresh();
  }

  async function fill() {
    setBusy(true);
    setNotice(null);
    const reply = await send<{ filled: number }>({ type: "WIDGET_FILL" });
    setBusy(false);
    setNotice(reply.ok ? { kind: "ok", text: `Filled ${reply.data?.filled ?? 0}` } : { kind: "error", text: reply.error });
    void refresh();
  }

  async function openPanel() {
    const reply = await send({ type: "WIDGET_OPEN_PANEL" });
    if (!reply.ok) setNotice({ kind: "error", text: "Click the Copilot icon in the toolbar." });
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setNotice({ kind: "error", text: "Couldn't copy here." });
    }
  }

  function toggleTheme() {
    const theme = dark ? "light" : "dark";
    setState((s) => (s ? { ...s, prefs: { ...s.prefs, theme } } : s));
    void send({ type: "WIDGET_THEME", theme });
  }

  const status = !job ? { text: "No job", cls: "" } : job.isApplicationPage ? { text: "Application", cls: "good" } : { text: "Job post", cls: "accent" };

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
            {form.ready > 0 && <span className="edge-badge">{form.ready}</span>}
            {job?.isApplicationPage && <span className="edge-dot" />}
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
            <X size={11} />
          </button>
        </div>
      )}

      <aside
        className={`drawer${open ? " open" : ""}`}
        aria-label="Copilot assistant"
        aria-hidden={!open}
        inert={!open}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <div className="head">
          <span className="logo">
            <Logo size={18} />
          </span>
          <div className="brand">
            Copilot <span className={`chip ${status.cls}`}>{status.text}</span>
          </div>
          <button type="button" className="icon-btn" aria-label={dark ? "Light theme" : "Dark theme"} title={dark ? "Light theme" : "Dark theme"} onClick={toggleTheme}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Open the full side panel" title="Side panel" onClick={openPanel}>
            <PanelRight size={17} />
          </button>
          <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={() => setOpen(false)}>
            <ChevronsRight size={18} />
          </button>
        </div>

        {job && (
          <div className="job">
            <div className="job-text">
              <div className="job-title">{job.title ?? "Untitled role"}</div>
              <div className="job-company">{[job.company, state.tracked ? "Saved" : null].filter(Boolean).join(" · ")}</div>
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
            <button type="button" className="primary" onClick={openPanel}>
              <PanelRight size={16} /> Sign in
            </button>
          ) : tab === "autofill" ? (
            <AutofillTab
              state={state}
              busy={busy}
              onFill={fill}
              onForce={() => act({ type: "WIDGET_FORCE" }, "Scanning…")}
              onSave={() => act({ type: "WIDGET_SAVE_JOB" }, "Saved")}
              onPanel={openPanel}
            />
          ) : tab === "match" ? (
            <MatchTab state={state} />
          ) : (
            <ProfileTab state={state} copied={copied} onCopy={copy} />
          )}
          {notice && (
            <div className={notice.kind === "ok" ? "success" : "error"} role="status">
              {notice.text}
            </div>
          )}
        </div>
      </aside>
    </div>
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
      {state.tracked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {state.tracked ? "Saved" : "Save job"}
    </button>
  );

  if (!job?.isApplicationPage) {
    return (
      <>
        <div className="card">
          <div className="row-title">{job ? "Job post" : "No form found"}</div>
          <div className="note">{job ? "Click Apply on the page to open the form." : "Fill any form here from your profile."}</div>
        </div>
        <button type="button" className="primary" onClick={onForce} disabled={busy}>
          <Wand2 size={16} /> Fill this page
        </button>
        {saveButton}
      </>
    );
  }

  return (
    <>
      <button type="button" className="primary" onClick={onFill} disabled={busy || form.ready === 0}>
        <Sparkles size={16} />
        {form.ready > 0 ? `Autofill ${form.ready} field${form.ready === 1 ? "" : "s"}` : form.filled > 0 ? "Ready" : "Nothing to fill"}
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
              {state.resumeName ?? "Not uploaded"}
            </div>
          </div>
        </div>
        <div className="row">
          <FileText size={18} className={form.hasCoverLetterField ? "ok" : ""} />
          <div className="row-main">
            <div className="row-title">Cover letter</div>
            <div className="row-sub">{form.hasCoverLetterField ? "Field found" : "No field"}</div>
          </div>
        </div>
      </div>
      {(form.review > 0 || form.questions > 0) && (
        <button type="button" className="secondary" onClick={onPanel}>
          <PanelRight size={16} /> Review {form.review + form.questions}
        </button>
      )}
      {form.needsPassword && (
        <button type="button" className="secondary" onClick={onPanel}>
          <KeyRound size={16} /> Set account password
        </button>
      )}
      {saveButton}
    </>
  );
}

function MatchTab({ state }: { state: WidgetState }) {
  const match = state.match;
  if (!match) {
    return (
      <div className="card">
        <div className="row-title">No job description</div>
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

        </div>
      </div>
      <div className="card">
        <div className="section-title">You have ({match.matched.length})</div>
        <div className="pills">
          {match.matched.length ? match.matched.map((s) => <span key={s} className="pill good">{s}</span>) : <span className="muted">None</span>}
        </div>
        <div className="section-title" style={{ marginTop: 6 }}>Missing ({match.missing.length})</div>
        <div className="pills">
          {match.missing.length ? match.missing.map((s) => <span key={s} className="pill warn">{s}</span>) : <span className="muted">None</span>}
        </div>
      </div>
      <div className="card">
        <div className="row">
          {match.experienceOk === false ? <XCircle size={18} className="warn" /> : <CheckCircle2 size={18} className={match.experienceOk ? "ok" : ""} />}
          <div className="row-main">
            <div className="row-title">Experience</div>
            <div className="row-sub">
              {match.requiredYears != null ? `${match.requiredYears}+ yrs asked` : "Not stated"}
              {match.haveYears != null ? ` · you: ${match.haveYears}` : ""}
            </div>
          </div>
        </div>
        <div className="row">
          <MapPin size={18} className={match.locationOk ? "ok" : match.locationOk === false ? "warn" : ""} />
          <div className="row-main">
            <div className="row-title">Location</div>
            <div className="row-sub">
              {match.location ?? "Not stated"}
            </div>
          </div>
        </div>
      </div>
      <div className="note">Keyword estimate, not an employer's screening.</div>
    </>
  );
}

function ProfileTab({ state, copied, onCopy }: { state: WidgetState; copied: string | null; onCopy: (label: string, value: string) => void }) {
  if (state.profile.length === 0) return <div className="note">Profile is empty.</div>;
  return (
    <>
      <div className="note">Click to copy.</div>
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
    </>
  );
}
