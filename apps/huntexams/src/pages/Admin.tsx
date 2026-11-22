import { useEffect, useState } from "react";
import { Link, NavLink, useParams } from "react-router";

import { ErrorBox, Loading } from "@/components/Layout";
import { ScenePlayer } from "@/scenes/ScenePlayer";
import { api, ApiError } from "@/lib/api";
import { useApi, useSession } from "@/lib/session";
import type { Scene } from "@/lib/types";
import { timeAgo, useTitle } from "@/lib/util";

const KINDS = ["topic", "lab", "project", "guide"] as const;

function AdminTabs() {
  const tabs = [["/admin", "Overview"], ["/admin/content/topic", "Content"], ["/admin/reviews", "Mission reviews"], ["/admin/ads", "Ads"], ["/admin/users", "Users"], ["/admin/audit", "Audit log"]];
  return <nav className="admin-tabs" aria-label="Admin">{tabs.map(([to, l]) => <NavLink key={to} to={to!} end={to === "/admin"} className={({ isActive }) => (isActive ? "on" : "")}>{l}</NavLink>)}</nav>;
}

export function AdminOverview() {
  useTitle("Admin");
  const { data, error, loading, reload } = useApi<Record<string, number>>("/admin/overview");
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Admin</span><h1>Overview</h1></div></div>
      <AdminTabs />
      {loading ? <Loading /> : error || !data ? <ErrorBox error={error} retry={reload} /> : (
        <div className="grid4">
          <div className="stat"><b>{data.learners}</b><span>learners</span></div>
          <div className="stat"><b>{data.topics}</b><span>topics ({data.topics_draft} draft)</span></div>
          <div className="stat"><b>{data.labs}</b><span>guided labs</span></div>
          <div className="stat"><b>{data.to_review}</b><span><Link to="/admin/reviews">missions to review</Link></span></div>
        </div>
      )}
    </div>
  );
}

type Row = { id: number; slug: string; title: string; status: string; version: number | null; level: number | null; number: number | null; updated_at: string };

