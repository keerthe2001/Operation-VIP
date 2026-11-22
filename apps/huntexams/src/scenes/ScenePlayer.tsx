import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Scene, SceneStep } from "@/lib/types";

import { ENGINES } from "./engines";

export type SceneHandle = { go: (trackIndex: number) => void };

function visibleSteps(scene: Scene, sw: Record<string, boolean>): SceneStep[] {
  return scene.steps.filter((s) => {
    if (!s.when) return true;
    const neg = s.when.startsWith("!");
    const on = sw[s.when.replace(/^!/, "")] ?? true;
    return neg ? !on : on;
  });
}

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Props = {
  scene: Scene;
  autoplay?: boolean;
  pace?: number;
  onStep?: (step: SceneStep, index: number) => void;
  onFinished?: () => void;
  jump?: { at: number; key: number } | null;
  tag?: string;
};

export function ScenePlayer({ scene, autoplay = true, pace = 3800, onStep, onFinished, jump, tag }: Props) {
  const [sw, setSw] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((scene.switches ?? []).map((s) => [s.id, true])));
  const steps = useMemo(() => visibleSteps(scene, sw), [scene, sw]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);
  const reduce = useMemo(prefersReduced, []);
  const idx = Math.min(i, steps.length - 1);
  const step = steps[idx]!;
  const Engine = ENGINES[scene.engine];

  useEffect(() => { setI(0); finishedRef.current = false; }, [scene]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    onStep?.(step, idx);
    if (idx === steps.length - 1 && !finishedRef.current) {
      finishedRef.current = true;
      onFinished?.();
    }
    // onStep/onFinished are callbacks from the parent; re-running on their identity isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, step]);

  useEffect(() => {
    if (!playing || !visible || hover) return;
    const last = idx >= steps.length - 1;
    const t = window.setTimeout(() => setI(last ? 0 : idx + 1), last ? 6500 : pace);
    return () => window.clearTimeout(t);
  }, [playing, visible, hover, idx, steps.length, pace]);

  const go = useCallback((n: number, pause = true) => {
    setI(Math.max(0, Math.min(steps.length - 1, n)));
    if (pause) setPlaying(false);
  }, [steps.length]);

  useEffect(() => {
    if (!jump) return;
    const n = steps.findIndex((s) => s.at === jump.at);
    go(n < 0 ? 0 : n);
    rootRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.key]);

  const toggleSwitch = (id: string, on: boolean, track: number) => {
    const next = { ...sw, [id]: on };
    setSw(next);
    const ns = visibleSteps(scene, next);
    const n = ns.findIndex((s) => s.at === track);
    setI(n < 0 ? 0 : n);
    setPlaying(true);
  };

  const offTracks = (scene.switches ?? []).filter((s) => !sw[s.id]).map((s) => s.track);
  const seen = new Set(steps.slice(0, idx).map((s) => s.at));
  const tone = step.tone;

  if (!Engine) return <div className="alert bad">Unknown scene engine: {scene.engine}</div>;

  return (
    <div className="scene" ref={rootRef} aria-roledescription="motion scene">
      <div className="scene-top">
        <span className="t">{scene.title}</span>
        {tag && <span className="pill">{tag}</span>}
      </div>
      <div className="track">
        <div className="rail" />
        <div className="fill" style={{ width: `${(step.at / Math.max(1, scene.track.length - 1)) * 84}%` }} />
        <div className="stops" style={{ gridTemplateColumns: `repeat(${scene.track.length}, minmax(0, 1fr))` }}>
          {scene.track.map((t, k) => {
            const cls = [k === step.at ? "cur" : "", seen.has(k) && k !== step.at ? "done" : "", offTracks.includes(k) ? "off" : ""].join(" ");
            return (
              <button key={k} type="button" className={cls} aria-label={`Step: ${t}`} aria-current={k === step.at ? "step" : undefined}
                onClick={() => { const n = steps.findIndex((s) => s.at === k); go(n < 0 ? idx : n); }}>
                <i>{k + 1}</i><span>{t}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <Engine scene={scene} step={step} index={idx} steps={steps} sw={sw} reduce={reduce} />
      </div>
      <div className="caption" aria-live="polite">
        <span className={`k ${tone === "bad" ? "badk" : tone === "good" ? "goodk" : ""}`}>
          Step {idx + 1} of {steps.length} · {scene.track[step.at]}
        </span>
        <p>{step.caption}</p>
      </div>
      <div className="scene-ctl">
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => go(idx - 1)} disabled={idx === 0}>‹ Back</button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => go(idx + 1)} disabled={idx >= steps.length - 1}>Next ›</button>
        <span className="sp" />
        <button className="btn btn-text btn-sm" type="button" onClick={() => { setI(0); setPlaying(true); }}>↺ Replay</button>
      </div>
      {(scene.switches ?? []).length > 0 && (
        <div className="switches">
          <span className="label">Try it: switch something off</span>
          {scene.switches!.map((s) => (
            <label key={s.id} className="switch">
              <input type="checkbox" checked={sw[s.id] ?? true} onChange={(e) => toggleSwitch(s.id, e.target.checked, s.track)} />
              {s.label} <small>{sw[s.id] ? s.label_on : s.label_off}</small>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
