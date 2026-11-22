import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { AdSlot, ErrorBox, Loading } from "@/components/Layout";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/session";
import type { Certificate, Curriculum } from "@/lib/types";
import { ENGINE_META, LEVEL_COLOR, useTitle } from "@/lib/util";

import { Pricing } from "./Home";

export function LearnCatalogue() {
  useTitle("All topics");
  const { data, error, loading, reload } = useApi<Curriculum>("/curriculum");
  const [lv, setLv] = useState<number | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const shown = data.levels.filter((l) => lv === null || l.number === lv);
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">See it move</span><h1>Every topic, with its motion scene</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: "62ch" }}>Open any topic to watch its scene for free. Log in to save progress, answer questions for XP, and unlock missions.</p></div></div>
      <div className="row" role="group" aria-label="Filter by level" style={{ marginBottom: 20 }}>
        <button type="button" className={`btn btn-sm ${lv === null ? "btn-primary" : "btn-ghost"}`} onClick={() => setLv(null)}>All</button>
        {data.levels.map((l) => (
          <button key={l.slug} type="button" className={`btn btn-sm ${lv === l.number ? "btn-primary" : "btn-ghost"}`} onClick={() => setLv(l.number)}>
            <span className="dot" style={{ ["--c" as string]: LEVEL_COLOR(l.number) }} />{l.number === 0 ? "Starter" : `L${l.number}`}
          </button>
        ))}
      </div>
      {shown.map((l) => (
        <section key={l.slug} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <span className="dot" style={{ ["--c" as string]: LEVEL_COLOR(l.number), width: 12, height: 12 }} />
            {l.number === 0 ? "Starter" : `Level ${l.number}`} · {l.title}</h2>
          <p className="muted small" style={{ marginBottom: 8 }}>{l.summary}</p>
          <ul className="topics">
            {l.topics.map((t) => (
              <li key={t.slug}><Link to={`/learn/${t.slug}`}>
                <span className="mono tiny faint">{String(t.number).padStart(2, "0")}</span>
                <span><b>{t.title}</b><span className="muted small" style={{ display: "block" }}>{t.summary}</span></span>
                <span className="kinds">
                  {t.engine && <span className="eng" style={{ ["--c" as string]: ENGINE_META[t.engine]?.color }}>{ENGINE_META[t.engine]?.name}</span>}
                  {t.has_code && <span className="kind">code</span>}
                  {t.lab && <span className="kind y">lab</span>}
                </span>
              </Link></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PricingPage() {
  useTitle("Pricing");
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Pricing</span><h1>Learn free. Upgrade when it helps.</h1></div></div>
      <Pricing />
    </div>
  );
}

type GuideMeta = { slug: string; title: string; summary: string; category: string; minutes: number };
type GuideFull = GuideMeta & { body: { sections: { heading?: string; text?: string; bullets?: string[] }[] }; updated_at: string };

export function Guides() {
  useTitle("Guides");
  const { data, error, loading, reload } = useApi<GuideMeta[]>("/guides");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Guides</span><h1>Career guides and explainers</h1></div></div>
      {data.length === 0 ? <div className="empty">No guides published yet.</div> : (
        <div className="postlist">
          {data.map((g) => (
            <Link key={g.slug} to={`/guides/${g.slug}`}>
              <span className="label">{g.category} · {g.minutes} min</span>
              <span><b>{g.title}</b><span style={{ display: "block" }}>{g.summary}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function GuidePage() {
  const { slug = "" } = useParams();
  const { data: g, error, loading, reload } = useApi<GuideFull>(`/guides/${slug}`);
  useTitle(g?.title ?? "Guide");
  if (loading) return <Loading />;
  if (error || !g) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="wrap page">
      <article className="prose">
        <span className="label">{g.category} · {g.minutes} min read</span>
        <h1>{g.title}</h1>
        <p style={{ fontSize: 19 }}>{g.summary}</p>
        {g.body.sections.map((s, k) => (
          <section key={k} className="stack" style={{ gap: 10 }}>
            {s.heading && <h2>{s.heading}</h2>}
            {s.text && s.text.split("\n\n").map((para, j) => <p key={j}>{para}</p>)}
            {s.bullets && <ul>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
            {k === 1 && <AdSlot placement="article_inline" />}
          </section>
        ))}
        <Link className="btn btn-primary" to="/signup" style={{ justifySelf: "start" }}>Start the route free</Link>
      </article>
    </div>
  );
}

export function CertificateCard({ c }: { c: Certificate }) {
  const issued = new Date(c.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="cert" aria-label={`Certificate for ${c.name}`}>
      <div className="top"><span>HUNTEXAMS</span><span>{c.code}</span></div>
      <div className="mid">
        <span className="k">Certificate of completion</span>
        <div className="nm">{c.name}</div>
        <p className="path">completed the <b>{c.path}</b> route on HuntExams</p>
        <div className="proof">
          <span>{c.summary.levels ?? 8} levels passed</span><span>{c.summary.missions ?? 8} missions reviewed</span><span>{c.summary.topics ?? ""} topics practised</span>
        </div>
      </div>
      <div className="bot">
        <div className="lv" aria-hidden="true">{["#c2410c", "#a16207", "#15803d", "#1d4ed8", "#6d28d9", "#be185d", "#0f766e", "#14201a"].map((x) => <i key={x} style={{ background: x }} />)}</div>
        <span>Issued {issued} · verify at {window.location.host}/verify/{c.code}</span>
      </div>
    </div>
  );
}

export function Verify() {
  const { code: initial = "" } = useParams();
  useTitle("Verify a certificate");
  const [code, setCode] = useState(initial);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const check = async (e?: FormEvent) => {
    e?.preventDefault();
    const v = code.trim().toUpperCase();
    setCert(null);
    if (!/^HX-[A-Z]{3}-\d{4}-\d{5}$/.test(v)) { setMsg("Certificate IDs look like HX-AAE-2026-04821."); return; }
    setBusy(true);
    try { setCert(await api<Certificate>(`/certificates/${v}`)); setMsg(""); }
    catch (err) { setMsg(err instanceof ApiError && err.status === 404 ? "No certificate has this ID." : "Couldn't check right now. Try again."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (initial) void check();
    // Run once for a code that arrived in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  return (
    <div className="wrap page stack" style={{ gap: 24 }}>
      <div className="page-head"><div><span className="label">Verify</span><h1>Check a HuntExams certificate</h1></div></div>
      <form className="card stack" onSubmit={(e) => void check(e)} style={{ maxWidth: 520 }} noValidate>
        <div className="field"><label htmlFor="v-code">Certificate ID</label>
          <input id="v-code" className="input mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="HX-AAE-2026-04821" aria-invalid={Boolean(msg)} /></div>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
        {msg && <p className="err" role="alert">{msg}</p>}
      </form>
      {cert && <><div className="alert good"><b>Valid.</b> Issued to {cert.name} for {cert.path}.</div><CertificateCard c={cert} /></>}
    </div>
  );
}

export function Legal({ kind }: { kind: "about" | "privacy" | "terms" }) {
  useTitle(kind === "about" ? "About" : kind === "privacy" ? "Privacy" : "Terms");
  const content = {
    about: { h: "About HuntExams", p: [
      "HuntExams teaches technical skills with short motion scenes, hands-on labs and real projects. Release 1 covers one route: Agentic AI Engineer.",
      "We measure learning by evidence: questions answered, labs completed and missions reviewed against a rubric. Not by videos watched.",
      "HuntExams is built in Chennai, Tamil Nadu, India." ] },
    privacy: { h: "Privacy", p: [
      "We store your name, email, a hash of your password, your onboarding answers and your learning progress so the product works. We don't sell your data.",
      "Python you run in labs executes in your own browser. Code you save in labs is stored with your progress so you can resume.",
      "Project links you submit are visible to reviewers. Certificates show your name and are publicly verifiable by their ID, because that's their purpose.",
      "If ads are enabled in future, Google may use cookies to show them. Learning screens never show ads. Ask us to delete your account at any time." ] },
    terms: { h: "Terms", p: [
      "Use HuntExams to learn. Don't submit work that isn't yours, and don't try to break or overload the service.",
      "Certificates are issued when the configured requirements are met and may be revoked if a submission is found to be copied.",
      "HuntExams certificates are not an external accreditation. Pricing shown for Pro is a plan, not an offer, until payments launch." ] },
  }[kind];
  return (
    <div className="wrap page"><article className="prose"><h1>{content.h}</h1>{content.p.map((x) => <p key={x}>{x}</p>)}</article></div>
  );
}

export function NotFound() {
  useTitle("Not found");
  return (
    <div className="wrap page stack" style={{ justifyItems: "start" }}>
      <span className="label">404</span><h1 style={{ fontSize: 36 }}>This page doesn't exist</h1>
      <p className="muted">The link may be old, or the page moved.</p>
      <Link className="btn btn-primary" to="/">Go home</Link>
    </div>
  );
}
