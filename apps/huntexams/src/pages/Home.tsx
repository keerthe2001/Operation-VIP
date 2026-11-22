import { useState } from "react";
import { Link } from "react-router";

import { AdSlot } from "@/components/Layout";
import { ScenePlayer } from "@/scenes/ScenePlayer";
import { useApi, useSession } from "@/lib/session";
import type { Curriculum, Scene } from "@/lib/types";
import { LEVEL_COLOR, useTitle } from "@/lib/util";

export const HERO_SCENE: Scene = {
  engine: "flow",
  title: "How does an AI agent work?",
  track: ["Goal", "Think", "Tool", "Memory", "Answer"],
  actors: [
    { id: "you", label: "You", icon: "person", x: 14, y: 62 },
    { id: "agent", label: "Agent", icon: "brain", x: 47, y: 62 },
    { id: "tools", label: "Tools", icon: "wrench", x: 83, y: 36 },
    { id: "mem", label: "Memory", icon: "db", x: 83, y: 80 },
  ],
  switches: [
    { id: "tool", label: "Tools", label_on: "ON · the agent can look things up", label_off: "OFF · it can only guess", track: 2, actor: "tools" } as never,
    { id: "mem", label: "Memory", label_on: "ON · it remembers results", label_off: "OFF · it forgets everything", track: 3, actor: "mem" } as never,
  ],
  steps: [
    { at: 0, from: "you", to: "agent", packet: "Umbrella today?", tone: "ask", caption: "You ask: \"Should I take an umbrella in Chennai today?\"" },
    { at: 1, think: "agent", notes: { agent: "need: today's weather" }, caption: "The agent thinks first: it can't know today's weather from memory, so it needs to check." },
    { at: 2, when: "tool", from: "agent", to: "tools", packet: "get_weather(Chennai)", tone: "ask", caption: "It picks a tool and calls it with the right input." },
    { at: 2, when: "tool", from: "tools", to: "agent", packet: "rain 80%", tone: "good", notes: { tools: "returned: rain 80%" }, caption: "The tool sends back a real fact: 80% chance of rain." },
    { at: 2, when: "!tool", active: ["agent"], tone: "bad", notes: { tools: "switched off" }, caption: "No tools. The agent has no way to check, so it can only guess." },
    { at: 3, when: "mem", from: "agent", to: "mem", packet: "save: rain 80%", tone: "ask", notes: { mem: "Chennai · rain 80%" }, caption: "It saves what it learned, so a follow-up question doesn't need another lookup." },
    { at: 3, when: "!mem", active: ["agent"], tone: "bad", notes: { mem: "empty" }, caption: "Memory is off. Ask \"what about tomorrow?\" and it starts from zero." },
    { at: 4, when: "tool", from: "agent", to: "you", packet: "Yes, take one ☂", tone: "good", caption: "Answer: \"Yes, there's an 80% chance of rain.\" Based on a fact, not a guess." },
    { at: 4, when: "!tool", from: "agent", to: "you", packet: "Maybe? Not sure", tone: "bad", caption: "Without tools the answer is a guess. Agents need tools to act on the real world." },
  ],
};

