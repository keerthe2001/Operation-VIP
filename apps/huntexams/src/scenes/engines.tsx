import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";

import { Icon } from "@/components/Icon";
import type { Scene, SceneStep } from "@/lib/types";
import { highlight } from "@/lib/util";

export type EngineProps = { scene: Scene; step: SceneStep; index: number; steps: SceneStep[]; sw: Record<string, boolean>; reduce: boolean };

const color = (c: unknown, fallback = "var(--l4)") => (typeof c === "string" ? (c.startsWith("l") || c === "brand" || c === "acc" || c === "bad" ? `var(--${c})` : c) : fallback);

/* ------------------------------------------------------------------ flow */
type Actor = { id: string; label: string; icon: string; x: number; y: number };

function FlowStage({ scene, step, steps, index, sw, reduce }: EngineProps) {
  const actors = (scene.actors as Actor[]) ?? [];
  const byId = Object.fromEntries(actors.map((a) => [a.id, a]));
  const notes: Record<string, string> = {};
  steps.slice(0, index + 1).forEach((s) => Object.assign(notes, (s.notes as Record<string, string>) ?? {}));
  const offActors = new Set((scene.switches ?? []).filter((s) => !sw[s.id]).map((s) => (s as { actor?: string }).actor).filter(Boolean));
  const active = new Set([...(step.active as string[] | undefined ?? []), step.from as string, step.to as string, step.think as string].filter(Boolean));
  const from = byId[step.from as string];
  const to = byId[step.to as string];
  const [pos, setPos] = useState<{ x: number; y: number; go: boolean } | null>(null);
  const clampX = (x: number) => Math.min(78, Math.max(22, x));

  useLayoutEffect(() => {
    if (!from || !to) { setPos(null); return; }
    if (reduce) { setPos({ x: clampX(to.x), y: to.y - 23, go: false }); return; }
    setPos({ x: clampX(from.x), y: from.y - 23, go: false });
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setPos({ x: clampX(to.x), y: to.y - 23, go: true })));
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reduce]);

  return (
    <div className="stage flow">
      {actors.map((a) => (
        <div key={a.id} className={`actor ${active.has(a.id) ? "on" : ""} ${step.think === a.id ? "think" : ""} ${offActors.has(a.id) ? "off" : ""}`}
          style={{ left: `${a.x}%`, top: `${a.y}%` }}>
          <div className="box"><Icon name={a.icon} /></div>
          <span className="nm">{a.label}</span>
          <span className="nt">{notes[a.id] ?? ""}</span>
        </div>
      ))}
      {pos && (
        <div className={`packet ${(step.tone as string) ?? "ask"} ${pos.go ? "go" : ""}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
          {String(step.packet ?? "")}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tokens */
type Group = { role: string; w: string };
function pieces(groups: Group[] | undefined) {
  const out: { w: string; id?: string; role: string }[] = [];
  for (const g of groups ?? []) {
    for (const raw of String(g.w).split("|")) {
      const [w, id] = raw.split("#");
      if (w !== undefined && w !== "") out.push({ w, id, role: g.role });
    }
  }
  return out;
}

function TokensStage({ scene, step, index }: EngineProps) {
  const roles = (scene.roles as Record<string, { label: string; color: string }>) ?? {};
  const capacity = scene.capacity as number | undefined;
  const cells = pieces(step.cells as Group[]);
  const extra = pieces(step.extra as Group[]);
  const prevCount = useRef(0);
  const prevIndex = useRef(-1);
  const grew = index > prevIndex.current;
  const from = grew ? prevCount.current : 0;
  useEffect(() => { prevCount.current = cells.length; prevIndex.current = index; });
  const roleColor = (r: string) => color(roles[r]?.color);

  return (
    <div className="stage free">
      <div className="eng-note">
        <span>{capacity ? `context window · ${capacity} slots` : (step.whole ? "what you typed" : "what the model reads")}</span>
        <span>{capacity ? `${Math.min(cells.length, capacity)} / ${capacity} used` : (step.note as string) ?? `${cells.length} tokens`}</span>
      </div>
      {step.whole ? (
        <div className="wholetext">{cells.map((c) => c.w).join(" ")}</div>
      ) : capacity ? (
        <div className="cells">
          {Array.from({ length: capacity }, (_, k) => {
            const c = cells[k];
            return c ? <span key={`${index}-${k}`} className={`cell t ${k >= from ? "pop" : ""}`} style={{ ["--c" as string]: roleColor(c.role) }}>{c.w}</span>
              : <span key={`e${k}`} className="cell" />;
          })}
        </div>
      ) : (
        <div className="chips">
          {cells.map((c, k) => (
            <span key={`${index}-${k}`} className={`chip ${k >= from ? "pop" : ""}`} style={{ ["--c" as string]: roleColor(c.role) }}>
              <span>{c.w.startsWith(" ") ? <><span className="sp">·</span>{c.w.slice(1)}</> : c.w}</span>
              {c.id && <small>{c.id}</small>}
            </span>
          ))}
        </div>
      )}
      {extra.length > 0 && (
        <>
          <div className="eng-note"><span>{String(step.extra_label ?? "")}</span></div>
          <div className="chips">
            {extra.map((c, k) => <span key={k} className={`xchip pop ${step.extra_tone === "gone" ? "gone" : ""}`}>{c.w}</span>)}
          </div>
        </>
      )}
      <div className="legend">
        {Object.entries(roles).map(([k, r]) => <span key={k} className="eng" style={{ ["--c" as string]: color(r.color) }}>{r.label}</span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bars */
function BarRow({ label, value, max, fmt, grow, picked, dim }: { label: string; value: number; max: number; fmt: string; grow: boolean; picked: boolean; dim: boolean }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setW(grow ? Math.max(0, Math.min(100, (value / max) * 100)) : 0));
    return () => cancelAnimationFrame(r);
  }, [value, max, grow]);
  const text = !grow ? "–" : fmt === "pct" ? `${value * 100 < 1 && value > 0 ? (value * 100).toFixed(1) : Math.round(value * 100)}%` : String(value);
  return (
    <div className={`nrow ${picked ? "pk" : ""} ${dim ? "dim" : ""}`}>
      <span className="w">{label}</span>
      <span className="tr"><i style={{ width: `${w}%` }} /></span>
      <span className="p">{text}</span>
    </div>
  );
}

function boldText(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
}

function BarsStage({ scene, step }: EngineProps) {
  const bars = (step.bars as [string, number][]) ?? [];
  const fmt = (step.format as string) ?? (scene.format as string) ?? "pct";
  const max = (step.max as number) ?? (scene.max as number) ?? (fmt === "pct" ? 1 : Math.max(...bars.map((b) => b[1]), 1));
  const grow = step.grow !== false;
  const pick = step.pick as number | undefined;
  const key = bars.map((b) => b[0]).join("|");
  return (
    <div className="stage free">
      {step.text !== undefined && <div className="nt-ctx">{boldText(String(step.text))}<span className="cur" /></div>}
      <div className="nbars" key={key}>
        {bars.map(([label, v], k) => (
          <BarRow key={label + k} label={label} value={v} max={max} fmt={fmt} grow={grow} picked={pick === k} dim={pick !== undefined && pick !== k} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ space */
type Pt = { label: string; x: number; y: number; group?: string };

function SpaceStage({ scene, step }: EngineProps) {
  const groups = (scene.groups as Record<string, string>) ?? {};
  const points = (scene.points as Pt[]) ?? [];
  const q = scene.query as Pt | undefined;
  const filter = step.filter as string[] | undefined;
  const eligible = points.map((p, k) => ({ p, k })).filter(({ p }) => !filter || filter.includes(p.group ?? ""));
  const dist = (p: Pt) => (q ? Math.hypot(p.x - q.x, p.y - q.y) : 0);
  const ranked = [...eligible].sort((a, b) => dist(a.p) - dist(b.p));
  const topN = (step.top as number) ?? 0;
  const winners = new Set(ranked.slice(0, topN).map((r) => r.k));
  const showQ = Boolean(step.show_query);
  return (
    <div className="stage free">
      <svg className="space-svg" viewBox="0 0 400 240" role="img" aria-label="Points on a map of meaning">
        {q && points.map((p, k) => (
          <line key={`l${k}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y}
            className={`ln ${step.lines && (!filter || filter.includes(p.group ?? "")) ? "show" : ""} ${winners.has(k) ? "win" : ""}`} />
        ))}
        {points.map((p, k) => {
          const dimmed = (filter && !filter.includes(p.group ?? "")) || (topN > 0 && !winners.has(k));
          return (
            <g key={k} className={`pt show ${dimmed ? "dim" : ""}`}>
              <circle cx={p.x} cy={p.y} r={6} fill={color(groups[p.group ?? ""], "var(--l4)")} />
              <text x={p.x + 9} y={p.y + 3}>{p.label}</text>
            </g>
          );
        })}
        {q && (
          <g className="q" style={{ transform: `translate(${q.x}px, ${showQ ? q.y : -40}px)` }}>
            <circle cx={0} cy={0} r={8} fill="var(--acc)" stroke="var(--bg)" strokeWidth={2} />
            <text x={-4} y={24} style={{ fill: "var(--acc)", fontWeight: 700 }}>{q.label}</text>
          </g>
        )}
      </svg>
      {Boolean(step.results) && (
        <div className="res">
          {ranked.slice(0, topN || 3).map(({ p, k }) => (
            <div key={k}><span>{p.label}</span><span>{Math.max(0, 1 - dist(p) / 320).toFixed(2)} closeness</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ slicer */
function chunksFor(text: string, mode: string, size: number, overlap: number): [number, number][] {
  if (mode === "sentences") {
    const sents: [number, number][] = [];
    const re = /[^.!?]+[.!?]+\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) sents.push([m.index, m.index + m[0].length]);
    if (!sents.length) return [[0, text.length]];
    const out: [number, number][] = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      while (j + 1 < sents.length && sents[j + 1]![1] - sents[i]![0] <= size) j++;
      out.push([sents[i]![0], sents[j]![1]]);
      if (j + 1 >= sents.length) break;
      i = overlap > 0 && j > i ? j : j + 1;
    }
    return out;
  }
  const out: [number, number][] = [];
  const stepLen = Math.max(1, size - overlap);
  for (let s = 0; s < text.length; s += stepLen) {
    out.push([s, Math.min(text.length, s + size)]);
    if (s + size >= text.length) break;
  }
  return out;
}

function SlicerStage({ scene, step, sw }: EngineProps) {
  const text = String(scene.text ?? "");
  const hasOv = (scene.switches ?? []).some((s) => s.id === "ov");
  const overlap = hasOv ? (sw.ov ? Number(scene.overlap_on ?? 20) : Number(scene.overlap_off ?? 0)) : Number(scene.overlap ?? 0);
  const ch = chunksFor(text, String(scene.mode ?? "chars"), Number(scene.size ?? 64), overlap);
  const all = step.chunk === "all";
  const k = all ? -1 : Math.min(Number(step.chunk ?? 0), ch.length - 1);
  const cur = k >= 0 ? ch[k]! : null;
  const prev = k > 0 ? ch[k - 1]! : null;
  const doneTo = all ? text.length : cur![0];
  const spans: { cls: string; t: string }[] = [];
  for (let p = 0; p < text.length; p++) {
    let c = "u";
    if (p < doneTo) c = "d";
    if (cur && p >= cur[0] && p < cur[1]) c = prev && p < prev[1] ? "o" : "c";
    const last = spans[spans.length - 1];
    if (last && last.cls === c) last.t += text[p]; else spans.push({ cls: c, t: text[p]! });
  }
  const shown = all ? ch.length : k + 1;
  return (
    <div className="stage free">
      <div className="eng-note">
        <span>{scene.mode === "sentences" ? "whole sentences" : `chunk size ${scene.size} chars`}{overlap ? ` · overlap ${overlap}` : ""}</span>
        <span>{shown} of {ch.length} chunks</span>
      </div>
      <div className="sl-text">{spans.map((s, i) => <span key={i} className={s.cls}>{s.t}</span>)}</div>
      <div className="sl-cards">
        {ch.slice(0, shown).map((c, i) => <span key={i}>chunk {i + 1} · {c[1] - c[0]} chars</span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ graph */
type GNode = { x: number; y: number; label: string };

function GraphStage({ scene, step, index, steps }: EngineProps) {
  const nodes = (scene.nodes as Record<string, GNode>) ?? {};
  const edges = (scene.edges as [string, string][]) ?? [];
  const n = nodes[step.node as string];
  const dim = new Set((step.dim as string[]) ?? []);
  const state = (step.state as Record<string, unknown>) ?? {};
  const prevState = index > 0 ? ((steps[index - 1]!.state as Record<string, unknown>) ?? {}) : {};
  const fmtV = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));
  return (
    <div className="stage free">
      <div className="g-wrap">
        <svg className="g-svg" viewBox="0 0 430 240" role="img" aria-label="A graph of steps">
          {edges.map(([a, b]) => {
            const na = nodes[a];
            const nb = nodes[b];
            if (!na || !nb) return null;
            return <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} className={step.edge === `${a}-${b}` ? "on" : ""} />;
          })}
          {Object.entries(nodes).map(([id, nd]) => (
            <g key={id} className={`nd ${step.node === id ? "on" : ""} ${dim.has(id) ? "dim" : ""}`}>
              <rect x={nd.x - 46} y={nd.y - 17} width={92} height={34} rx={9} />
              <text x={nd.x} y={nd.y}>{nd.label}</text>
            </g>
          ))}
          {n && (
            <g className="tok" style={{ transform: `translate(${n.x}px, ${n.y - 26}px)` }}>
              <circle cx={0} cy={0} r={7} fill="var(--acc)" stroke="var(--bg)" strokeWidth={2} />
            </g>
          )}
        </svg>
        <pre className="gstate" aria-label="State">
          {"state = {\n"}
          {Object.entries(state).map(([k, v], i, arr) => {
            const changed = JSON.stringify(prevState[k]) !== JSON.stringify(v);
            const line = `  ${k}: ${fmtV(v)}${i < arr.length - 1 ? "," : ""}\n`;
            return changed ? <b key={k}>{line}</b> : <span key={k}>{line}</span>;
          })}
          {"}"}
        </pre>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ meter */
function useCount(target: number, reduce: boolean) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduce) { setV(target); from.current = target; return; }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 800);
      setV(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);
  return v;
}

type GaugeDef = { label: string; max: number; format: string; color: string };
function Gauge({ g, value, reduce }: { g: GaugeDef; value: number; reduce: boolean }) {
  const v = useCount(value, reduce);
  const txt = g.format === "ms" ? `${Math.round(v)} ms` : g.format === "inr" ? `₹${v.toFixed(v >= 100 ? 0 : 2)}`
    : g.format === "pct" ? `${Math.round(v)}%` : g.format === "tokens" ? `${Math.round(v)} tok` : `${Math.round(v)}`;
  return (
    <div className="gauge" style={{ ["--c" as string]: color(g.color) }}>
      <span>{g.label}</span>
      <span className="tr"><i style={{ width: `${Math.min(100, (value / g.max) * 100)}%` }} /></span>
      <b>{txt}</b>
    </div>
  );
}

function MeterStage({ scene, step, reduce }: EngineProps) {
  const gauges = (scene.gauges as GaugeDef[]) ?? [];
  const values = (step.values as number[]) ?? [];
  const chips = (step.chips as string[]) ?? [];
  return (
    <div className="stage free">
      {step.log !== undefined && <div className="mlog">{String(step.log)}</div>}
      <div className="gauges">{gauges.map((g, k) => <Gauge key={g.label} g={g} value={values[k] ?? 0} reduce={reduce} />)}</div>
      {chips.length > 0 && <div className="mchips">{chips.map((c) => <span key={c}>{c}</span>)}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ code */
function CodeStage({ scene, step, index, steps }: EngineProps) {
  const lines = String(scene.source ?? "").replace(/\n$/, "").split("\n");
  const vars = (step.vars as Record<string, string>) ?? {};
  const changed = new Set((step.changed as string[]) ?? []);
  const out = String(step.out ?? "");
  const prevOut = index > 0 ? String(steps[index - 1]!.out ?? "") : "";
  const fresh = out.startsWith(prevOut) ? out.slice(prevOut.length) : "";
  return (
    <div className="stage free" style={{ alignContent: "start" }}>
      <div className="viz-grid">
        <div className="codebox">
          <div className="code-lines">
            {lines.map((l, k) => (
              <div key={k} className={`cl ${step.line === k + 1 ? (step.tone === "bad" ? "errl" : "sel") : ""}`}>
                <span className="n">{k + 1}</span><span>{highlight(l)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="viz-panel">
          <span className="label">Variables</span>
          <div className="vars">
            {Object.keys(vars).length === 0 && <span className="note">none yet</span>}
            {Object.entries(vars).map(([k, v]) => (
              <div key={k + (changed.has(k) ? index : "")} className={`var ${changed.has(k) ? "changed" : ""}`}>
                <span className="k">{k}</span><span className="v">{v}</span>
              </div>
            ))}
          </div>
          <span className="label">Output</span>
          <pre className="console">{out.slice(0, out.length - fresh.length)}<span className="new">{fresh}</span></pre>
        </div>
      </div>
    </div>
  );
}

export const ENGINES: Record<string, ComponentType<EngineProps>> = {
  flow: FlowStage, tokens: TokensStage, bars: BarsStage, space: SpaceStage,
  slicer: SlicerStage, graph: GraphStage, meter: MeterStage, code: CodeStage,
};
