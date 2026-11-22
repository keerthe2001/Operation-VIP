import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { reportRun } from "@/code/CodeSection";
import { CodeEditor, type EditorHandle } from "@/code/CodeEditor";
import { STATUS_TEXT, useSandboxStatus } from "@/code/useSandbox";
import { Visualizer } from "@/code/Visualizer";
import { ErrorBox, Loading } from "@/components/Layout";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import type { Lab, LabStep } from "@/lib/types";
import { Md, useTitle } from "@/lib/util";
import { explainError } from "@/sandbox/narrate";
import { sandbox, type RunResult } from "@/sandbox/runner";

type Tab = "guide" | "code" | "visual";

function codeForStep(steps: LabStep[], i: number, prev: string): string {
  const s = steps[i];
  if (!s) return prev;
  if (s.starter !== undefined) return s.starter;
  if (s.append !== undefined) return prev + s.append;
  return prev;
}

export function LabPage() {
  const { slug = "" } = useParams();
  const { user, celebrate } = useSession();
  const { data: lab, error, loading, reload } = useApi<Lab>(`/labs/${slug}`, [user?.id]);
  const status = useSandboxStatus();
  const editor = useRef<EditorHandle>(null);
  const [i, setI] = useState(0);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [hint, setHint] = useState(false);
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState<Tab>("guide");
  const [finished, setFinished] = useState(false);
  const [ranThisStep, setRanThisStep] = useState(false);
  const inited = useRef(false);
  useTitle(lab ? `Lab: ${lab.title}` : "Guided lab");

  useEffect(() => { void sandbox.start().catch(() => undefined); }, []);

  useEffect(() => {
    if (!lab || inited.current) return;
    inited.current = true;
    const steps = lab.body.steps;
    const done = new Set(lab.progress?.steps_done ?? []);
    setPassed(done);
    let start = steps.findIndex((s) => !done.has(s.id));
    if (start < 0) { start = steps.length - 1; if (lab.progress?.completed) setFinished(false); }
    let c = "";
    for (let k = 0; k <= start; k++) {
      const saved = k > 0 ? lab.progress?.code[steps[k - 1]!.id] : undefined;
      c = codeForStep(steps, k, saved ?? c);
    }
    setI(start);
    setCode(c);
    editor.current?.setValue(c);
  }, [lab]);

  if (loading && !lab) return <Loading label="Opening lab" />;
  if (error || !lab) return <ErrorBox error={error ?? { message: "Not found" }} retry={reload} />;

  const steps = lab.body.steps;
  const step = steps[i]!;
  const isRead = step.kind === "read";
  const isDone = passed.has(step.id);
  const exitTo = lab.topic ? `/learn/${lab.topic.slug}` : "/roadmap";

  const markDone = async (src: string) => {
    const next = new Set(passed); next.add(step.id); setPassed(next);
    if (!user) return;
    try {
      const r = await api<{ xp: number; achievements: string[]; completed: boolean }>(`/labs/${lab.slug}/steps`, { body: { step_id: step.id, code: src } });
      celebrate(r);
    } catch { /* progress is retried on the next step */ }
  };

  const run = async (check: boolean) => {
    const src = editor.current?.getValue() ?? code;
    setFeedback(null);
    setHint(false);
    try {
      const r = await sandbox.run({ src, trace: true, check: check && step.check ? step.check : null });
      setResult(r);
      setRanThisStep(true);
      if (window.innerWidth <= 1150) setTab("visual");
      void reportRun(Boolean(user), celebrate);
      if (check && step.check && r.check) {
        if (r.check.passed) {
          setFeedback({ ok: true, text: step.explain || "That works." });
          await markDone(src);
        } else {
          const msg = r.error ? `${r.error.type}${r.error.line ? ` on line ${r.error.line}` : ""}: ${explainError(r.error)}` : (r.check.message || "Not quite yet.");
          setFeedback({ ok: false, text: msg });
        }
      }
    } catch {
      setFeedback({ ok: false, text: "Python couldn't run in this browser. Reload the page and try again." });
    }
  };

  const showMe = async () => {
    if (!step.show || typing) return;
    setTyping(true);
    setTab("code");
    const cur = editor.current?.getValue() ?? "";
    const first = cur.split("\n").find((l) => l.trim()) ?? "";
    const replace = step.replace === true || (Boolean(first) && step.show.trimStart().startsWith(first.trim()));
    let text = step.show.replace(/\n$/, "");
    if (!replace && cur && !cur.endsWith("\n")) text = `\n${text}`;
    await editor.current?.typeAppend(text, { replaceAll: replace });
    setTyping(false);
  };

  const goNext = async () => {
    if (isRead && !isDone) await markDone(editor.current?.getValue() ?? code);
    if (i >= steps.length - 1) { setFinished(true); return; }
    const nc = codeForStep(steps, i + 1, editor.current?.getValue() ?? code);
    setI(i + 1);
    setCode(nc);
    editor.current?.setValue(nc);
    setResult(null);
    setFeedback(null);
    setHint(false);
    setRanThisStep(false);
    setTab("guide");
  };

  const goBack = () => { if (i > 0) { setI(i - 1); setFeedback(null); setResult(null); setTab("guide"); } };

  if (finished) {
    return (
      <div className="lab" data-tab="guide" style={{ gridTemplateRows: "auto 1fr" }}>
        <div className="lab-top"><Link className="btn btn-text btn-sm" to={exitTo}>✕ Close</Link><h1>{lab.title}</h1></div>
        <div className="celebrate wrap-narrow" style={{ alignContent: "center" }}>
          <div className="big" aria-hidden="true">⚗</div>
          <h2 style={{ fontSize: 32 }}>Lab complete</h2>
          <p className="muted">You built it yourself, one line at a time. {user ? "Your progress and XP are saved." : "Log in next time to save labs and earn XP."}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            {lab.topic && <Link className="btn btn-primary" to={`/learn/${lab.topic.slug}`}>Back to the lesson</Link>}
            <Link className="btn btn-ghost" to={user ? "/dashboard" : "/signup"}>{user ? "What's next?" : "Create a free account"}</Link>
            <button className="btn btn-text" type="button" onClick={() => { setFinished(false); setI(0); const c = codeForStep(steps, 0, ""); setCode(c); editor.current?.setValue(c); }}>Do it again</button>
          </div>
        </div>
      </div>
    );
  }

  const canNext = isRead || isDone;

  return (
    <div className="lab" data-tab={tab}>
      <div className="lab-top">
        <Link className="btn btn-text btn-sm" to={exitTo} aria-label="Close lab">✕</Link>
        <h1>{lab.title}</h1>
        <div className="lab-dots" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((s, k) => <i key={s.id} className={passed.has(s.id) ? "done" : k === i ? "cur" : ""} />)}
        </div>
      </div>
      <div className="lab-tabs" role="tablist" aria-label="Lab panels">
        {(["guide", "code", "visual"] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {k === "guide" ? "Step" : k === "code" ? "Code" : "Visual"}
          </button>
        ))}
      </div>
      <div className="lab-body">
        <section className="lab-guide" aria-label="Instructions">
          <span className="label">Step {i + 1} of {steps.length}{lab.level ? ` · ${lab.level.number === 0 ? "Starter" : `Level ${lab.level.number}`}` : ""}</span>
          {i === 0 && <p className="muted small">{lab.body.intro}</p>}
          <p className="lab-say"><Md text={step.say} /></p>
          <div className="row">
            {step.show && <button className="btn btn-acc btn-sm" type="button" onClick={() => void showMe()} disabled={typing}>
              <span className="ghost-hand" aria-hidden="true">👉</span> {typing ? "Typing…" : "Show me"}</button>}
            {step.hint && <button className="btn btn-text btn-sm" type="button" onClick={() => setHint((h) => !h)}>{hint ? "Hide hint" : "Hint"}</button>}
          </div>
          {hint && step.hint && <p className="hint"><Md text={step.hint} /></p>}
          {feedback && (
            <div className={`alert ${feedback.ok ? "good" : "bad"}`} role="status">
              {feedback.ok ? <b>✓ Step done. </b> : <b>Not yet. </b>}<Md text={feedback.text} />
            </div>
          )}
          {isRead && ranThisStep && !feedback && <div className="alert acc">Seen it? Press Continue.</div>}
          <ol className="lab-steps" aria-label="All steps">
            {steps.map((s, k) => (
              <li key={s.id} className={passed.has(s.id) ? "done" : k === i ? "cur" : ""}>
                <span className="n">{passed.has(s.id) ? "✓" : k + 1}</span>
                <span>{s.say.replace(/\*\*/g, "").slice(0, 70)}{s.say.length > 70 ? "…" : ""}</span>
              </li>
            ))}
          </ol>
          {!user && <p className="note">You're not logged in, so this lab won't be saved.</p>}
        </section>

        <section className="lab-code" aria-label="Code">
          <CodeEditor ref={editor} value={code} onChange={setCode} onRun={() => void run(!isRead)} label="Lab code editor" minHeight={220} />
          <span className="sbx-status faint">{STATUS_TEXT[status]} · Ctrl/⌘ + Enter runs</span>
          {result?.error && (
            <div className="alert bad"><b>{result.error.type}{result.error.line ? ` on line ${result.error.line}` : ""}:</b> {explainError(result.error)}</div>
          )}
          {result && !result.error && result.stdout && <div className="codebox"><div className="code-head"><span>output</span></div><pre className="console" style={{ padding: 12 }}>{result.stdout}</pre></div>}
        </section>

        <section className="lab-vis" aria-label="Visual">
          <span className="label">What your code did, line by line</span>
          {result ? <Visualizer source={editor.current?.getValue() ?? code} result={result} notes={step.notes} compact />
            : <div className="empty">Press <b>Run</b> and every line will play back here: the line that ran, the variables it made or changed, and what it printed.</div>}
        </section>
      </div>
      <div className="lab-foot">
        <button className="btn btn-text" type="button" onClick={goBack} disabled={i === 0}>‹ Back</button>
        <span className="sp" />
        <button className="btn btn-ghost" type="button" onClick={() => void run(false)} disabled={status === "loading" || status === "running"}>▶ Run</button>
        {!isRead && <button className="btn btn-primary" type="button" onClick={() => void run(true)} disabled={status === "loading" || status === "running" || isDone}>
          {isDone ? "✓ Checked" : "Check"}</button>}
        <button className={`btn ${canNext ? "btn-primary" : "btn-ghost"}`} type="button" onClick={() => void goNext()} disabled={!canNext}>
          {i === steps.length - 1 ? "Finish" : isRead ? "Continue" : "Next step"} ›
        </button>
      </div>
    </div>
  );
}