const WHO: { k: string; who: string; sub: string; level: string; week: [string, string][] }[] = [
  { k: "nonit", who: "Non-IT background", sub: "Commerce, arts, support, sales…", level: "Beginner",
    week: [["Day 1", "Watch how an AI agent works (2-minute scene)"], ["Day 2", "Starter: what a program is, with pictures"], ["Day 3", "Your first Python lines, every line explained"], ["Day 5", "Tokenizer lab: see how AI reads your words"], ["Day 7", "First questions passed, first sticker earned"]] },
  { k: "y1", who: "1st–2nd year student", sub: "Any degree, any branch", level: "Beginner",
    week: [["Day 1", "How an AI agent works"], ["Day 2", "Python warm-up: variables and lists"], ["Day 3", "Loops, with the moving picture"], ["Day 4", "Tokenizer lab"], ["Day 6", "Explain an LLM in your own words"]] },
  { k: "y4", who: "3rd–4th year · fresher", sub: "Placements are coming", level: "Intermediate",
    week: [["Day 1", "LLM foundations, fast track"], ["Day 2", "Sampling lab: temperature, top-k, top-p"], ["Day 3", "Interview-style checks on context windows"], ["Day 5", "Mission: token budget calculator"], ["Day 7", "Put the mission link on your resume"]] },
  { k: "exp", who: "Working developer", sub: "You ship code already", level: "Advanced",
    week: [["Weekend 1", "15-minute diagnostics to skip Levels 1–2"], ["Weekend 1", "Embeddings and vector search"], ["Weekend 2", "Hybrid search and reranking"], ["Weekend 2", "Mission: RAG over your own docs"], ["Weekend 3", "Build an agent loop from scratch"]] },
];

