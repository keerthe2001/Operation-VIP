import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";

import { Loading } from "@/components/Layout";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Budget, Skill, User } from "@/lib/types";
import { useTitle } from "@/lib/util";

function safeNext(raw: string | null): string {
  // Only allow same-site relative paths, never "//evil.com" or absolute URLs.
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  useTitle(mode === "login" ? "Log in" : "Create your account");
  const { user, setUser, loading } = useSession();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (user) return <Navigate to={user.profile.onboarded ? safeNext(params.get("next")) : "/onboarding"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (mode === "signup" && !name.trim()) { setErr({ msg: "Tell us your name.", field: "name" }); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr({ msg: "Enter a valid email, like name@example.com.", field: "email" }); return; }
    if (mode === "signup" && password.length < 10) { setErr({ msg: "Use at least 10 characters for your password.", field: "password" }); return; }
    setBusy(true);
    try {
      const u = await api<User>(`/auth/${mode === "login" ? "login" : "register"}`,
        { body: mode === "login" ? { email, password } : { name, email, password } });
      setUser(u);
      nav(u.profile.onboarded ? safeNext(params.get("next")) : "/onboarding", { replace: true });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? { msg: e2.message, field: e2.field } : { msg: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap page">
      <div className="grid2" style={{ alignItems: "center", gap: 48 }}>
        <div className="stack" style={{ gap: 20 }}>
          <span className="label">{mode === "login" ? "Welcome back" : "Create your account"}</span>
          <h1 style={{ fontSize: "clamp(30px,4vw,44px)", lineHeight: 1.05 }}>{mode === "login" ? "Pick up where you left off" : "Start your Agentic AI route"}</h1>
          <p className="muted">Your progress, labs, missions and certificate are saved to your account.</p>
          {mode === "signup" && (
            <ul className="weeklist"><li><span>1 min</span><span>Three quick questions</span></li><li><span>2 min</span><span>Your first motion scene</span></li><li><span>10 min</span><span>Your first guided lab</span></li></ul>
          )}
        </div>
        <form className="card stack" style={{ gap: 18 }} onSubmit={(e) => void submit(e)} noValidate>
          {mode === "signup" && (
            <div className="field"><label htmlFor="name">Name</label>
              <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={err?.field === "name"} /></div>
          )}
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={err?.field === "email"} /></div>
          <div className="field"><label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 10 characters" : ""} aria-invalid={err?.field === "password"} /></div>
          {err && <p className="err" role="alert">{err.msg}</p>}
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
          {mode === "login" ? (
            <div className="row between small"><Link to="/forgot-password" className="muted">Forgot your password?</Link><Link to="/signup">Create an account</Link></div>
          ) : (
            <p className="small muted">Already have an account? <Link to="/login">Log in</Link></p>
          )}
        </form>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  useTitle("Reset your password");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter a valid email."); return; }
    setBusy(true);
    try { setDone((await api<{ message: string }>("/auth/forgot", { body: { email } })).message); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="wrap-narrow page">
      <form className="card stack" onSubmit={(e) => void submit(e)} noValidate>
        <h1 style={{ fontSize: 28 }}>Reset your password</h1>
        <p className="muted">Enter your email and we'll send a link to choose a new password.</p>
        <div className="field"><label htmlFor="f-email">Email</label><input id="f-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {err && <p className="err" role="alert">{err}</p>}
        {done ? <div className="alert good" role="status">{done}</div> : <button className="btn btn-primary" type="submit" disabled={busy}>Send reset link</button>}
        <Link to="/login" className="small muted">Back to log in</Link>
      </form>
    </div>
  );
}

export function ResetPassword() {
  useTitle("Choose a new password");
  const [params] = useSearchParams();
  const { setUser } = useSession();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const token = params.get("token") ?? "";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) { setErr("Use at least 10 characters."); return; }
    try { setUser(await api<User>("/auth/reset", { body: { token, password: pw } })); nav("/dashboard", { replace: true }); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : "Try again."); }
  };
  return (
    <div className="wrap-narrow page">
      <form className="card stack" onSubmit={(e) => void submit(e)} noValidate>
        <h1 style={{ fontSize: 28 }}>Choose a new password</h1>
        {!token && <div className="alert bad">This link is missing its token. Ask for a new reset link.</div>}
        <div className="field"><label htmlFor="r-pw">New password</label><input id="r-pw" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={!token}>Save and log in</button>
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- onboarding */

type Plan = { hours: number; weekly_hours: number; weeks: number; start: string; time_label: string; explain_mode: string };

const SKILLS: { v: Skill; t: string; s: string; ic: string }[] = [
  { v: "beginner", t: "Beginner", s: "New to coding. Non-IT background, or 1st–2nd year.", ic: "🌱" },
  { v: "intermediate", t: "Intermediate", s: "I know some Python. 3rd–4th year, or a fresher.", ic: "🌿" },
  { v: "advanced", t: "Advanced", s: "I already write software at work.", ic: "🌳" },
];
const TIMES: { v: Budget; t: string; s: string; ic: string }[] = [
  { v: "30m", t: "30 minutes a day", s: "About 3.5 hours a week", ic: "⏱" },
  { v: "1h", t: "1 hour a day", s: "About 7 hours a week", ic: "⏱" },
  { v: "2h", t: "2 hours a day", s: "About 14 hours a week", ic: "⏱" },
  { v: "weekends", t: "Weekends only", s: "About 6 hours across Saturday and Sunday", ic: "📅" },
];

export function Onboarding() {
  useTitle("Set up your route");
  const { user, loading, setUser } = useSession();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [skill, setSkill] = useState<Skill | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.profile.skill_level) setSkill(user.profile.skill_level);
    if (user?.profile.time_budget) setBudget(user.profile.time_budget);
  }, [user]);
  useEffect(() => {
    if (step === 3 && skill && budget) {
      void api<Plan>(`/me/plan-preview?skill=${skill}&budget=${budget}`).then(setPlan).catch(() => setPlan(null));
    }
  }, [step, skill, budget]);

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login?next=/onboarding" replace />;

  const finish = async () => {
    setBusy(true);
    setErr("");
    try {
      setUser(await api<User>("/me", { method: "PATCH", body: { skill_level: skill, time_budget: budget, complete_onboarding: true } }));
      nav("/roadmap", { replace: true });
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't save. Try again."); setBusy(false); }
  };

  const Choice = ({ on, onClick, ic, t, s, disabled }: { on: boolean; onClick: () => void; ic: string; t: string; s: string; disabled?: boolean }) => (
    <button type="button" className="choice" aria-pressed={on} onClick={onClick} disabled={disabled}>
      <span className="ic" aria-hidden="true">{ic}</span><span><b>{t}</b><span>{s}</span></span>
      <span className="mono tiny faint">{disabled ? "later" : on ? "✓" : ""}</span>
    </button>
  );

  return (
    <div className="wrap-narrow page">
      <div className="ob-steps" aria-hidden="true">{[0, 1, 2, 3].map((k) => <i key={k} className={k <= step ? "on" : ""} />)}</div>
      {step === 0 && (
        <div className="stack">
          <span className="label">Question 1 of 3</span>
          <h1 className="ob-h">What do you want to become?</h1>
          <p className="muted">We're launching with one route and doing it properly.</p>
          <div className="choices">
            <Choice on ic="🤖" t="Agentic AI Engineer" s="Build apps where AI looks things up, uses tools and takes steps." onClick={() => undefined} />
            <Choice on={false} disabled ic="📊" t="Data Analyst" s="Coming after launch" onClick={() => undefined} />
            <Choice on={false} disabled ic="🧱" t="Full-stack Developer" s="Coming after launch" onClick={() => undefined} />
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="stack">
          <span className="label">Question 2 of 3</span>
          <h1 className="ob-h">Where are you starting from?</h1>
          <p className="muted">Pick the closest. You can change it later, and labs and missions will show what you really know.</p>
          <div className="choices">{SKILLS.map((x) => <Choice key={x.v} on={skill === x.v} onClick={() => setSkill(x.v)} ic={x.ic} t={x.t} s={x.s} />)}</div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <span className="label">Question 3 of 3</span>
          <h1 className="ob-h">How much time can you give?</h1>
          <p className="muted">Be honest. A small steady habit beats a big plan you drop.</p>
          <div className="choices">{TIMES.map((x) => <Choice key={x.v} on={budget === x.v} onClick={() => setBudget(x.v)} ic={x.ic} t={x.t} s={x.s} />)}</div>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <span className="label">Your plan</span>
          <h1 className="ob-h">Here's your route</h1>
          <p className="muted">A starting estimate. It updates as your labs and missions show what you already know.</p>
          {plan ? (
            <>
              <div className="grid3">
                <div className="stat"><b>{plan.weeks}</b><span>weeks at {plan.time_label.toLowerCase()}</span></div>
                <div className="stat"><b>{plan.hours}h</b><span>total learning time</span></div>
                <div className="stat"><b>{plan.weekly_hours}h</b><span>each week</span></div>
              </div>
              <div className="card stack"><span className="label">You start with</span><b style={{ fontSize: 18 }}>{plan.start}</b>
                <p className="muted small">{skill === "beginner" ? "Lessons open in Simple words. Guided labs walk you through code one line at a time." : skill === "advanced" ? "Pass a short diagnostic to skip a level. If it shows gaps, you keep the level." : "Lessons open in Engineer view, with interview-style questions."}</p></div>
            </>
          ) : <Loading label="Building your plan" />}
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row between" style={{ marginTop: 28 }}>
        <button className="btn btn-text" type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} style={{ visibility: step === 0 ? "hidden" : "visible" }}>Back</button>
        {step < 3 ? (
          <button className="btn btn-primary" type="button" onClick={() => setStep((s) => s + 1)} disabled={(step === 1 && !skill) || (step === 2 && !budget)}>Continue</button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => void finish()} disabled={busy}>{busy ? "Saving…" : "Open my roadmap"}</button>
        )}
      </div>
    </div>
  );
}
