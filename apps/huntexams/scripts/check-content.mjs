// Runs every content code path through real Python (Pyodide), exactly as the browser would:
//  - each topic's worked example runs without error
//  - each exercise's solution passes its tests, and the untouched starter does not
//  - each guided lab, followed step by step with "Show me", passes every check
// Usage: node scripts/check-content.mjs ../../huntexams/api/content
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { loadPyodide } = require("pyodide");
const root = process.argv[2] ?? "../../huntexams/api/content";

const src = readFileSync(new URL("../src/sandbox/harness.ts", import.meta.url), "utf8");
const harness = src.slice(src.indexOf("String.raw`") + 11, src.lastIndexOf("`;"));
const py = await loadPyodide();
py.runPython(harness);
const run = py.globals.get("run_user");
const exec = (code, opts = {}) => JSON.parse(run(code, false, opts.tests ?? undefined, opts.check ? py.toPy(opts.check) : undefined, 5000));

// The API already parses and validates the YAML, so ask it for the tree as JSON.
const { execSync } = await import("node:child_process");
const tree = JSON.parse(execSync(
  `uv run --quiet python -c "import json,sys; from pathlib import Path; from app.content import load_content_tree; print(json.dumps(load_content_tree(Path('content'))))"`,
  { cwd: join(root, ".."), env: { ...process.env, HX_SECRET_KEY: "x".repeat(40) }, maxBuffer: 64 * 1024 * 1024 },
).toString());

let fails = 0, checks = 0;
const fail = (msg) => { fails++; console.log("✗ " + msg); };

for (const lv of tree.levels) {
  for (const t of lv.topics ?? []) {
    const b = t.body;
    if (b.code) {
      checks++;
      const r = exec(b.code.source);
      if (r.error && !["ModuleNotFoundError"].includes(r.error.type)) fail(`${t.slug}: example raises ${r.error.type}: ${r.error.message}`);
    }
    if (b.exercise) {
      checks += 2;
      const good = exec(b.exercise.solution, { tests: b.exercise.tests });
      if (!good.test?.passed) fail(`${t.slug}: solution fails its tests: ${good.test?.message ?? good.error?.message}`);
      const bad = exec(b.exercise.starter, { tests: b.exercise.tests });
      if (bad.test?.passed) fail(`${t.slug}: untouched starter already passes the tests`);
    }
    for (const q of b.checks) {
      if (q.type === "debug" && q.code && !(q.answer >= 1 && q.answer <= q.code.split("\n").filter((l, i, a) => i < a.length - 1 || l).length)) fail(`${t.slug}/${q.id}: debug answer out of range`);
    }
  }
}

for (const lab of tree.labs) {
  let code = "";
  for (const s of lab.body.steps) {
    if (s.starter !== undefined && s.starter !== null) code = s.starter;
    else if (s.append) code += s.append;
    if (s.show) {
      const first = (code.split("\n").find((l) => l.trim()) ?? "").trim();
      const replace = s.replace === true || (Boolean(first) && s.show.trimStart().startsWith(first));
      let text = s.show.replace(/\n$/, "");
      if (replace) code = text;
      else code = code + (code && !code.endsWith("\n") ? "\n" : "") + text;
    }
    if (s.kind === "read" || !s.check) continue;
    checks++;
    const r = exec(code, { check: s.check });
    if (!r.check?.passed) fail(`lab ${lab.slug} step ${s.id}: check fails after "Show me" (${r.error ? r.error.type + ": " + r.error.message : r.check?.message})\n----\n${code}\n----`);
  }
}

console.log(`${checks} code checks, ${fails} problems`);
process.exit(fails ? 1 : 0);
