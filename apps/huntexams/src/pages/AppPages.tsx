import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { AdSlot, ErrorBox, FocusBar, Loading } from "@/components/Layout";
import { QuestionCard } from "@/practice/QuestionCard";
import { api, ApiError } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import type { Achievement, Certificate, Curriculum, LearnerState, NextActivity, Project, Question, User } from "@/lib/types";
import { LEVEL_COLOR, Md, timeAgo, useTitle } from "@/lib/util";

import { CertificateCard } from "./PublicPages";

export function nextHref(n: NextActivity): string {
  switch (n.kind) {
    case "watch": case "practise": return `/learn/${n.slug}`;
    case "lab": return `/lab/${n.slug}`;
    case "mission": return `/missions/${n.slug}`;
    case "diagnostic": return `/diagnostic/${n.slug}`;
    case "certificate": return "/certificate";
  }
}
const NEXT_VERB = { watch: "Watch", practise: "Practise", lab: "Start lab", mission: "Open mission", diagnostic: "Take diagnostic", certificate: "Claim" } as const;
const lvLabel = (n: number) => (n === 0 ? "Starter" : `L${n}`);

/* ---------------------------------------------------------------- dashboard */

export function Dashboard() {
  useTitle("Dashboard");
  const { user } = useSession();
  const { data: s, error, loading, reload } = useApi<LearnerState>("/me/state");
  const { data: rec } = useApi<{ recent: { kind: string; label: string; at: string }[]; achievements: Achievement[] }>("/me/record");
  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorBox error={error} retry={reload} />;
  const maxMin = Math.max(30, ...s.week.map((d) => d.minutes));
  const weekTotal = s.week.reduce((a, d) => a + d.minutes, 0);
  const curLevel = s.levels.find((l) => !l.optional && l.unlocked && !l.proven) ?? s.levels.find((l) => !l.optional);
  const earned = rec?.achievements.filter((a) => a.earned_at) ?? [];
  const needsWork = s.levels.flatMap((l) => l.topics.filter((t) => t.status === "watched" || t.status === "started").map((t) => ({ ...t, lv: l.number }))).slice(0, 4);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div><span className="label">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
          <h1>Welcome back, {user?.name.split(" ")[0]}</h1></div>
        <div className="row"><span className="xp">{s.xp} XP</span>{s.streak > 0 && <span className="pill cur">🔥 {s.streak}-day streak</span>}</div>
      </div>
      <div className="dash">
        <div className="stack" style={{ gap: 20 }}>
          {s.next ? (
            <div className="card next">
              <div className="row between"><span className="label">Do this next</span>
                {s.next.level !== undefined && <span className="pill" style={{ color: LEVEL_COLOR(s.next.level) }}>{lvLabel(s.next.level)}</span>}</div>
              <h2>{s.next.title}</h2>
              <p className="why">{s.next.why}</p>
              <div className="row">
                <Link className="btn btn-primary btn-lg" to={nextHref(s.next)}>{NEXT_VERB[s.next.kind]} · {s.next.minutes} min</Link>
                <Link className="btn btn-text" to="/roadmap">See the whole route</Link>
              </div>
            </div>
          ) : (
            <div className="card next"><h2>You're all caught up</h2><p className="why">Missions you submitted are waiting for review. We'll show feedback here.</p></div>
          )}
          <div className="card">
            <div className="row between" style={{ marginBottom: 14 }}><h3 style={{ fontSize: 18 }}>This week</h3><span className="note">{weekTotal} minutes learned</span></div>
            <div className="weekbars" role="img" aria-label={`Minutes learned per day this week, ${weekTotal} in total`}>
              {s.week.map((d) => (
                <div key={d.day}><i className={d.minutes ? "" : "zero"} style={{ height: `${Math.max(3, (d.minutes / maxMin) * 100)}px` }} title={`${d.minutes} min`} />
                  <span>{new Date(d.day + "T00:00").toLocaleDateString("en-IN", { weekday: "narrow" })}</span></div>
              ))}
            </div>
            {s.plan && <p className="note" style={{ marginTop: 10 }}>Your goal: {s.plan.time_label.toLowerCase()} · about {s.plan.weekly_hours} h a week</p>}
          </div>
          {needsWork.length > 0 && (
            <div className="card stack">
              <h3 style={{ fontSize: 18 }}>Finish what you started</h3>
              <ul className="topics">{needsWork.map((t) => (
                <li key={t.slug}><Link to={`/learn/${t.slug}`}><span className="st c" /><span>{t.title}</span><span className="note">{t.checks_passed}/{t.checks_total} checks</span></Link></li>
              ))}</ul>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <div className="card stack">
            <div className="row between"><h3 style={{ fontSize: 18 }}>Route progress</h3><span className="note">{s.totals.practised} / {s.totals.topics} topics</span></div>
            <div className="bar"><i style={{ width: `${s.totals.percent}%` }} /></div>
            {curLevel && <p className="small muted">Now in {lvLabel(curLevel.number)} · {curLevel.title}: {curLevel.practised} of {curLevel.topics.length} topics practised</p>}
            <div className="row" style={{ gap: 6 }} aria-label="Levels">
              {s.levels.filter((l) => !l.optional).map((l) => (
                <span key={l.slug} className="dot" title={`L${l.number} ${l.title}`} style={{ ["--c" as string]: LEVEL_COLOR(l.number), opacity: l.proven ? 1 : l.unlocked ? 0.6 : 0.2 }} />
              ))}
            </div>
          </div>
          <div className="card stack">
            <div className="row between"><h3 style={{ fontSize: 18 }}>Recent</h3><Link to="/profile" className="small muted">Profile</Link></div>
            {rec && rec.recent.length > 0 ? (
              <ul className="feed">{rec.recent.slice(0, 6).map((a, k) => <li key={k}><span>{a.label}</span><time>{timeAgo(a.at)}</time></li>)}</ul>
            ) : <p className="muted small">Your activity shows up here once you watch a scene or answer a question.</p>}
          </div>
          <div className="card stack">
            <div className="row between"><h3 style={{ fontSize: 18 }}>Achievements</h3><span className="note">{earned.length} / {rec?.achievements.length ?? 10}</span></div>
            <div className="row" style={{ gap: 8 }}>
              {earned.length ? earned.map((a) => <span key={a.code} className="pill good" title={a.how}>{a.icon} {a.title}</span>) : <p className="muted small">Watch your first scene to earn one.</p>}
            </div>
          </div>
          <AdSlot placement="dashboard_banner" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- roadmap */

export function Roadmap() {
  const { user } = useSession();
  useTitle("Roadmap");
  const { data: s, error, loading, reload } = useApi<LearnerState>(user?.profile.onboarded ? "/me/state" : null, [user?.id]);
  const { data: cur } = useApi<Curriculum>(user?.profile.onboarded ? null : "/curriculum", [user?.id]);
  if (user?.profile.onboarded) {
    if (loading && !s) return <Loading />;
    if (error || !s) return <ErrorBox error={error} retry={reload} />;
  } else if (!cur) return <Loading />;

  const showStarter = !user || user.profile.skill_level === "beginner" || (s?.levels.find((l) => l.optional)?.practised ?? 0) > 0;
  const levels = s ? s.levels.filter((l) => !l.optional || showStarter) : null;

  return (
    <div className="wrap page">
      <div className="page-head">
        <div><span className="label">{s ? "Your route" : "The route"}</span><h1>Agentic AI Engineer</h1>
          {s?.plan && <p className="muted" style={{ marginTop: 6 }}>{s.plan.time_label} · about {s.plan.weeks} weeks · {s.plan.start}</p>}</div>
        {s && <div className="stack" style={{ minWidth: 220, gap: 6 }}>
          <div className="row between small"><span>Overall</span><span className="mono">{s.totals.percent}%</span></div>
          <div className="bar"><i style={{ width: `${s.totals.percent}%` }} /></div></div>}
      </div>
      {!s && cur && (
        <>
          <p className="muted" style={{ marginBottom: 20 }}>{cur.path.summary} <Link to="/signup">Create a free account</Link> to track your progress.</p>
          <ol className="rmap">
            {cur.levels.map((l) => (
              <li key={l.slug} className="rl cur" style={{ ["--c" as string]: LEVEL_COLOR(l.number) }}>
                <span className="node">{l.number === 0 ? "S" : l.number}</span>
                <div className="body">
                  <div className="row between"><h3>{lvLabel(l.number)} · {l.title}</h3><span className="pill">{l.topics.length} topics · ~{l.hours}h</span></div>
                  <p className="muted small">{l.summary}</p>
                  <ul className="topics">{l.topics.map((t) => (
                    <li key={t.slug}><Link to={`/learn/${t.slug}`}><span className="st" /><span>{t.title}</span><span className="kinds"><span className="kind">watch</span>{t.lab && <span className="kind">lab</span>}</span></Link></li>
                  ))}</ul>
                  {l.mission && <p className="small muted">Mission: <b>{l.mission.title}</b></p>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {levels && (
        <ol className="rmap">
          {levels.map((l, idx) => {
            const state = l.proven ? "done" : l.unlocked ? "cur" : "locked";
            const nextTopic = l.topics.find((t) => t.status !== "practised");
            return (
              <li key={l.slug} className={`rl ${state}`} style={{ ["--c" as string]: LEVEL_COLOR(l.number) }}>
                <span className="node">{l.proven ? "✓" : l.number === 0 ? "S" : l.number}</span>
                <div className="body">
                  <div className="row between">
                    <h3>{lvLabel(l.number)} · {l.title}</h3>
                    <span className={`pill ${l.proven ? "good" : l.unlocked ? "cur" : ""}`}>
                      {l.proven ? "proven" : l.unlocked ? `${l.practised} / ${l.topics.length} practised` : `${l.topics.length} topics · ~${l.hours}h`}
                    </span>
                  </div>
                  {l.optional && <p className="small muted">For beginners: the Python you need before Level 1.</p>}
                  {l.unlocked ? (
                    <>
                      <ul className="topics">
                        {l.topics.map((t) => (
                          <li key={t.slug}><Link to={`/learn/${t.slug}`}>
                            <span className={`st ${t.status === "practised" ? "y" : t.status !== "new" ? "c" : ""}`} />
                            <span>{t.title}{t.tested_out ? " · tested out" : ""}</span>
                            <span className="kinds">
                              <span className={`kind ${t.watched ? "y" : ""}`}>watch</span>
                              <span className={`kind ${t.status === "practised" ? "y" : ""}`}>{t.checks_passed}/{t.checks_total}</span>
                              {t.lab && <span className={`kind ${t.lab_done ? "y" : ""}`}>lab</span>}
                            </span>
                          </Link></li>
                        ))}
                      </ul>
                      <div className="row">
                        {nextTopic && <Link className="btn btn-primary btn-sm" to={`/learn/${nextTopic.slug}`}>{l.practised ? "Continue" : "Start"}: {nextTopic.title}</Link>}
                        {l.mission && <Link className="btn btn-ghost btn-sm" to={`/missions/${l.mission.slug}`}>Mission: {l.mission.title}
                          {l.mission.status !== "not_submitted" && ` · ${l.mission.status.replace("_", " ")}`}</Link>}
                        {!l.optional && l.practised === 0 && user?.profile.skill_level !== "beginner" && <Link className="btn btn-text btn-sm" to={`/diagnostic/${l.slug}`}>Test out of this level</Link>}
                      </div>
                    </>
                  ) : (
                    <p className="small faint">Unlocks when every topic in {lvLabel(levels[idx - 1]?.number ?? l.number - 1)} is practised{user?.profile.skill_level === "advanced" ? ", or pass its diagnostic" : ""}. {l.mission && `Mission: ${l.mission.title}.`}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div style={{ marginTop: 28 }}><AdSlot placement="roadmap_inline" /></div>
    </div>
  );
}

/* ---------------------------------------------------------------- practice hub + diagnostic */

export function PracticeHub() {
  useTitle("Practice");
  const { data: s, error, loading, reload } = useApi<LearnerState>("/me/state");
  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorBox error={error} retry={reload} />;
  const open = s.levels.filter((l) => l.unlocked);
  const todo = open.flatMap((l) => l.topics.filter((t) => t.status !== "practised" && t.status !== "new").map((t) => ({ ...t, lv: l.number })));
  const fresh = open.flatMap((l) => l.topics.filter((t) => t.status === "new").map((t) => ({ ...t, lv: l.number }))).slice(0, 6);
  const labs = open.flatMap((l) => l.topics.filter((t) => t.lab).map((t) => ({ ...t, lv: l.number })));
  return (
    <div className="wrap page stack" style={{ gap: 28 }}>
      <div className="page-head"><div><span className="label">Practice</span><h1>Questions, labs and diagnostics</h1></div></div>
      <section className="card stack">
        <h2 style={{ fontSize: 20 }}>Questions to finish</h2>
        {todo.length ? <ul className="topics">{todo.map((t) => (
          <li key={t.slug}><Link to={`/learn/${t.slug}`}><span className="st c" /><span>{t.title}</span><span className="note">{t.checks_passed}/{t.checks_total} · {lvLabel(t.lv)}</span></Link></li>
        ))}</ul> : <p className="muted small">Nothing half-done. Start a new topic below.</p>}
      </section>
      <section className="card stack">
        <h2 style={{ fontSize: 20 }}>Guided labs</h2>
        <ul className="topics">{labs.map((t) => (
          <li key={t.lab}><Link to={`/lab/${t.lab}`}><span className={`st ${t.lab_done ? "y" : ""}`} /><span>{t.title}</span><span className="note">{t.lab_done ? "done" : "full screen"} · {lvLabel(t.lv)}</span></Link></li>
        ))}</ul>
      </section>
      {fresh.length > 0 && <section className="card stack">
        <h2 style={{ fontSize: 20 }}>Up next</h2>
        <ul className="topics">{fresh.map((t) => <li key={t.slug}><Link to={`/learn/${t.slug}`}><span className="st" /><span>{t.title}</span><span className="note">{lvLabel(t.lv)}</span></Link></li>)}</ul>
      </section>}
      <section className="card stack">
        <h2 style={{ fontSize: 20 }}>Diagnostics</h2>
        <p className="muted small">Already know a level? A short diagnostic lets you test out. Score 80% to mark every topic in the level practised.</p>
        <div className="row">{s.levels.filter((l) => !l.optional && l.unlocked && !l.complete).map((l) => (
          <Link key={l.slug} className="btn btn-ghost btn-sm" to={`/diagnostic/${l.slug}`}>{lvLabel(l.number)} · {l.title}</Link>
        ))}</div>
      </section>
    </div>
  );
}

type Diag = { level: { number: number; title: string }; pass_percent: number; questions: (Question & { topic: string })[] };

export function Diagnostic() {
  const { slug = "" } = useParams();
  const { celebrate } = useSession();
  const nav = useNavigate();
  const { data: d, error, loading, reload } = useApi<Diag>(`/levels/${slug}/diagnostic`);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; results: Record<string, boolean>; xp: number } | null>(null);
  const [err, setErr] = useState("");
  useTitle(d ? `Diagnostic: Level ${d.level.number}` : "Diagnostic");
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox error={error} retry={reload} />;
  const all = d.questions.length;
  const answered = Object.keys(answers).length;
  const submit = async () => {
    setErr("");
    try {
      const r = await api<typeof result & object>(`/levels/${slug}/diagnostic`, { body: { answers } });
      setResult(r);
      celebrate({ xp: r.xp });
      window.scrollTo({ top: 0 });
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't submit."); }
  };
  return (
    <>
      <FocusBar back={{ to: "/roadmap", label: "Roadmap" }} crumb={`Diagnostic · Level ${d.level.number} · ${d.level.title}`} />
      <div className="wrap-narrow page stack" style={{ gap: 18 }}>
        <div><span className="label">Diagnostic · {all} questions</span><h1 style={{ fontSize: 30, marginTop: 6 }}>Test out of Level {d.level.number}</h1>
          <p className="muted" style={{ marginTop: 8 }}>Score {d.pass_percent}% or more and every topic in this level is marked practised. Below that, nothing is lost: you keep the level and its lessons.</p></div>
        {result && (
          <div className={`alert ${result.passed ? "good" : "acc"}`} role="status">
            <b>{result.score}%.</b> {result.passed ? "You've tested out of this level. Its mission is still yours to build." : "Not quite 80%. The lessons will fill the gaps quickly."}
            <div className="row" style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" type="button" onClick={() => nav("/roadmap")}>Back to roadmap</button></div>
          </div>
        )}
        {d.questions.map((q, k) => {
          const key = `${q.topic}:${q.id}`;
          return (
            <div key={key} className="stack" style={{ gap: 6 }}>
              {result && <span className={`pill ${result.results[key] ? "good" : "bad"}`} style={{ justifySelf: "start" }}>{result.results[key] ? "correct" : "missed"}</span>}
              <QuestionCard topic={q.topic} q={q} index={k} collect={(a) => setAnswers((x) => ({ ...x, [key]: a }))} />
            </div>
          );
        })}
        {err && <p className="err" role="alert">{err}</p>}
        {!result && <button className="btn btn-primary btn-lg" type="button" disabled={answered < all} onClick={() => void submit()}>
          {answered < all ? `Answer all questions (${answered}/${all})` : "Submit diagnostic"}</button>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- missions */

export function Missions() {
  useTitle("Missions");
  const { data: s, error, loading, reload } = useApi<LearnerState>("/me/state");
  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Missions</span><h1>One real project per level</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: "62ch" }}>Missions are reviewed by a person against a rubric. Passing them proves the level, and every mission counts toward your certificate.</p></div></div>
      <ul className="topics">
        {s.levels.filter((l) => l.mission).map((l) => (
          <li key={l.slug}><Link to={`/missions/${l.mission!.slug}`}>
            <span className="dot" style={{ ["--c" as string]: LEVEL_COLOR(l.number) }} />
            <span><b>{l.mission!.title}</b><span className="muted small" style={{ display: "block" }}>{lvLabel(l.number)} · {l.title}</span></span>
            <span className={`pill ${l.mission!.status === "passed" ? "good" : l.mission!.status === "needs_work" ? "bad" : l.mission!.status === "submitted" ? "cur" : ""}`}>
              {l.unlocked ? l.mission!.status.replace("_", " ").replace("not submitted", "open") : "locked"}</span>
          </Link></li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectPage() {
  const { slug = "" } = useParams();
  const { celebrate } = useSession();
  const { data: p, error, loading, reload, setData } = useApi<Project>(`/projects/${slug}`);
  const [repo, setRepo] = useState("");
  const [demo, setDemo] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useTitle(p?.title ?? "Mission");
  if (loading && !p) return <Loading />;
  if (error || !p) return <ErrorBox error={error} retry={reload} />;
  const done = new Set(p.progress?.milestones_done ?? []);
  const subs = p.progress?.submissions ?? [];
  const latest = subs[0];
  const canSubmit = p.progress?.unlocked && (!latest || latest.status === "needs_work");

  const toggle = async (k: number) => {
    const next = new Set(done);
    if (next.has(String(k))) next.delete(String(k)); else next.add(String(k));
    const arr = [...next].map(Number);
    setData((d) => (d && d.progress ? { ...d, progress: { ...d.progress, milestones_done: arr.map(String) } } : d));
    try { await api(`/projects/${slug}/milestones`, { method: "PUT", body: { done: arr } }); } catch { /* shown on reload */ }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(repo.trim())) { setMsg({ ok: false, text: "Use a GitHub repository link, like https://github.com/you/project" }); return; }
    setBusy(true);
    try {
      const r = await api<{ xp: number; achievements: string[] }>(`/projects/${slug}/submissions`, { body: { repo_url: repo.trim(), demo_url: demo.trim() || null, notes } });
      celebrate(r);
      setMsg({ ok: true, text: "Submitted. A reviewer scores it against the rubric, and you'll see the result here." });
      setRepo(""); setDemo(""); setNotes("");
      void reload();
    } catch (e2) { setMsg({ ok: false, text: e2 instanceof ApiError ? e2.message : "Couldn't submit." }); }
    finally { setBusy(false); }
  };

  return (
    <div className="wrap page">
      <div className="page-head">
        <div style={{ maxWidth: "70ch" }}><span className="label" style={{ color: LEVEL_COLOR(p.level.number) }}>Mission · Level {p.level.number}</span><h1>{p.title}</h1>
          <p className="muted" style={{ marginTop: 8 }}>{p.body.problem}</p></div>
        {latest && <span className={`pill ${latest.status === "passed" ? "good" : latest.status === "needs_work" ? "bad" : "cur"}`}>{latest.status.replace("_", " ")}</span>}
      </div>
      <div className="proj">
        <div className="stack" style={{ gap: 20 }}>
          <div className="card stack"><h3 style={{ fontSize: 18 }}>Requirements</h3>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }} className="muted">{p.body.requirements.map((r) => <li key={r}><Md text={r} /></li>)}</ul></div>
          <div className="card stack"><h3 style={{ fontSize: 18 }}>Milestones</h3>
            <ul className="ms">{p.body.milestones.map((m, k) => (
              <li key={m}><label><input type="checkbox" checked={done.has(String(k))} onChange={() => void toggle(k)} disabled={!p.progress} /><span>{m}</span></label></li>
            ))}</ul></div>
          <div className="card stack"><h3 style={{ fontSize: 18 }}>Rubric</h3>
            <div className="tscroll"><table className="t"><thead><tr><th>Criterion</th><th>Pass means</th><th>Points</th></tr></thead>
              <tbody>{p.body.rubric.map((r) => <tr key={r.name}><td><b>{r.name}</b></td><td className="muted">{r.pass}</td><td className="mono">{latest?.rubric_scores[r.name] !== undefined ? `${latest.rubric_scores[r.name]} / ` : ""}{r.points}</td></tr>)}</tbody></table></div>
            <p className="note">Pass mark: {p.body.pass_mark} of {p.body.rubric.reduce((a, r) => a + r.points, 0)}. A person reviews it. There's no automatic AI grading.</p></div>
        </div>
        <div className="stack" style={{ gap: 20 }}>
          {latest?.feedback && (
            <div className={`card stack ${latest.status === "passed" ? "" : ""}`}><h3 style={{ fontSize: 18 }}>Reviewer feedback</h3>
              <p className="muted">{latest.feedback}</p><span className="mono">{latest.score} / {p.body.rubric.reduce((a, r) => a + r.points, 0)}</span></div>
          )}
          {!p.progress && <div className="card stack"><p className="muted">Log in to track milestones and submit.</p><Link className="btn btn-primary" to="/login">Log in</Link></div>}
          {p.progress && !p.progress.unlocked && <div className="alert acc">This mission unlocks with Level {p.level.number}.</div>}
          {canSubmit && (
            <form className="card stack" onSubmit={(e) => void submit(e)} noValidate>
              <h3 style={{ fontSize: 18 }}>{latest?.status === "needs_work" ? "Resubmit" : "Submit"}</h3>
              <p className="small muted">{p.body.submit}</p>
              <div className="field"><label htmlFor="p-repo">GitHub repository</label><input id="p-repo" className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/you/project" /></div>
              <div className="field"><label htmlFor="p-demo">Demo link (optional)</label><input id="p-demo" className="input" value={demo} onChange={(e) => setDemo(e.target.value)} placeholder="https://…" /></div>
              <div className="field"><label htmlFor="p-notes">Notes for the reviewer</label><textarea id="p-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was hardest? What would you improve?" maxLength={4000} /></div>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
              {!p.progress?.level_complete && <p className="note">Tip: finish the level's topics first. You can still submit now.</p>}
            </form>
          )}
          {msg && <div className={`alert ${msg.ok ? "good" : "bad"}`} role="status">{msg.text}</div>}
          {subs.length > 0 && (
            <div className="card stack"><h3 style={{ fontSize: 18 }}>History</h3>
              <ul className="feed">{subs.map((x) => (
                <li key={x.id}><span><a href={x.repo_url} target="_blank" rel="noreferrer noopener">{x.repo_url.replace("https://github.com/", "")}</a> · {x.status.replace("_", " ")}</span><time>{timeAgo(x.created_at)}</time></li>
              ))}</ul></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- profile + certificate */

export function Profile() {
  useTitle("Profile");
  const { user, setUser, toast, logout } = useSession();
  const { data: s } = useApi<LearnerState>("/me/state");
  const { data: rec } = useApi<{ achievements: Achievement[]; xp_ledger: { reason: string; ref: string; amount: number; at: string }[] }>("/me/record");
  const [name, setName] = useState(user?.name ?? "");
  useEffect(() => setName(user?.name ?? ""), [user]);
  if (!user) return <Loading />;
  const save = async (patch: Partial<{ name: string; skill_level: string; time_budget: string; explain_mode: string; autoplay: boolean }>) => {
    try { setUser(await api<User>("/me", { method: "PATCH", body: patch })); toast("Saved", "✓"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't save"); }
  };
  const practised = s?.totals.practised ?? 0;
  const labsDone = s?.levels.reduce((a, l) => a + l.topics.filter((t) => t.lab_done).length, 0) ?? 0;
  const missions = s?.levels.filter((l) => l.mission?.status === "passed").length ?? 0;
  return (
    <div className="wrap page stack" style={{ gap: 28 }}>
      <div className="row" style={{ gap: 20 }}>
        <span className="avatar" style={{ width: 64, height: 64, borderRadius: 18, fontSize: 26 }}>{user.name.slice(0, 1)}</span>
        <div><h1 style={{ fontSize: 30 }}>{user.name}</h1><p className="muted">{user.email} · Agentic AI Engineer · {user.profile.skill_level ?? "not set"} · {user.plan === "pro" ? "Pro" : "Free plan"}</p></div>
      </div>
      <div className="grid4">
        <div className="stat"><b>{s?.xp ?? 0}</b><span>XP</span></div>
        <div className="stat"><b>{practised}</b><span>topics practised</span></div>
        <div className="stat"><b>{labsDone}</b><span>labs completed</span></div>
        <div className="stat"><b>{missions}</b><span>missions passed</span></div>
      </div>
      <div className="grid2">
        <div className="card stack"><h2 style={{ fontSize: 20 }}>Achievements</h2>
          <div className="badges">{(rec?.achievements ?? []).map((a) => (
            <div key={a.code} className={`badge ${a.earned_at ? "" : "locked"}`} style={{ ["--c" as string]: `var(--${a.tone})` }}>
              <span className="b" aria-hidden="true">{a.icon}</span><b>{a.title}</b><span>{a.earned_at ? `earned ${timeAgo(a.earned_at)}` : a.how}</span></div>
          ))}</div></div>
        <div className="card stack"><h2 style={{ fontSize: 20 }}>Preferences</h2>
          <form className="field" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save({ name }); }}>
            <label htmlFor="pf-name">Name (shown on your certificate)</label>
            <div className="row"><input id="pf-name" className="input grow" style={{ width: "auto" }} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              <button className="btn btn-ghost btn-sm" type="submit">Save</button></div>
          </form>
          <div className="field"><label htmlFor="pf-mode">Explain concepts by default in</label>
            <select id="pf-mode" className="input" value={user.profile.explain_mode} onChange={(e) => void save({ explain_mode: e.target.value })}>
              <option value="simple">Simple words</option><option value="eng">Engineer view</option></select></div>
          <div className="field"><label htmlFor="pf-skill">Starting level</label>
            <select id="pf-skill" className="input" value={user.profile.skill_level ?? ""} onChange={(e) => void save({ skill_level: e.target.value })}>
              <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
          <div className="field"><label htmlFor="pf-time">Daily goal</label>
            <select id="pf-time" className="input" value={user.profile.time_budget ?? ""} onChange={(e) => void save({ time_budget: e.target.value })}>
              <option value="30m">30 minutes a day</option><option value="1h">1 hour a day</option><option value="2h">2 hours a day</option><option value="weekends">Weekends only</option></select></div>
          <label className="switch"><input type="checkbox" checked={user.profile.autoplay} onChange={(e) => void save({ autoplay: e.target.checked })} />Auto-play motion scenes <small>reduced-motion settings are always respected</small></label>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => void logout()} style={{ justifySelf: "start" }}>Log out</button>
        </div>
      </div>
      <div className="card stack"><h2 style={{ fontSize: 20 }}>Recent XP</h2>
        {rec?.xp_ledger.length ? <div className="tscroll"><table className="t"><thead><tr><th>For</th><th>What</th><th>XP</th></tr></thead>
          <tbody>{rec.xp_ledger.map((x, k) => <tr key={k}><td>{x.reason.replaceAll("_", " ")}</td><td className="mono small">{x.ref}</td><td className="mono">+{x.amount}</td></tr>)}</tbody></table></div>
          : <p className="muted small">XP comes from evidence: passing questions, finishing labs, passing code exercises and missions. Opening pages earns nothing.</p>}
      </div>
    </div>
  );
}

export function MyCertificate() {
  useTitle("Certificate");
  const { celebrate } = useSession();
  const { data: s } = useApi<LearnerState>("/me/state");
  const { data: mine, reload } = useApi<{ certificate: Certificate | null }>("/me/certificate");
  const [err, setErr] = useState("");
  if (!s || !mine) return <Loading />;
  const claim = async () => {
    setErr("");
    try { await api("/certificates/claim", { method: "POST" }); celebrate({ achievements: ["certified"] }); void reload(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't issue the certificate."); }
  };
  const required = s.levels.filter((l) => !l.optional);
  return (
    <div className="wrap page stack" style={{ gap: 24 }}>
      <div className="page-head"><div><span className="label">Certificate</span><h1>Agentic AI Engineer</h1></div></div>
      {mine.certificate ? (
        <>
          <CertificateCard c={mine.certificate} />
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn btn-ghost" to={`/verify/${mine.certificate.code}`}>Open the public verification page</Link>
            <button className="btn btn-text" type="button" onClick={() => window.print()}>Print or save as PDF</button>
          </div>
        </>
      ) : (
        <div className="card stack">
          <p className="muted">The certificate is issued when every level is proven: all topics practised and the level's mission passed by a reviewer.</p>
          <ul className="topics">{required.map((l) => (
            <li key={l.slug}><Link to={l.mission ? `/missions/${l.mission.slug}` : "/roadmap"}>
              <span className={`st ${l.proven ? "y" : l.unlocked ? "c" : ""}`} /><span>L{l.number} · {l.title}</span>
              <span className="note">{l.practised}/{l.topics.length} topics · mission {l.mission?.status.replace("_", " ") ?? "–"}</span></Link></li>
          ))}</ul>
          {s.certificate.eligible ? <button className="btn btn-primary" type="button" onClick={() => void claim()}>Claim my certificate</button>
            : <p className="note">{required.filter((l) => l.proven).length} of {required.length} levels proven.</p>}
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
