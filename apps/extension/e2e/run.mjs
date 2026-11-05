/**
 * End-to-end check of the extension in real Chromium.
 *
 * Prerequisites: API on :8000 and web app on :5173 running, extension built (pnpm build).
 * Usage: node e2e/run.mjs [screenshotDir]
 *
 * Job portals are not contacted: their URLs are intercepted and served from fixtures.
 */
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const shots = process.argv[2];
const API = "http://localhost:8000";
const WEB = "http://localhost:5173";
const EXPECTED_ID = "ghnfgeieaebkhfpmgkbmikimkhidhmce";

const GREENHOUSE_URL = "https://boards.greenhouse.io/acmecorp/jobs/4012345";
const GREENHOUSE_HTML = `<!doctype html><html><head><title>Job Application for Senior Backend Engineer at Acme Corp</title></head>
<body><div id="header"><h1 class="app-title">Senior Backend Engineer</h1><span class="company-name">at Acme Corp</span></div>
<form id="application_form">
  <label for="first_name">First Name</label><input id="first_name" type="text">
  <label for="last_name">Last Name</label><input id="last_name" type="text">
  <label for="email">Email</label><input id="email" type="email">
  <label for="phone">Phone</label><input id="phone" type="tel">
  <label for="resume">Resume/CV</label><input id="resume" type="file">
  <label for="linkedin">LinkedIn Profile</label><input id="linkedin" type="text">
  <label for="why">Why do you want to work at Acme?</label><textarea id="why"></textarea>
</form></body></html>`;

const check = (condition, message) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok - ${message}`);
};

const userDir = await mkdtemp(join(tmpdir(), "copilot-e2e-"));
const context = await chromium.launchPersistentContext(userDir, {
  // The full Chromium build in "new headless" mode can load extensions; the
  // stripped-down headless shell Playwright uses by default cannot.
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  check(extensionId === EXPECTED_ID, `extension loaded with stable id ${extensionId}`);

  // 1. A user with a processed resume (via the API for speed).
  const email = `ext${Date.now()}@example.com`;
  const page = await context.newPage();
  await page.goto(`${WEB}/register`);
  await page.getByLabel("Full name (optional)").fill("Priya Raman");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Drag and drop your resume here").waitFor();
  if (process.env.RESUME_PDF) {
    await page.getByLabel("Upload resume").setInputFiles(process.env.RESUME_PDF);
    await page.getByText("Review profile").waitFor({ timeout: 20000 });
  }

  // 2. Side panel before connecting shows the sign-in screen.
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 860 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await panel.getByRole("link", { name: /Connect with your Copilot account/ }).waitFor();
  check(true, "signed-out side panel shows the connect button");
  if (shots) await panel.screenshot({ path: `${shots}/ext-signin.png` });

  // 3. Connect from the web app (externally_connectable handoff).
  await page.goto(`${WEB}/extension/connect`);
  await page.getByRole("button", { name: /Connect extension/ }).click();
  await page.getByText(/Connected. Open the Copilot side panel/).waitFor();
  check(true, "web app handed the session to the extension");
  const stored = await worker.evaluate(async () => {
    const local = await chrome.storage.local.get(["auth", "refreshToken", "profile"]);
    const session = await chrome.storage.session.get(["accessToken"]);
    return { status: local.auth?.status, email: local.auth?.user?.email, hasRefresh: !!local.refreshToken, hasAccess: !!session.accessToken };
  });
  check(stored.status === "signed_in" && stored.email === email, "extension is signed in as the web user");
  check(stored.hasRefresh && stored.hasAccess, "tokens stored (refresh in local, access in session)");
  for (let i = 0; i < 20; i++) {
    const synced = await worker.evaluate(async () => !!(await chrome.storage.local.get("profile")).profile);
    if (synced) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const profileName = await worker.evaluate(async () => (await chrome.storage.local.get("profile")).profile?.profile?.personal_information?.full_name ?? null);
  check(!process.env.RESUME_PDF || profileName === "Priya Raman", `profile synced to the extension (${profileName})`);

  // 4. A Greenhouse application page is detected by the content script.
  await context.route(GREENHOUSE_URL, (route) => route.fulfill({ contentType: "text/html", body: GREENHOUSE_HTML }));
  const job = await context.newPage();
  await job.goto(GREENHOUSE_URL);
  let tabState = null;
  for (let i = 0; i < 40 && !tabState?.job; i++) {
    tabState = await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      if (!tab) return null;
      const key = `tab:${tab.id}`;
      return { tabId: tab.id, ...(await chrome.storage.session.get(key))[key] };
    }, GREENHOUSE_URL);
    if (!tabState?.job) await new Promise((r) => setTimeout(r, 250));
  }
  check(tabState?.job?.portal === "greenhouse", "content script detected the Greenhouse application");
  check(tabState.job.title === "Senior Backend Engineer" && tabState.job.company === "Acme Corp", "title and company extracted");
  check(tabState.job.isApplicationPage && tabState.job.fieldCount === 7, `application form found (${tabState.job.fieldCount} fields)`);

  // 5. The side panel shows the job for that tab.
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html?tab=${tabState.tabId}`);
  await panel.getByRole("heading", { name: "Senior Backend Engineer" }).waitFor();
  check(await panel.getByText("Application detected").isVisible(), "side panel shows the detected application");
  check(await panel.getByText("Application readiness").isVisible(), "side panel shows readiness");
  if (shots) await panel.screenshot({ path: `${shots}/ext-job.png` });

  // 6. Pages outside the supported portals are not touched without permission.
  await context.route("https://careers.example.org/apply", (route) => route.fulfill({ contentType: "text/html", body: GREENHOUSE_HTML }));
  const other = await context.newPage();
  await other.goto("https://careers.example.org/apply");
  await new Promise((r) => setTimeout(r, 1500));
  const otherState = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const keys = tabs.map((t) => `tab:${t.id}`);
    const all = await chrome.storage.session.get(keys);
    return Object.values(all).filter((s) => s?.url?.includes("example.org")).length;
  });
  check(otherState === 0, "no content script on non-portal sites without the optional permission");

  // 7. Sign out from the panel.
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html?tab=${tabState.tabId}`);
  await panel.getByRole("button", { name: "Settings" }).click();
  if (shots) await panel.screenshot({ path: `${shots}/ext-settings.png` });
  await panel.getByRole("button", { name: "Sign out" }).click();
  await panel.getByRole("button", { name: "Sign in" }).waitFor();
  const after = await worker.evaluate(async () => (await chrome.storage.local.get("refreshToken")).refreshToken ?? null);
  check(after === null, "sign out clears the stored session");
  console.log("\nAll extension E2E checks passed.");
} catch (error) {
  for (const p of context.pages()) {
    console.log(`--- ${p.url()}\n${(await p.locator("body").innerText().catch(() => "")).slice(0, 600)}`);
  }
  throw error;
} finally {
  await context.close();
}