export function AdminContent() {
  const { kind = "topic" } = useParams();
  useTitle("Admin · Content");
  const { data, error, loading, reload } = useApi<Row[]>(`/admin/content?kind=${kind}`, [kind]);
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Admin</span><h1>Content</h1>
        <p className="muted" style={{ marginTop: 6 }}>Every lesson, lab, mission and guide is structured data. Edit, preview, then publish.</p></div></div>
      <AdminTabs />
      <div className="row" style={{ marginBottom: 16 }}>{KINDS.map((k) => <Link key={k} to={`/admin/content/${k}`} className={`btn btn-sm ${k === kind ? "btn-primary" : "btn-ghost"}`}>{k}s</Link>)}</div>
      {loading ? <Loading /> : error || !data ? <ErrorBox error={error} retry={reload} /> : (
        <div className="tscroll"><table className="t">
          <thead><tr><th>{kind === "topic" ? "Level · #" : "Slug"}</th><th>Title</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>
              <td className="mono small">{kind === "topic" ? `L${r.level} · ${r.number}` : r.slug}</td>
              <td>{r.title}</td>
              <td><span className={`pill ${r.status === "published" ? "good" : ""}`}>{r.status}{r.version ? ` · v${r.version}` : ""}</span></td>
              <td className="small faint">{timeAgo(r.updated_at)}</td>
              <td><Link className="btn btn-ghost btn-sm" to={`/admin/edit/${kind}/${r.id}`}>Edit</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

type Doc = { id: number; slug: string; title: string; status: string; summary: string | null; minutes: number | null; version: number | null; body: Record<string, unknown> };

export function AdminEdit() {
  const { kind = "topic", id = "" } = useParams();
  const { toast } = useSession();
  const { data, error, loading, reload } = useApi<Doc>(`/admin/content/${kind}/${id}`);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [minutes, setMinutes] = useState<number | "">("");
  const [json, setJson] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Scene | null>(null);
  useTitle(`Edit ${kind}`);
  useEffect(() => {
    if (!data) return;
    setTitle(data.title); setSummary(data.summary ?? ""); setMinutes(data.minutes ?? "");
    setJson(JSON.stringify(data.body, null, 2));
  }, [data]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;

  const parse = (): Record<string, unknown> | null => {
    try { return JSON.parse(json) as Record<string, unknown>; } catch (e) { setErr(`The body isn't valid JSON: ${(e as Error).message}`); return null; }
  };
  const save = async (status: "draft" | "published") => {
    setErr("");
    const body = parse();
    if (!body) return;
    try {
      await api(`/admin/content/${kind}/${id}`, { method: "PUT", body: { title, summary: summary || null, minutes: minutes === "" ? null : minutes, status, body } });
      toast(status === "published" ? "Published" : "Saved as draft", "✓");
      void reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't save."); }
  };
  const doPreview = () => {
    setErr("");
    const body = parse();
    const sc = (body?.scenes as Scene[] | undefined)?.[0];
    if (sc) setPreview({ ...sc }); else setErr("This document has no scenes to preview.");
  };

  return (
    <div className="wrap page stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div><span className="label">Edit {kind} · {data.slug}</span><h1>{data.title}</h1></div>
        <div className="row"><span className={`pill ${data.status === "published" ? "good" : ""}`}>{data.status}{data.version ? ` · v${data.version}` : ""}</span>
          {kind === "topic" && <Link className="btn btn-ghost btn-sm" to={`/learn/${data.slug}`}>Open live</Link>}</div>
      </div>
      <AdminTabs />
      <div className="grid2">
        <div className="stack">
          <div className="field"><label htmlFor="a-title">Title</label><input id="a-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          {data.summary !== null && <div className="field"><label htmlFor="a-sum">Summary</label><input id="a-sum" className="input" value={summary} onChange={(e) => setSummary(e.target.value)} /></div>}
          {data.minutes !== null && <div className="field"><label htmlFor="a-min">Minutes</label><input id="a-min" className="input" type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : "")} /></div>}
          <div className="field"><label htmlFor="a-body">Body (structured JSON, validated on save)</label>
            <textarea id="a-body" className="input json-ed" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} /></div>
          {err && <div className="alert bad" role="alert">{err}</div>}
          <div className="row">
            <button className="btn btn-ghost" type="button" onClick={() => void save("draft")}>Save as draft</button>
            <button className="btn btn-primary" type="button" onClick={() => void save("published")}>Publish</button>
            {kind === "topic" && <button className="btn btn-text" type="button" onClick={doPreview}>Preview scene</button>}
          </div>
          <p className="note">Drafts are hidden from learners. Every save is recorded in the audit log.</p>
        </div>
        <div className="stack">
          <span className="label">Preview</span>
          {preview ? <ScenePlayer key={JSON.stringify(preview).length + Math.random()} scene={preview} tag="preview" /> : <div className="empty">Press Preview scene to play the first scene from the JSON on the left.</div>}
        </div>
      </div>
    </div>
  );
}

type Sub = { id: string; learner: string; email: string; project: string; rubric: { name: string; points: number; pass: string }[]; pass_mark: number;
  repo_url: string; demo_url: string | null; notes: string; status: string; score: number | null; created_at: string };

function ReviewCard({ s, onDone }: { s: Sub; onDone: () => void }) {
  const { toast } = useSession();
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(s.rubric.map((r) => [r.name, 0])));
  const [fb, setFb] = useState("");
  const [err, setErr] = useState("");
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const submit = async () => {
    setErr("");
    if (!fb.trim()) { setErr("Write feedback the learner can act on."); return; }
    try {
      const r = await api<{ status: string; score: number }>(`/admin/submissions/${s.id}/review`, { body: { scores, feedback: fb } });
      toast(`Reviewed: ${r.status.replace("_", " ")} (${r.score})`, "✓");
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Couldn't save."); }
  };
  return (
    <div className="card stack">
      <div className="row between"><div><b>{s.project}</b><div className="small muted">{s.learner} · {s.email} · {timeAgo(s.created_at)}</div></div>
        <span className={`pill ${total >= s.pass_mark ? "good" : "bad"}`}>{total} / {s.rubric.reduce((a, r) => a + r.points, 0)} · pass {s.pass_mark}</span></div>
      <div className="small"><a href={s.repo_url} target="_blank" rel="noreferrer noopener">{s.repo_url}</a>{s.demo_url && <> · <a href={s.demo_url} target="_blank" rel="noreferrer noopener">demo</a></>}</div>
      {s.notes && <p className="muted small">"{s.notes}"</p>}
      <div className="tscroll"><table className="t"><tbody>{s.rubric.map((r) => (
        <tr key={r.name}><td><b>{r.name}</b><div className="small faint">{r.pass}</div></td>
          <td style={{ width: 120 }}><input className="input" type="number" min={0} max={r.points} value={scores[r.name]} aria-label={`${r.name} score`}
            onChange={(e) => setScores({ ...scores, [r.name]: Math.max(0, Math.min(r.points, Number(e.target.value) || 0)) })} /></td>
          <td className="mono small">/ {r.points}</td></tr>
      ))}</tbody></table></div>
      <div className="field"><label htmlFor={`fb-${s.id}`}>Feedback for the learner</label><textarea id={`fb-${s.id}`} className="input" value={fb} onChange={(e) => setFb(e.target.value)} /></div>
      {err && <p className="err">{err}</p>}
      <button className="btn btn-primary" type="button" onClick={() => void submit()} style={{ justifySelf: "start" }}>Save review</button>
    </div>
  );
}

export function AdminReviews() {
  useTitle("Admin · Reviews");
  const { data, error, loading, reload } = useApi<Sub[]>("/admin/submissions");
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Admin</span><h1>Mission reviews</h1></div></div>
      <AdminTabs />
      {loading ? <Loading /> : error || !data ? <ErrorBox error={error} retry={reload} /> :
        data.length === 0 ? <div className="empty">No missions waiting for review.</div> :
          <div className="stack">{data.map((s) => <ReviewCard key={s.id} s={s} onDone={() => void reload()} />)}</div>}
    </div>
  );
}

export function AdminAds() {
  useTitle("Admin · Ads");
  const { toast } = useSession();
  const { data, error, loading, reload } = useApi<{ placement: string; enabled: boolean; ad_unit_id: string | null }[]>("/admin/ads");
  const [units, setUnits] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setUnits(Object.fromEntries(data.map((a) => [a.placement, a.ad_unit_id ?? ""]))); }, [data]);
  const set = async (placement: string, enabled: boolean) => {
    try { await api(`/admin/ads/${placement}`, { method: "PUT", body: { enabled, ad_unit_id: units[placement] || null } }); toast("Saved", "✓"); void reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't save"); }
  };
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Admin</span><h1>Ad placements</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: "70ch" }}>Ads only appear when the server has an AdSense publisher ID (HX_ADSENSE_PUBLISHER_ID), the placement is on, and it has an ad unit ID. Pro learners never see ads. Lessons, labs, practice and missions have no ad slots.</p></div></div>
      <AdminTabs />
      {loading ? <Loading /> : error || !data ? <ErrorBox error={error} retry={reload} /> : (
        <div className="stack">{data.map((a) => (
          <div key={a.placement} className="card row between">
            <div><b className="mono">{a.placement}</b><div className="small faint">{a.enabled ? "on" : "off"}</div></div>
            <div className="row">
              <input className="input mono" style={{ width: 160 }} placeholder="ad unit ID" value={units[a.placement] ?? ""} aria-label={`${a.placement} ad unit ID`}
                onChange={(e) => setUnits({ ...units, [a.placement]: e.target.value.replace(/\D/g, "") })} />
              <label className="switch"><input type="checkbox" checked={a.enabled} onChange={(e) => void set(a.placement, e.target.checked)} />Enabled</label>
            </div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function AdminUsers() {
  useTitle("Admin · Users");
  const { toast } = useSession();
  const { data, error, loading, reload } = useApi<{ id: string; name: string; email: string; role: string; plan: string; created_at: string }[]>("/admin/users");
  const setPlan = async (id: string, plan: string) => {
    try { await api(`/admin/users/${id}`, { method: "PATCH", body: { plan } }); toast("Plan updated", "✓"); void reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't save"); }
  };
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Admin</span><h1>Users</h1></div></div>
      <AdminTabs />
      {loading ? <Loading /> : error || !data ? <ErrorBox error={error} retry={reload} /> : (
        <div className="tscroll"><table className="t"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Joined</th></tr></thead>
          <tbody>{data.map((u) => (
            <tr key={u.id}><td>{u.name}</td><td className="small">{u.email}</td><td>{u.role}</td>
              <td><select className="input" style={{ width: 100, padding: "6px 8px" }} value={u.plan} aria-label={`Plan for ${u.name}`} onChange={(e) => void setPlan(u.id, e.target.value)}>
                <option value="free">free</option><option value="pro">pro</option></select></td>
              <td className="small faint">{timeAgo(u.created_at)}</td></tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}

export function AdminAudit() {
  useTitle("Admin · Audit");
  const { data, error, loading, reload } = useApi<{ action: string; target: string; detail: Record<string, unknown>; actor: string | null; at: string }[]>("/admin/audit");
  return (
    <div className="wrap page">
      <div className="page-head"><div><span className="label">Admin</span><h1>Audit log</h1></div></div>
      <AdminTabs />
      {loading ? <Loading /> : error || !data ? <ErrorBox error={error} retry={reload} /> : data.length === 0 ? <div className="empty">No admin actions yet.</div> : (
        <div className="tscroll"><table className="t"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>{data.map((a, k) => <tr key={k}><td className="small faint">{timeAgo(a.at)}</td><td>{a.actor}</td><td className="mono small">{a.action}</td><td className="small">{a.target}</td><td className="mono tiny">{JSON.stringify(a.detail)}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}
