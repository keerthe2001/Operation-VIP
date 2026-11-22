import { useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Question, TopicState } from "@/lib/types";
import { highlight, Md } from "@/lib/util";

export type AnswerResult = { correct: boolean; explain: string; hint: string; xp: number; recorded: boolean;
  locked: boolean; achievements: string[]; state?: TopicState };

const TYPE_LABEL: Record<Question["type"], string> = {
  predict: "Predict", mcq: "Choose one", multi: "Pick all that apply", order: "Put in order",
  fill: "Fill the blank", debug: "Find the bug", tune: "Tune it",
};

function softmax(logits: number[], t: number) {
  const s = logits.map((x) => x / Math.max(t, 1e-6));
  const m = Math.max(...s);
  const e = s.map((x) => Math.exp(x - m));
  const tot = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / tot);
}

type Props = {
  topic: string;
  q: Question;
  index?: number;
  alreadyPassed?: boolean;
  /** Grade without calling the topic endpoint (used by diagnostics, which grade in one batch). */
  collect?: (answer: unknown) => void;
  onResult?: (r: AnswerResult) => void;
};

export function QuestionCard({ topic, q, index, alreadyPassed, collect, onResult }: Props) {
  const { celebrate, user } = useSession();
  const [choice, setChoice] = useState<number | null>(null);
  const [multi, setMulti] = useState<Set<number>>(new Set());
  const [order, setOrder] = useState<string[]>(() => q.items ?? []);
  const [fill, setFill] = useState("");
  const [line, setLine] = useState<number | null>(null);
  const range = q.range ?? [0.1, 2];
  const [temp, setTemp] = useState(1);
  const [tries, setTries] = useState(0);
  const [res, setRes] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showHint, setShowHint] = useState(false);
  const probs = useMemo(() => (q.type === "tune" && q.logits ? softmax(q.logits, temp) : []), [q, temp]);
  const done = res?.correct ?? false;

  const answer = (): unknown => {
    switch (q.type) {
      case "predict": case "mcq": return choice;
      case "multi": return [...multi].sort();
      case "order": return order;
      case "fill": return fill || null;
      case "debug": return line;
      case "tune": return temp;
    }
  };
  const ready = (() => {
    const a = answer();
    return a !== null && a !== undefined && !(Array.isArray(a) && a.length === 0);
  })();

  const submit = async () => {
    if (!ready) { setErr("Pick an answer first."); return; }
    setErr("");
    if (collect) { collect(answer()); setRes({ correct: true, explain: "Saved. Results come at the end.", hint: "", xp: 0, recorded: false, locked: false, achievements: [] }); return; }
    setBusy(true);
    try {
      const r = await api<AnswerResult>(`/topics/${topic}/answer`, { body: { question_id: q.id, answer: answer() } });
      setTries((t) => t + 1);
      setRes(r);
      if (r.correct) celebrate(r);
      onResult?.(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't check your answer.");
    } finally {
      setBusy(false);
    }
  };

  const optCls = (_k: number, selected: boolean) => {
    if (!res || collect) return "";
    if (res.correct && selected) return "right";
    if (!res.correct && selected) return "wrong";
    return "";
  };

  const codeLines = (q.code ?? "").replace(/\n$/, "").split("\n");
  const move = (k: number, d: number) => {
    const j = k + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[k], next[j]] = [next[j]!, next[k]!];
    setOrder(next);
    setRes(null);
  };

  return (
    <div className="q" data-qid={q.id}>
      <div className="row between">
        <span className="label">{index !== undefined ? `Question ${index + 1} · ` : ""}{TYPE_LABEL[q.type]}</span>
        {alreadyPassed && !res ? <span className="pill good">passed</span> : <span className="xp">+10 XP</span>}
      </div>
      <p className="qp"><Md text={q.prompt} /></p>

      {(q.type === "predict" || q.type === "mcq") && (
        <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Options">
          {q.options!.map((o, k) => (
            <button key={k} type="button" role="radio" aria-checked={choice === k} aria-pressed={choice === k}
              className={`opt ${optCls(k, choice === k)}`} disabled={done && !collect} onClick={() => { setChoice(k); setRes(null); }}>
              <Md text={o} />
            </button>
          ))}
        </div>
      )}

      {q.type === "multi" && (
        <div className="stack" style={{ gap: 8 }}>
          {q.options!.map((o, k) => {
            const on = multi.has(k);
            return (
              <button key={k} type="button" aria-pressed={on} className={`opt ${optCls(k, on)}`} disabled={done && !collect}
                onClick={() => { const n = new Set(multi); if (on) n.delete(k); else n.add(k); setMulti(n); setRes(null); }}>
                <span className="box">{on ? "✓" : ""}</span><Md text={o} />
              </button>
            );
          })}
        </div>
      )}

      {q.type === "order" && (
        <div className={`ord ${done && !collect ? "right" : ""}`}>
          {order.map((it, k) => (
            <div key={it}>
              <span className="n">{k + 1}</span><span>{it}</span>
              <span className="row" style={{ gap: 4 }}>
                <button type="button" aria-label={`Move "${it}" up`} onClick={() => move(k, -1)} disabled={k === 0 || (done && !collect)}>↑</button>
                <button type="button" aria-label={`Move "${it}" down`} onClick={() => move(k, 1)} disabled={k === order.length - 1 || (done && !collect)}>↓</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {q.type === "fill" && (
        <div className="codebox">
          <div className="code-lines">
            {codeLines.map((l, k) => {
              const parts = l.split("____");
              return (
                <div key={k} className="cl"><span className="n">{k + 1}</span>
                  <span>
                    {parts.length > 1 ? (
                      <>{highlight(parts[0]!)}
                        <select aria-label="Fill the blank" value={fill} onChange={(e) => { setFill(e.target.value); setRes(null); }} disabled={done && !collect}>
                          <option value="">choose…</option>
                          {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                        {highlight(parts.slice(1).join("____"))}</>
                    ) : highlight(l)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {q.type === "debug" && (
        <div className="codebox">
          <div className="code-head"><span>tap the line with the bug</span></div>
          <div className="code-lines">
            {codeLines.map((l, k) => {
              const sel = line === k + 1;
              const cls = sel ? (res && !collect ? (res.correct ? "fixd" : "bug") : "sel") : "";
              return (
                <button key={k} type="button" className={`cl ${cls}`} aria-pressed={sel} disabled={done && !collect}
                  onClick={() => { setLine(k + 1); setRes(null); }}>
                  <span className="n">{k + 1}</span><span>{highlight(l)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {q.type === "tune" && q.logits && (
        <div className="stack" style={{ gap: 10 }}>
          <label className="field">
            <span className="row between"><span className="lbl">Temperature</span><span className="mono">{temp.toFixed(1)}</span></span>
            <input type="range" min={range[0]} max={range[1]} step={0.1} value={temp} disabled={done && !collect}
              onChange={(e) => { setTemp(Number(e.target.value)); setRes(null); }} style={{ accentColor: "var(--acc)" }} />
          </label>
          <div className="nbars">
            {probs.map((p, k) => (
              <div key={k} className={`nrow ${k === q.target ? "pk" : ""}`}>
                <span className="w">{q.labels?.[k]}</span>
                <span className="tr"><i style={{ width: `${p * 100}%` }} /></span>
                <span className="p">{(p * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        {!done || collect ? (
          <button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={busy || Boolean(collect && res)}>
            {busy ? "Checking…" : collect ? (res ? "Saved" : "Save answer") : "Check"}
          </button>
        ) : null}
        {!collect && !done && q.hint && <button className="btn btn-text" type="button" onClick={() => setShowHint(true)}>Show a hint</button>}
        {tries > 0 && !collect && <span className="note">Attempts: {tries}</span>}
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {showHint && q.hint && !done && <p className="hint"><Md text={q.hint} /></p>}
      {res && !collect && (
        <div className="fb" aria-live="polite">
          {res.correct ? (
            <p>{res.xp > 0 && <span className="xp">+{res.xp} XP</span>}<strong style={{ color: "var(--brand)" }}>Correct. </strong><Md text={res.explain} /></p>
          ) : (
            <p className="hint"><strong>Not yet.</strong> {res.hint ? <Md text={res.hint} /> : "Change your answer and check again."}</p>
          )}
          {res.locked && <p className="note">Answer checked, but not saved: this level unlocks when you finish the one before it.</p>}
          {!user && res.correct && <p className="note">Log in to save your progress and earn XP.</p>}
        </div>
      )}
    </div>
  );
}
