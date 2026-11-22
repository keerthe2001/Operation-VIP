import { useRef, useState } from "react";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { TopicBody } from "@/lib/types";
import { highlight, Md } from "@/lib/util";
import { explainError } from "@/sandbox/narrate";
import { sandbox, type RunResult } from "@/sandbox/runner";

import { CodeEditor, type EditorHandle } from "./CodeEditor";
import { STATUS_TEXT, useSandboxStatus } from "./useSandbox";
import { Visualizer } from "./Visualizer";

let firstRunReported = false;

export async function reportRun(loggedIn: boolean, celebrate: (r: { xp?: number; achievements?: string[] }) => void) {
  if (!loggedIn || firstRunReported) return;
  firstRunReported = true;
  try { celebrate(await api("/events", { body: { kind: "code_run" } })); } catch { firstRunReported = false; }
}

/** Worked example: tap a line for its explanation, or run it and watch every line execute. */
export function ExampleCode({ code, mode }: { code: NonNullable<TopicBody["code"]>; mode: "simple" | "eng" }) {
  const { user, celebrate } = useSession();
  const status = useSandboxStatus();
  const [sel, setSel] = useState<number | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [err, setErr] = useState("");
  const lines = code.source.replace(/\n$/, "").split("\n");
  const noteFor = (n: number) => code.notes?.[String(n)]?.[mode === "eng" ? 1 : 0];
  const notes = Object.fromEntries(Object.keys(code.notes ?? {}).map((k) => [k, noteFor(Number(k)) ?? ""]));

  const run = async () => {
    setErr("");
    try {
      const r = await sandbox.run({ src: code.source, trace: true });
      setResult(r);
      void reportRun(Boolean(user), celebrate);
    } catch {
      setErr("Python couldn't run in this browser. Try reloading the page.");
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="codebox">
        <div className="code-head"><span>{code.file}</span><span>tap any line</span></div>
        <div className="code-lines">
          {lines.map((l, k) => (
            <button key={k} type="button" className={`cl ${sel === k + 1 ? "sel" : ""}`} aria-pressed={sel === k + 1}
              onClick={() => setSel(k + 1)}>
              <span className="n">{k + 1}</span><span>{highlight(l)}</span>
            </button>
          ))}
        </div>
        <div className="code-explain" aria-live="polite">
          {sel ? <><b>Line {sel}:</b> {noteFor(sel) ?? (lines[sel - 1]?.trim() ? "This line supports the ones around it." : "A blank line, just for readability.")}</> : "Tap a line to see what it does, or run the whole thing and watch each line."}
        </div>
        <div className="code-bar">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => void run()} disabled={status === "loading" || status === "running"}>
            ▶ Run and watch each line
          </button>
          <span className="sp" />
          <span className="sbx-status">{STATUS_TEXT[status]}</span>
        </div>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {result && <Visualizer source={code.source} result={result} notes={notes} />}
    </div>
  );
}

/** Exercise: write code, run it, and let tests (in the sandbox) check it. */
export function Exercise({ topic, ex }: { topic: string; ex: NonNullable<TopicBody["exercise"]> }) {
  const { user, celebrate } = useSession();
  const status = useSandboxStatus();
  const editor = useRef<EditorHandle>(null);
  const [code, setCode] = useState(ex.starter);
  const [result, setResult] = useState<RunResult | null>(null);
  const [fails, setFails] = useState(0);
  const [passed, setPassed] = useState(false);
  const [showSol, setShowSol] = useState(false);
  const [err, setErr] = useState("");
  const busy = status === "loading" || status === "running";

  const run = async (withTests: boolean) => {
    setErr("");
    try {
      const r = await sandbox.run({ src: code, trace: true, tests: withTests ? ex.tests : null });
      setResult(r);
      void reportRun(Boolean(user), celebrate);
      if (withTests && r.test) {
        if (r.test.passed) {
          setPassed(true);
          if (user) {
            try { celebrate(await api("/events", { body: { kind: "code_exercise_passed", topic } })); } catch { /* offline: progress not saved */ }
          }
        } else setFails((f) => f + 1);
      }
    } catch {
      setErr("Python couldn't run in this browser. Try reloading the page.");
    }
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="card card-tight" style={{ margin: 0 }}><span className="label" style={{ display: "block", marginBottom: 6 }}>Your turn</span><Md text={ex.prompt} /></p>
      <CodeEditor ref={editor} value={ex.starter} onChange={setCode} onRun={() => void run(false)} label="Exercise code editor" />
      <div className="row">
        <button className="btn btn-ghost" type="button" onClick={() => void run(false)} disabled={busy}>▶ Run</button>
        <button className="btn btn-primary" type="button" onClick={() => void run(true)} disabled={busy}>Check my code</button>
        <button className="btn btn-text btn-sm" type="button" onClick={() => { editor.current?.setValue(ex.starter); setResult(null); }}>Reset</button>
        {fails >= 2 && !passed && <button className="btn btn-text btn-sm" type="button" onClick={() => setShowSol((s) => !s)}>{showSol ? "Hide" : "Show"} a solution</button>}
        <span className="sbx-status faint">{STATUS_TEXT[status]}</span>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {result?.test && (
        <div className={`alert ${result.test.passed ? "good" : "bad"}`} role="status">
          {result.test.passed ? <><b>All checks passed.</b> {user ? "Saved to your progress." : "Log in to save this."}</> : <><b>Not yet:</b> {result.test.message}</>}
        </div>
      )}
      {result?.error && !result.test?.passed && <div className="alert bad"><b>{result.error.type}{result.error.line ? ` on line ${result.error.line}` : ""}:</b> {explainError(result.error)}</div>}
      {showSol && (
        <div className="codebox">
          <div className="code-head"><span>one possible solution</span>
            <button className="btn btn-text btn-sm" type="button" onClick={() => editor.current?.setValue(ex.solution)} style={{ color: "#c7d5cc" }}>Use it</button></div>
          <div className="code-lines">{ex.solution.replace(/\n$/, "").split("\n").map((l, k) => <div key={k} className="cl"><span className="n">{k + 1}</span><span>{highlight(l)}</span></div>)}</div>
        </div>
      )}
      {result && (result.steps?.length ?? 0) > 0 && <Visualizer source={code} result={result} autoplay={false} />}
    </div>
  );
}
