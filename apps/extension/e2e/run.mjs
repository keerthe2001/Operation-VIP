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
  <label for="years">Years of experience</label>
  <select id="years"><option value="">Select…</option><option value="a">0-2 years</option><option value="b">3-5 years</option><option value="c">6-10 years</option><option value="d">10+ years</option></select>
  <fieldset><legend>Will you now or in the future require visa sponsorship?</legend>
    <label><input type="radio" name="sponsor" value="1">Yes</label><label><input type="radio" name="sponsor" value="0">No</label></fieldset>
</form></body></html>`;

const COMPANY_URL = "https://careers.northwind.example/jobs/42";
const COMPANY_HTML = `<!doctype html><html><head><title>Careers at Northwind</title></head><body><h1>Join Northwind</h1>
<iframe id="grnhse_iframe" src="https://boards.greenhouse.io/embed/job_app?for=northwind&token=42" width="800" height="600"></iframe></body></html>`;
const EMBED_URL = "https://boards.greenhouse.io/embed/job_app?for=northwind&token=42";
const EMBED_HTML = `<!doctype html><html><body><h1 class="app-title">Data Engineer</h1><form id="application_form">
  <label for="fn">First Name</label><input id="fn"><label for="ln">Last Name</label><input id="ln">
  <label for="em">Email</label><input id="em" type="email"><label for="ph">Phone</label><input id="ph" type="tel">
</form></body></html>`;

const WORKDAY_URL = "https://initech.wd5.myworkdayjobs.com/en-US/External/job/Austin/Data-Analyst_R-1/apply/applyManually";
const WORKDAY_HTML = `<!doctype html><html><head><title>Apply - Data Analyst</title></head><body>
<div data-automation-id="applyFlowPage"><h2 data-automation-id="jobPostingHeader">Data Analyst</h2>
<div id="step">
  <label for="legalNameSection_firstName">Given Name(s)</label><input id="legalNameSection_firstName">
  <label for="legalNameSection_lastName">Family Name</label><input id="legalNameSection_lastName">
  <label for="email">Email Address</label><input id="email">
  <button id="next" type="button">Save and Continue</button>