export function Pricing({ compact = false }: { compact?: boolean }) {
  return (
    <div className="stack">
      <div className="price-grid">
        <div className="card price"><span className="label">Free</span><div className="amt">₹0</div>
          <ul><li>Every motion scene and lesson</li><li>Guided labs and the Python sandbox</li><li>Practice questions and XP</li><li>Mission reviews and your certificate</li></ul>
          <Link className="btn btn-ghost" to="/signup">Start free</Link></div>
        <div className="card price pro"><span className="label" style={{ color: "var(--brand)" }}>Pro monthly</span><div className="amt">₹299<small> / month</small></div>
          <ul><li>Everything in Free</li><li>No ads anywhere</li><li>Support the people building the scenes</li></ul>
          <button className="btn btn-primary" type="button" disabled>Coming soon</button></div>
        <div className="card price"><span className="label">Pro yearly</span><div className="amt">₹1,999<small> / year</small></div>
          <ul><li>Everything in Pro</li><li>About 44% less than monthly</li></ul>
          <button className="btn btn-ghost" type="button" disabled>Coming soon</button></div>
      </div>
      {!compact && <p className="note">Pro isn't on sale yet and these prices may change before launch. Everything you need to learn and earn the certificate is free today.</p>}
    </div>
  );
}

export function Home() {
  useTitle("");
  const { user } = useSession();
  const { data: cur } = useApi<Curriculum>("/curriculum");
  const [who, setWho] = useState("nonit");
  const w = WHO.find((x) => x.k === who)!;
  const start = user ? "/dashboard" : "/signup";
  const levels = cur?.levels.filter((l) => !l.optional) ?? [];
  const topics = cur?.levels.reduce((a, l) => a + l.topics.length, 0) ?? 0;

  return (
    <>
      <section className="hero"><div className="wrap">
        <div>
          <span className="label">Agentic AI Engineer · from zero</span>
          <h1>Become an AI engineer by <span>seeing it move</span>, then building it.</h1>
          <p className="lede">Every topic starts with a short scene that plays by itself. Then you change it, code it in real Python, and prove it with a project. Made for non-IT learners, students in any year, and working developers.</p>
          <div className="row">
            <Link className="btn btn-primary btn-lg" to={start}>{user ? "Continue learning" : "Start free"}</Link>
            <Link className="btn btn-ghost btn-lg" to="/roadmap">See the route</Link>
          </div>
          <div className="meta"><span>Free to start</span><span>No videos to sit through</span><span>Python runs in your browser</span></div>
        </div>
        <ScenePlayer scene={HERO_SCENE} tag="motion scene · 1 question" />
      </div></section>

      <div className="wrap"><AdSlot placement="homepage_banner" /></div>

      <section className="hsec"><div className="wrap">
        <div className="head"><span className="label">Who it's for</span><h2>Start where you are</h2><p>Pick the one closest to you and see what your first week looks like.</p></div>
        <div className="who">
          <div className="who-tabs" role="tablist" aria-label="Learner types">
            {WHO.map((x) => (
              <button key={x.k} type="button" role="tab" aria-selected={who === x.k} onClick={() => setWho(x.k)}>
                <b>{x.who}</b><span>{x.sub}</span>
              </button>
            ))}
          </div>
          <div className="card stack" role="tabpanel">
            <div className="row between"><b style={{ fontSize: 18 }}>Your first week</b><span className="pill">{w.level}</span></div>
            <ul className="weeklist">{w.week.map(([d, t]) => <li key={`${d}${t}`}><span>{d}</span><span>{t}</span></li>)}</ul>
            <Link className="btn btn-primary" to={start} style={{ justifySelf: "start" }}>Start as {w.who.toLowerCase()}</Link>
          </div>
        </div>
      </div></section>

      <section className="hsec"><div className="wrap">
        <div className="head"><span className="label">How you learn</span><h2>Every topic works the same four ways</h2></div>
        <div className="steps4">
          <div><span className="n">Watch</span><h3>See it move</h3><p>A short scene plays one step at a time, with a caption in plain words.</p></div>
          <div><span className="n">Try</span><h3>Change something</h3><p>Flip a switch or move a slider and watch the result change.</p></div>
          <div><span className="n">Build</span><h3>Write real Python</h3><p>Runs in your browser. Every line you run plays back as a picture.</p></div>
          <div><span className="n">Prove</span><h3>Ship a mission</h3><p>Each level ends with a project, reviewed against a clear rubric.</p></div>
        </div>
      </div></section>

      <section className="hsec"><div className="wrap">
        <div className="head"><span className="label">The route</span><h2>{levels.length || 8} levels from "what is an LLM" to a deployed agent</h2>
          {topics > 0 && <p>{topics} topics, each with its own motion scene. Beginners get a Python starter pack first.</p>}</div>
        <ul className="levels-mini">
          {levels.map((l) => (
            <li key={l.slug} style={{ ["--c" as string]: LEVEL_COLOR(l.number) }}>
              <span className="mono tiny faint">L{l.number}</span><b>{l.title}</b>
              <span>{l.topics.length} topics{l.mission ? ` · mission: ${l.mission.title}` : ""}</span>
            </li>
          ))}
        </ul>
      </div></section>

      <section className="hsec"><div className="wrap">
        <div className="head"><span className="label">Certificate</span><h2>A certificate means you built things</h2>
          <p>It's issued only when every level's mission passes review, and anyone can check it with its ID. It's a HuntExams certificate, not an external accreditation.</p></div>
        <Link className="btn btn-ghost" to="/verify">Verify a certificate</Link>
      </div></section>

      <section className="hsec"><div className="wrap">
        <div className="head"><span className="label">Pricing</span><h2>Learn free</h2></div>
        <Pricing compact />
      </div></section>

      <section className="hsec"><div className="wrap faq">
        <div className="head"><span className="label">Questions</span><h2>Things people ask</h2></div>
        <details><summary>I'm not from IT. Can I really do this?</summary><p>Yes. Beginners start with a short Python starter pack. Every lesson opens with a picture and plain words, and guided labs walk you through code one line at a time.</p></details>
        <details><summary>Do I need a powerful laptop?</summary><p>No. Lessons, scenes and Python all run in your browser, on a phone too. The first time you run code, the browser downloads Python (about 13 MB) and keeps it cached.</p></details>
        <details><summary>How long does it take?</summary><p>It depends on your time. At one hour a day, most learners need around five months. Onboarding gives you your own estimate.</p></details>
        <details><summary>Is the certificate recognised by companies?</summary><p>It's a HuntExams certificate, not an external accreditation. What makes it useful is the evidence behind it: your mission projects, which an interviewer can open and ask you about.</p></details>
      </div></section>

      <section className="cta-band"><div className="wrap">
        <h2>Watch your first agent think. It takes two minutes.</h2>
        <p>Free. No card needed.</p>
        <Link className="btn btn-primary btn-lg" to={start}>{user ? "Continue learning" : "Start free"}</Link>
      </div></section>
    </>
  );
}
