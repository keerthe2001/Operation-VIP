import { useEffect, useMemo, useState } from "react";

import { highlight } from "@/lib/util";
import { buildFrames, explainError, type VisualFrame } from "@/sandbox/narrate";
import type { RunResult } from "@/sandbox/runner";

type Props = {
  source: string;
  result: RunResult;
  notes?: Record<string, string>;
  /** Start playing automatically (each executed line, one after another). */
  autoplay?: boolean;
  compact?: boolean;
};

/**
 * Line-by-line replay of a real run: the executed line lights up, variables appear and change
 * in boxes, output grows, and a sentence explains what that line just did.
 */
export function Visualizer({ source, result, notes, autoplay = true, compact = false }: Props) {
  const frames: VisualFrame[] = useMemo(() => buildFrames(result.steps ?? [], source, result.error), [result, source]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const lines = source.replace(/\n$/, "").split("\n");
  const f = frames[Math.min(i, frames.length - 1)];

  useEffect(() => { setI(0); setPlaying(autoplay); }, [result, autoplay]);
  useEffect(() => {
    if (!playing || i >= frames.length - 1) { if (i >= frames.length - 1) setPlaying(false); return; }
    const t = window.setTimeout(() => setI((x) => x + 1), frames.length > 60 ? 350 : 1100);
    return () => window.clearTimeout(t);
  }, [playing, i, frames.length]);

  if (!frames.length) {
    return (
      <div className="viz">
        {result.error ? <div className="alert bad"><b>{result.error.type}</b>: {explainError(result.error)}</div>
          : <div className="note">Nothing ran. Write some code and press Run.</div>}
        {result.stdout && <pre className="console">{result.stdout}</pre>}
      </div>
    );
  }
  const cur = f!;
  const note = notes?.[String(cur.line)];
  const lineCls = (n: number) => (cur.line === n ? (cur.error ? "errl" : "sel") : "");

  return (
    <div className="viz" aria-label="Line by line replay">
      <div className="says" aria-live="polite">
        <span className="k">Line {cur.line} · step {Math.min(i, frames.length - 1) + 1} of {frames.length}</span>
        <span>{cur.error ? explainError(cur.error) : cur.says}</span>
        {note && !cur.error && <span className="note-a">{note}</span>}
      </div>
      <div className="viz-ctl">
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPlaying(false); setI((x) => Math.max(0, x - 1)); }} disabled={i === 0}>‹</button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { if (i >= frames.length - 1) setI(0); setPlaying((p) => !p); }}>
          {playing ? "❚❚" : "▶"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPlaying(false); setI((x) => Math.min(frames.length - 1, x + 1)); }} disabled={i >= frames.length - 1}>›</button>
        <input type="range" min={0} max={frames.length - 1} value={Math.min(i, frames.length - 1)} aria-label="Replay position"
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} />
      </div>
      <div className={compact ? "stack" : "viz-grid"} style={{ gap: 12 }}>
        {!compact && (
          <div className="codebox">
            <div className="code-lines">
              {lines.map((l, k) => (
                <div key={k} className={`cl ${lineCls(k + 1)}`}><span className="n">{k + 1}</span><span>{highlight(l)}</span></div>
              ))}
            </div>
          </div>
        )}
        <div className="viz-panel">
          <span className="label">Variables</span>
          <div className="frames">
            {cur.stack.length === 0 && <span className="note">none yet</span>}
            {cur.stack.map((fr, d) => (
              <div className="frame" key={`${fr.name}-${d}`}>
                {cur.stack.length > 1 && <span className="fname">{fr.name === "main" ? "main program" : `inside ${fr.name}()`}</span>}
                <div className="vars">
                  {Object.keys(fr.vars).length === 0 && <span className="note">no variables</span>}
                  {Object.entries(fr.vars).map(([k, v]) => {
                    const changed = d === cur.stack.length - 1 && cur.changed.includes(k);
                    return (
                      <div key={`${k}-${changed ? i : "s"}`} className={`var ${changed ? "changed" : ""}`}>
                        <span className="k">{k}</span>
                        <span className="v">{v.v}<span className="t">{v.t}</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <span className="label">Output</span>
          <pre className={`console ${cur.error ? "err" : ""}`}>
            {cur.out.slice(0, cur.out.length - cur.newOut.length)}<span className="new">{cur.newOut}</span>
            {cur.error && `\n${cur.error.type}: ${cur.error.message}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