</div></div>
<script>
document.getElementById("next").addEventListener("click", () => {
  document.getElementById("step").innerHTML =
    '<label for="school">School or University</label><input id="school">' +
    '<label for="degree">Degree</label><input id="degree">' +
    '<label for="linkedin">LinkedIn</label><input id="linkedin">';
});
</script></body></html>`;

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

  const token = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery", client: "extension" }),
  }).then((r) => r.json());
  await fetch(`${API}/api/v1/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}` },
    body: JSON.stringify({ additional_info: { requires_sponsorship: false, notice_period: "30 days" } }),
  });

  // 1b. Write a saved answer in the web app's answer library.
  await page.goto(`${WEB}/answers`);
  await page.getByRole("button", { name: "New answer" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Type of question").selectOption("why_company");
  await editor.getByLabel("Question", { exact: true }).fill("Why do you want to work here?");
  await editor.getByLabel("Answer", { exact: true }).fill("As a {current_designation}, I want to help {company} build reliable systems.");
  if (shots) await page.screenshot({ path: `${shots}/web-answer-editor.png` });
  await editor.getByRole("button", { name: "Save answer" }).click();
  await page.getByText("Used 0 times").waitFor();
  check(true, "answer saved in the web library");
  if (shots) await page.screenshot({ path: `${shots}/web-answers.png` });

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
  check(tabState.job.isApplicationPage && tabState.job.fieldCount === 10, `application form found (${tabState.job.fieldCount} fields)`);

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

  // 7. Autofill on the Greenhouse form.
  const panelUrl = (tabId) => `chrome-extension://${extensionId}/sidepanel/index.html?tab=${tabId}`;
  await panel.goto(panelUrl(tabState.tabId));
  const autofillButton = panel.getByRole("button", { name: /^Autofill \d+ fields?$/ });
  await autofillButton.waitFor();
  const label = await autofillButton.innerText();
  check(label === "Autofill 7 fields", `autofill offers the confident fields (${label})`);
  if (shots) await panel.screenshot({ path: `${shots}/ext-autofill.png` });
  await autofillButton.click();
  await panel.getByText(/Review the form, then submit it yourself/).waitFor();
  const values = await job.evaluate(() => ({
    first: document.getElementById("first_name").value,
    last: document.getElementById("last_name").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    linkedin: document.getElementById("linkedin").value,
    years: document.getElementById("years").selectedOptions[0].textContent,
    resume: document.getElementById("resume").files[0]?.name ?? null,
    resumeSize: document.getElementById("resume").files[0]?.size ?? 0,
    why: document.getElementById("why").value,
    sponsor: document.querySelector("input[name=sponsor]:checked")?.value ?? null,
  }));
  check(values.first === "Priya" && values.last === "Raman", "name fields filled");
  check(values.email === "priya.raman@example.com" && values.phone === "+919876543210", `email and phone filled (${values.phone})`);
  check(values.linkedin === "https://linkedin.com/in/priya-raman", "LinkedIn filled");
  check(values.years === "6-10 years", `years select chose the right range (${values.years})`);
  check(values.resume === "priya_raman_resume.pdf" && values.resumeSize > 1000, `resume attached (${values.resume}, ${values.resumeSize} bytes)`);
  check(values.why === "", "free-text question left for the user");
  check(values.sponsor === null, "sensitive sponsorship question not filled automatically");
  if (shots) await panel.screenshot({ path: `${shots}/ext-autofill-done.png` });

  // 8. Review & fill: approve the sponsorship answer.
  await panel.getByRole("button", { name: "Review & fill" }).click();
  await panel.getByLabel(/require visa sponsorship/).check();
  if (shots) await panel.screenshot({ path: `${shots}/ext-review.png`, fullPage: true });
  await panel.getByRole("button", { name: /^Fill selected/ }).click();
  await panel.getByRole("button", { name: "Review & fill" }).waitFor();
  const sponsor = await job.evaluate(() => document.querySelector("input[name=sponsor]:checked")?.value ?? null);
  check(sponsor === "0", "approved review field filled (sponsorship: No)");
  const untouched = await job.evaluate(() => document.getElementById("first_name").value);
  check(untouched === "Priya", "already-filled fields were not overwritten");

  // 8b. Answer suggestion for the free-text question.
  await panel.getByText("Answer suggestions").waitFor();
  const suggestion = panel.getByLabel(/Why do you want to work at Acme\?/);
  const suggested = await suggestion.inputValue();
  check(suggested === "As a Senior Software Engineer, I want to help Acme Corp build reliable systems.", `library answer suggested with placeholders filled ("${suggested}")`);
  if (shots) await panel.screenshot({ path: `${shots}/ext-answers.png`, fullPage: true });
  await panel.getByRole("button", { name: "Insert" }).click();
  await panel.getByText("Inserted into the form.").waitFor();
  check((await job.inputValue("#why")) === suggested, "answer inserted into the page's textarea");
  let used = 0;
  for (let i = 0; i < 20 && used === 0; i++) {
    const library = await fetch(`${API}/api/v1/answers`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
    used = library[0]?.usage_count ?? 0;
    if (!used) await new Promise((r) => setTimeout(r, 250));
  }
  check(used === 1, "usage recorded on the server");

  // 9. Embedded Greenhouse iframe on a company site.
  await context.route(COMPANY_URL, (route) => route.fulfill({ contentType: "text/html", body: COMPANY_HTML }));
  await context.route(EMBED_URL, (route) => route.fulfill({ contentType: "text/html", body: EMBED_HTML }));
  const company = await context.newPage();
  await company.goto(COMPANY_URL);
  // The extension has no permission for the company site itself, so find the tab
  // through the state the iframe's content script reported.
  let companyTab;
  for (let i = 0; i < 40 && !companyTab; i++) {
    companyTab = await worker.evaluate(async () => {
      const all = await chrome.storage.session.get(null);
      const entry = Object.entries(all).find(([k, v]) => k.startsWith("tab:") && v?.job?.title === "Data Engineer");
      return entry ? Number(entry[0].slice(4)) : undefined;
    });
    if (!companyTab) await new Promise((r) => setTimeout(r, 250));
  }
  check(companyTab !== undefined, "job detected inside the embedded Greenhouse iframe");
  await panel.goto(panelUrl(companyTab));
  await panel.getByRole("heading", { name: "Data Engineer" }).waitFor();
  await panel.getByRole("button", { name: "Autofill 4 fields" }).click();
  await panel.getByText(/Filled 4 fields/).waitFor();
  const frame = company.frame({ url: /job_app/ });
  const embedded = await frame.evaluate(() => [document.getElementById("fn").value, document.getElementById("em").value]);
  check(embedded[0] === "Priya" && embedded[1] === "priya.raman@example.com", "fields inside the embedded iframe filled");

  // 10. Multi-step Workday form: the second step's fields are picked up after "Next".
  await context.route(WORKDAY_URL, (route) => route.fulfill({ contentType: "text/html", body: WORKDAY_HTML }));
  const workday = await context.newPage();
  await workday.goto(WORKDAY_URL);
  const workdayTab = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id, WORKDAY_URL);
  await panel.goto(panelUrl(workdayTab));
  await panel.getByRole("button", { name: "Autofill 3 fields" }).click();
  await panel.getByText(/Filled 3 fields/).waitFor();
  check((await workday.inputValue("#legalNameSection_lastName")) === "Raman", "Workday step 1 filled");
  await workday.click("#next");
  await panel.getByRole("button", { name: "Autofill 3 fields" }).waitFor({ timeout: 10000 });
  await panel.getByRole("button", { name: "Autofill 3 fields" }).click();
  await panel.getByText(/Filled 3 fields/).waitFor();
  const step2 = await workday.evaluate(() => [document.getElementById("school").value, document.getElementById("degree").value]);
  check(step2[0] === "Anna University" && step2[1] === "B.Tech", `Workday step 2 filled after re-scan (${step2.join(", ")})`);

  // 11. Sign out from the panel.
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
