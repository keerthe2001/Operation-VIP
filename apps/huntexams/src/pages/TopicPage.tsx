import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { ExampleCode, Exercise } from "@/code/CodeSection";
import { ErrorBox, FocusBar, Loading } from "@/components/Layout";
import { QuestionCard, type AnswerResult } from "@/practice/QuestionCard";
import { ScenePlayer } from "@/scenes/ScenePlayer";
import { api } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import type { SceneStep, Topic } from "@/lib/types";
import { ENGINE_META, LEVEL_COLOR, Md, useTitle } from "@/lib/util";

type Tab = "watch" | "read" | "code" | "practice";

export function TopicPage() {
  const { slug = "" } = useParams();
  const { user, celebrate } = useSession();
  const { data: t, error, loading, reload, setData } = useApi<Topic>(`/topics/${slug}`, [user?.id]);
  const [mode, setMode] = useState<"simple" | "eng">(user?.profile.explain_mode ?? "simple");
  const [tab, setTab] = useState<Tab>("watch");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const [jump, setJump] = useState<{ at: number; key: number } | null>(null);
  const watchedSent = useRef(false);
  useTitle(t?.title ?? "Lesson");

  useEffect(() => { setSceneIdx(0); setTab("watch"); setLiveAt(null); watchedSent.current = false; window.scrollTo(0, 0); }, [slug]);
  useEffect(() => { if (user) setMode(user.profile.explain_mode); }, [user]);

  const scene = t?.body.scenes[sceneIdx];
  const onStep = useCallback((s: SceneStep) => { if (sceneIdx === 0) setLiveAt(s.at); }, [sceneIdx]);
  const onFinished = useCallback(async () => {
    if (!user || watchedSent.current || !t || t.progress?.watched) return;
    watchedSent.current = true;
    try {
      const r = await api<{ xp: number; achievements: string[]; state: Topic["progress"] }>(`/topics/${t.slug}/watched`, { method: "POST" });
      celebrate(r);
      setData((d) => (d ? { ...d, progress: d.progress ? { ...d.progress, ...r.state, watched: true } : d.progress } : d));
    } catch { watchedSent.current = false; }
  }, [user, t, celebrate, setData]);

  const onAnswer = useCallback((qid: string, r: AnswerResult) => {
    if (!r.correct || !r.recorded || !r.state) return;
    setData((d) => d && d.progress ? { ...d, progress: { ...d.progress, ...r.state!, passed_ids: [...new Set([...d.progress.passed_ids, qid])] } } : d);
  }, [setData]);

  const passed = useMemo(() => new Set(t?.progress?.passed_ids ?? []), [t]);

  if (loading && !t) return <Loading label="Opening lesson" />;
  if (error || !t) return <ErrorBox error={error ?? { message: "Not found" }} retry={reload} />;
  const b = t.body;
  const color = LEVEL_COLOR(t.level.number);
  const st = t.progress;
  const levelLabel = t.level.number === 0 ? "Starter" : `L${String(t.level.number).padStart(2, "0")}`;

  return (
    <div className="lesson" data-tab={tab}>
      <FocusBar back={{ to: user ? "/roadmap" : "/learn", label: user ? "Roadmap" : "All topics" }}
        crumb={`${levelLabel} · ${t.level.title} / ${t.number} of ${t.count}`}
        right={st?.status === "practised" ? <span className="pill good">practised</span> : <span className="xp">up to +{20 + 5 + b.checks.length * 10} XP</span>} />
      <div className="ltabs" role="tablist" aria-label="Lesson parts">
        {(["watch", "read", "code", "practice"] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {k === "watch" ? "Watch" : k === "read" ? "Read" : k === "code" ? "Code" : "Practise"}
          </button>
        ))}
      </div>
      <div className="lesson-grid">
        <aside className="l-nav" aria-label="Topics in this level">
          <div className="stack" style={{ gap: 8 }}>
            <span className="label" style={{ color }}>{levelLabel} · {t.level.title}</span>
            <ol>
              {t.outline.map((o) => (
                <li key={o.slug}><Link to={`/learn/${o.slug}`} className={o.slug === t.slug ? "cur" : ""}>
                  <span className={`st ${o.slug === t.slug ? "c" : ""}`} />{o.title}</Link></li>
              ))}
            </ol>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">You'll be able to</span>
            <ul>{b.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
        </aside>

        <div className="l-center">
          <div className="l-head">
            <div>
              <span className="label">Topic {t.number} of {t.count} · {b.scenes.length} scene{b.scenes.length > 1 ? "s" : ""} · {t.minutes} min</span>
              <h1>{t.title}</h1>
            </div>
            <div className="seg" role="group" aria-label="Explanation style">
              <button type="button" aria-pressed={mode === "simple"} onClick={() => setMode("simple")}>Simple words</button>
              <button type="button" aria-pressed={mode === "eng"} onClick={() => setMode("eng")}>Engineer view</button>
            </div>
          </div>

          <section className="t-watch" aria-label="Watch">
            {b.scenes.length > 1 && (
              <div className="row" role="tablist" aria-label="Scenes">
                {b.scenes.map((s, k) => (
                  <button key={k} type="button" role="tab" aria-selected={k === sceneIdx} className={`btn btn-sm ${k === sceneIdx ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setSceneIdx(k)}>▶ {s.title}</button>
                ))}
              </div>
            )}
            {scene && (
              <ScenePlayer key={`${t.slug}-${sceneIdx}`} scene={scene} autoplay={user?.profile.autoplay ?? true}
                tag={`${ENGINE_META[scene.engine]?.name ?? scene.engine} scene`} onStep={onStep} onFinished={() => void onFinished()} jump={jump} />
            )}
            <p className="note">
              Plays by itself. Pause any time, tap a step, or use the switch to see what breaks.
              {st && !st.watched && " Watch to the last step to mark it watched."}
            </p>
          </section>

          <section className="t-read readw" aria-label="Read">
            <div className="sh"><h2>Read it</h2><span className="note">the point for the step on screen lights up</span></div>
            <p className="muted">{mode === "eng" && b.intro_eng ? b.intro_eng : b.intro}</p>
            <ol className="points">
              {b.points.map((p, k) => (
                <li key={k} className={p.step !== undefined && liveAt === p.step ? "live" : ""}>
                  <span>{k + 1}</span>
                  <div>
                    <b>{p.title}</b>
                    <p><Md text={mode === "eng" && p.eng ? p.eng : p.text} /></p>
                    {p.step !== undefined && (
                      <button type="button" onClick={() => { setSceneIdx(0); setJump({ at: p.step!, key: Date.now() }); setTab("watch"); }}>▶ Show me in the picture</button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {b.words && b.words.length > 0 && (
              <>
                <span className="label">Words to know</span>
                <div className="words">{b.words.map(([w, d]) => <div key={w}><b>{w}</b><span>{d}</span></div>)}</div>
              </>
            )}
          </section>

          <section className="t-code" aria-label="Code">
            <div className="sh"><h2>Build it</h2><span className="note">real Python, running in your browser</span></div>
            {b.code ? <ExampleCode code={b.code} mode={mode} /> : <p className="muted">This topic is about ideas more than code. The practice questions below check that it made sense.</p>}
            {b.exercise && <Exercise key={t.slug} topic={t.slug} ex={b.exercise} />}
          </section>

          <section className="t-practice" aria-label="Practise">
            <div className="sh"><h2>Prove it</h2>
              <span className="note">{st ? `${st.checks_passed} of ${st.checks_total} passed` : "log in to save progress"}</span>
            </div>
            {st && !st.unlocked && (
              <div className="alert acc">This level unlocks after the previous one. You can still answer, but results won't be saved yet.</div>
            )}
            {b.checks.map((q, k) => (
              <QuestionCard key={`${t.slug}-${q.id}`} topic={t.slug} q={q} index={k} alreadyPassed={passed.has(q.id)} onResult={(r) => onAnswer(q.id, r)} />
            ))}
            {st?.status === "practised" && <div className="alert good"><b>Topic practised.</b> Nice work. {t.lab ? "The guided lab is next." : ""}</div>}
            <div className="row between">
              {t.prev ? <Link className="btn btn-text" to={`/learn/${t.prev}`}>← Previous topic</Link> : <span />}
              {t.lab ? <Link className="btn btn-primary" to={`/lab/${t.lab.slug}`}>Guided lab: {t.lab.title} →</Link>
                : t.next ? <Link className="btn btn-primary" to={`/learn/${t.next}`}>Next topic →</Link>
                  : <Link className="btn btn-primary" to={user ? "/roadmap" : "/signup"}>{user ? "Back to roadmap" : "Save your progress"}</Link>}
            </div>
          </section>
        </div>

        <aside className="l-side" aria-label="This topic">
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">This topic's path</span>
            <ol className="path">
              <li className={st?.watched ? "done" : ""}><a href="#" onClick={(e) => { e.preventDefault(); setTab("watch"); window.scrollTo({ top: 0 }); }}><span>{st?.watched ? "✓" : "▶"}</span>Watch the scene<em>{b.scenes.length}</em></a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); document.querySelector(".t-read")?.scrollIntoView({ behavior: "smooth" }); }}><span>≡</span>Read key points<em>{b.points.length}</em></a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); document.querySelector(".t-code")?.scrollIntoView({ behavior: "smooth" }); }}><span>{"{}"}</span>Code it<em>{b.code ? `${b.code.source.trim().split("\n").length} lines` : "–"}</em></a></li>
              <li className={st?.status === "practised" ? "done" : ""}><a href="#" onClick={(e) => { e.preventDefault(); document.querySelector(".t-practice")?.scrollIntoView({ behavior: "smooth" }); }}><span>{st?.status === "practised" ? "✓" : "?"}</span>Prove it<em>{b.checks.length} Qs</em></a></li>
              {t.lab && <li><Link to={`/lab/${t.lab.slug}`}><span>⚗</span>Guided lab<em>full screen</em></Link></li>}
            </ol>
          </div>
          <div className="tutor"><b>Tip</b><span>{b.scenes[0]?.switches?.length ? `Use "${b.scenes[0].switches[0]!.label}" below the scene to see what changes.` : "Tap any step on the scene's track to replay that moment."}</span></div>
          <div className="tutor"><b>Stuck?</b><span>Switch to {mode === "eng" ? "Simple words" : "Engineer view"} or replay the scene. Every step has its own caption.</span></div>
          {!user && <div className="tutor"><b>Save your progress</b><span><Link to="/signup">Create a free account</Link> to earn XP and unlock missions.</span></div>}
        </aside>
      </div>
    </div>
  );
}
