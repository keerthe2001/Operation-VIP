# HuntExams

An interactive career-development platform. Release 1 is one route, **Agentic AI Engineer**:
every topic is taught with a guided motion scene first, then practised with questions, real Python
and guided labs, and proven with reviewed missions and a verifiable certificate.

| Part | Where | Stack |
|---|---|---|
| Web app | [`apps/huntexams`](../apps/huntexams) | React 19, Vite, TypeScript, CodeMirror 6, Pyodide |
| API | [`huntexams/api`](api) | FastAPI, SQLAlchemy (async), Alembic, Postgres |
| Curriculum | [`huntexams/api/content`](api/content) | YAML, validated, loaded into Postgres, editable in the admin |

It lives beside the Job Application Copilot in this monorepo but shares no code or data with it.

## What's in Release 1

* **Curriculum:** 8 levels (97 topics from the brief) plus a 6-topic Python starter pack for
  beginners. Every topic has an auto-playing motion scene with step captions, plain and
  engineer explanations, a glossary and 2–3 practice questions. 10 full-screen guided labs.
  One reviewed mission per level, the last one a capstone.
* **Motion scenes:** 8 data-driven engines (`flow`, `tokens`, `bars`, `space`, `slicer`, `graph`,
  `meter`, `code`). A scene is JSON: track, steps with captions, and optional "switch it off"
  toggles. Auto-play starts when visible, pauses on hover, and respects reduced motion.
* **Python sandbox:** learner code runs in **Pyodide inside a Web Worker in the learner's own
  browser**, never on our servers. Runs time out after 7 s (the worker is terminated), traced runs
  stop after 2,500 steps, and `input()` is disabled.
* **Every line of code, visualised:** a tracer records each executed line, the variables in every
  frame and the output, and the visualiser replays it with a plain-English sentence per line
  ("total changes from 40 to 65").
* **Practice engines:** predict, MCQ, multi-select, order, fill-the-blank, debug (tap the bad
  line) and tune (move a slider to hit a target). Answers are graded on the server; answer keys
  never reach the browser.
* **Evidence-based progress:**
  * **Practised topic:** the scene was watched to the end and every check passed.
  * **Unlocking:** a level unlocks when the previous level's topics are practised, or when the
    learner passes that level's diagnostic (≥ 80%).
  * **XP:** paid once per piece of evidence. Opening pages pays nothing.
* **Missions:** reviewed by a person against a rubric. Nothing is graded by AI in Release 1. A
  **certificate** is issued only when every level is proven (topics + passed mission), and it's
  publicly verifiable by ID.
* **Admin:**
  * **Content editor:** draft/publish with validation and scene preview.
  * **Mission reviews:** scored against the rubric.
  * **Ad placements:** on/off per placement.
  * **Users:** set a learner's plan (Free or Pro).
  * **Audit log:** a record of admin actions.
* **Ads:** AdSense is off unless `HX_ADSENSE_PUBLISHER_ID` is set *and* a placement is enabled
  *and* the learner isn't Pro. Lessons, labs, practice and missions have no ad slots.

## Run it locally

```bash
# Postgres (any local instance works; this matches the defaults)
createdb huntexams    # owner huntexams / password huntexams

cd huntexams/api
cp .env.example .env          # set HX_SECRET_KEY and HX_ADMIN_EMAILS
uv sync && uv run alembic upgrade head
uv run uvicorn app.asgi:app --port 8010      # loads the curriculum on first start

cd ../../apps/huntexams
pnpm install
pnpm dev                      # http://localhost:5174, proxies /api to :8010
```

Content changes: edit the YAML, then `uv run python -m app.seed --check` and
`uv run python -m app.seed --reload` (overwrites database content from the files).

With Docker: `HX_SECRET_KEY=... docker compose -f infra/huntexams-compose.yml up --build`, then open
http://localhost:8080.

## Deploy on Render

`render.yaml` at the repository root is a Render Blueprint: one Docker web service
(`huntexams/Dockerfile`, which builds the website and serves it from the API on the same origin)
and one Postgres database. Migrations run on start, and the curriculum loads on first start.
After the first deploy, set `HX_ADMIN_EMAILS` (and later `HX_PUBLIC_SITE_URL`) in the dashboard,
then add a custom domain such as `learn.huntexams.com` and point a CNAME to it in Cloudflare.

## Tests

| Command | What it proves |
|---|---|
| `cd huntexams/api && uv run pytest` | Auth, CSRF, password reset, onboarding, grading (incl. server-side tune), locks, XP idempotency, labs, diagnostics, missions + rubric review, certificate, admin publish/validation, ad gating |
| `uv run python -m app.seed --check` | Every lesson, lab, mission and guide document is valid |
| `cd apps/huntexams && node scripts/check-content.mjs ../../huntexams/api/content` | Every worked example runs, every exercise's solution passes its tests (and the starter doesn't), and every guided lab passes step by step with "Show me", in real Pyodide |
| `pnpm --filter @huntexams/web test` | Line-by-line narration |
| `BASE=http://localhost:5174 node apps/huntexams/e2e/journey.mjs` | The whole journey in a real browser: signup → 3-question onboarding → lesson scene → every question type → sandbox run → exercise → full lab → dashboard → mission submit → admin review → certificate claim → public verification; plus every public page at phone and desktop width with no console errors or sideways scrolling. Run the API with `HX_ADMIN_EMAILS=admin@huntexams.dev` and `HX_RATE_LIMIT_WRITES_PER_MINUTE=10000`. |

## Decisions and honest limits

* **Browser sandbox instead of server containers.** Code never touches our servers, which removes
  the biggest risk, and it scales for free. Trade-off: code-exercise XP is self-reported by the
  browser. Certificates therefore depend on human-reviewed missions, not exercises.
* **No live LLM calls yet.** Where code needs a model, lessons use clearly labelled stand-in
  functions. Scenes show simulated values and say so (for example "simulated logits"). A
  backend-only AI provider layer is the next step when an API key and budget are chosen.
* **Email isn't wired up.** Password-reset links are logged in development. Production needs an
  email provider before the reset page is advertised.
* **Payments aren't built.** Pro is a plan flag an admin can set; pricing shows "Coming soon".
* **Rate limiting is in-process.** It's fine for one API instance. Several instances need a
  shared store such as Redis.
* **Starter pack.** A proposed addition for beginners. It's optional and never blocks unlocks or
  certificates.
