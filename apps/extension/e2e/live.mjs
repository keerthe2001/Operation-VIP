/**
 * Manual check against live career sites. Loads the built extension, signs a test user in,
 * opens each URL, lets Copilot detect and fill the form, and prints what it recognized and
 * filled. It never presses Submit, Continue, Next or Create Account, so nothing is sent to
 * the site.
 *
 * Prerequisites: as for run.mjs (API :8000, web :5173, extension built with E2E=1).
 * Usage: RESUME_PDF=resume.pdf node e2e/live.mjs <outDir> <url> [url…]
 *   A URL prefixed with "click:<button text>|" first clicks that button (e.g. Workday's
 *   "Apply" then "Apply Manually") to reach the form.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");

const API = "http://localhost:8000";
const WEB = "http://localhost:5173";
const dist = fileURLToPath(new URL("../dist", import.meta.url));
const [outDir, ...targets] = process.argv.slice(2);
if (!outDir || !targets.length) throw new Error("usage: node e2e/live.mjs <outDir> <url> [url…]");
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEVER = /submit|send application|create account|sign in|continue|next|save and|review/i;

const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "copilot-live-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  viewport: { width: 1440, height: 900 },
});
const report = [];
try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "manual", fillProgress: "off" } }));

  // A signed-in test user with a processed resume.
  const email = `live${Date.now()}@example.com`;
  const page = await context.newPage();
  await page.goto(`${WEB}/register`);
  await page.getByLabel("Full name (optional)").fill("Priya Raman");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Drag and drop your resume here").waitFor();
  if (process.env.RESUME_PDF) {
    await page.getByLabel("Upload resume").setInputFiles(process.env.RESUME_PDF);
    await page.getByText("Review profile").waitFor({ timeout: 30000 });
  }
  const token = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery", client: "extension" }),
  }).then((r) => r.json());
  await fetch(`${API}/api/v1/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}` },
    body: JSON.stringify({
      personal_information: { city: "Chennai", state: "Tamil Nadu", country: "India", postal_code: "600042", address: "12 Lake View Road" },
      additional_info: { requires_sponsorship: false, notice_period: "30 days", work_authorization: "Authorized to work in India" },
    }),
  });
  await page.goto(`${WEB}/extension/connect`);
  await page.getByRole("button", { name: /Connect extension/ }).click();
  await page.getByText(/Connected/).waitFor();
  for (let i = 0; i < 40; i++) {
    if (await worker.evaluate(async () => !!(await chrome.storage.local.get("profile")).profile)) break;
    await sleep(250);
  }
  await page.close();

  const tabStateFor = (url) =>
    worker.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url === u) ?? tabs.find((t) => t.url?.startsWith(u.split("?")[0]));
      if (!tab) return null;
      const all = await chrome.storage.session.get([`tab:${tab.id}`, `form:${tab.id}`, `activity:${tab.id}`]);
      return { tabId: tab.id, tab: all[`tab:${tab.id}`], form: all[`form:${tab.id}`], activity: all[`activity:${tab.id}`] };
    }, url);

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);

  for (const [n, target] of targets.entries()) {
    const [clicks, url] = target.includes("|") ? [target.split("|")[0].replace(/^click:/, "").split(","), target.split("|")[1]] : [[], target];
    const name = `${n + 1}-${new URL(url).hostname.split(".")[0]}`;
    const entry = { url, steps: [] };
    report.push(entry);
    const tab = await context.newPage();
    try {
      await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await tab.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
      for (const text of clicks) {
        if (NEVER.test(text) && !/^apply/i.test(text)) throw new Error(`refusing to click ${text}`);
        const target = tab.getByRole("button", { name: text, exact: true }).or(tab.getByRole("link", { name: text, exact: true })).first();
        await target.click({ timeout: 20000 });
        await tab.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
        await sleep(2500);
        entry.steps.push(`clicked ${text}`);
      }
      await sleep(4000);
      let state = await tabStateFor(tab.url());
      entry.job = state?.tab?.job ?? null;
      entry.detected = state?.form?.fields?.length ?? 0;
      await tab.screenshot({ path: `${outDir}/${name}-before.png`, fullPage: false });
      if (state?.form?.fields?.length) {
        const keys = state.form.fields.filter((f) => f.status === "auto" || f.status === "ready").map((f) => `${f.frameId}:${f.id}`);
        const reply = await panel.evaluate(
          async ({ tabId, keys }) => chrome.runtime.sendMessage({ type: "FILL_FIELDS", tabId, fields: keys, overwrite: false }),
          { tabId: state.tabId, keys },
        );
        entry.fill = reply;
        await sleep(2500);
        state = await tabStateFor(tab.url());
      }
      entry.fields = (state?.form?.fields ?? []).map((f) => ({
        label: f.label.slice(0, 70),
        kind: f.kind,
        section: f.section?.slice(0, 30),
        key: f.key,
        status: f.status,
        result: f.result ? `${f.result}${f.resultMessage ? ":" + f.resultMessage : ""}` : "",
        value: (f.value ?? "").slice(0, 40),
        now: f.kind === "password" ? "" : (f.currentValue ?? "").slice(0, 40),
        error: f.error ?? "",
        req: f.required,
      }));
      entry.action = state?.form?.action ?? null;
      entry.pageErrors = state?.form?.pageErrors ?? [];
      entry.activity = (state?.activity ?? []).map((a) => a.text);
      await tab.screenshot({ path: `${outDir}/${name}-after.png`, fullPage: true });
    } catch (error) {
      entry.error = String(error).slice(0, 400);
      await tab.screenshot({ path: `${outDir}/${name}-error.png` }).catch(() => undefined);
    }
  }
} finally {
  await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  for (const entry of report) {
    console.log(`\n=== ${entry.url}`);
    if (entry.error) console.log(`ERROR ${entry.error}`);
    console.log(`job: ${JSON.stringify(entry.job && { portal: entry.job.portal, title: entry.job.title, company: entry.job.company, app: entry.job.isApplicationPage, n: entry.job.fieldCount })}`);
    console.log(`fill: ${JSON.stringify(entry.fill)} action: ${entry.action} errors: ${entry.pageErrors?.join(" | ")}`);
    for (const f of entry.fields ?? []) {
      console.log(`  ${f.req ? "*" : " "} [${f.kind}] ${f.label} {${f.section ?? ""}} → ${f.key ?? "-"} (${f.status}${f.result ? "/" + f.result : ""}) v="${f.value}" now="${f.now}"${f.error ? " ERR " + f.error : ""}`);
    }
  }
  await context.close();
}
