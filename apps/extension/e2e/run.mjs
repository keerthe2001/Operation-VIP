/**
 * End-to-end check of the extension in real Chromium.
 *
 * Prerequisites: API on :8000 and web app on :5173 running, extension built with E2E=1 (opens the
 * assistant's shadow root so the test can reach it).
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

// A plain careers form: placeholders only, "Contact number", and a hidden CV input behind
// a "Browse Files" button. Served on a Lever host so the content script runs there.
const PLAIN_URL = "https://jobs.lever.co/pixelworks/career";
const PLAIN_HTML = `<!doctype html><html><head><title>Career - Pixelworks</title></head><body><form>
  <div><input name="your-name" placeholder="Name"></div><div><input name="contact" placeholder="Contact number"></div>
  <div><input name="your-email" type="email" placeholder="Email"></div>
  <div><textarea name="message" placeholder="MESSAGE"></textarea></div>
  <div><p>Upload CV:</p><div class="dz"><input type="file" name="file-583" style="display:none"><button type="button">Browse Files</button></div></div>
</form></body></html>`;
// A page with a single field that isn't recognised until the user asks to fill it.
const WEAK_URL = "https://jobs.lever.co/pixelworks/newsletter";
const WEAK_HTML = `<!doctype html><html><head><title>Newsletter</title></head><body><form>
  <input type="email" placeholder="Your email"></form></body></html>`;

// A Naukri-style job posting with structured data: the floating assistant shows as a bubble.
const NAUKRI_URL = "https://www.naukri.com/job-listings-data-scientist-northwind-bengaluru-2-to-4-years-061126000123";
const NAUKRI_HTML = `<!doctype html><html><head><title>Data Scientist - Northwind - Bengaluru | Naukri.com</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "JobPosting", title: "Data Scientist",
  hiringOrganization: { "@type": "Organization", name: "Northwind" },
  description: "<p>Location: Bengaluru</p><p>We need 2+ years of experience with Python, PostgreSQL, Snowflake and Airflow.</p>",
})}</script></head><body><h1>Data Scientist</h1><button>Apply</button></body></html>`;
// An application form for the assistant's one-click autofill.
const WIDGET_FORM_URL = "https://jobs.lever.co/pixelworks/apply-widget";
const WIDGET_FORM_HTML = `<!doctype html><html><head><title>Apply - Pixelworks</title></head><body><form>
  <label for="a">First Name</label><input id="a"><label for="b">Last Name</label><input id="b">
  <label for="c">Email Address</label><input id="c" type="email"><label for="d">Mobile Number</label><input id="d" type="tel">
  <label for="e">City</label><input id="e"><label for="f">Latest Employer Name</label><input id="f">
</form></body></html>`;

// A Workday-style create-account step.
const ACCOUNT_URL = "https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Pune/Analyst_R-9/apply/createAccount";
const ACCOUNT_HTML = `<!doctype html><html><head><title>Create Account</title></head><body>
<div id="shell" style="position:fixed;top:0;left:0;right:0;bottom:0;overflow:auto"><h2>Create Account</h2><form>
  <label for="em">Email Address</label><input id="em" type="email">
  <label for="pw">Password</label><input id="pw" type="password" autocomplete="new-password">
  <label for="pw2">Verify New Password</label><input id="pw2" type="password">
  <label><input type="checkbox" id="agree"> I agree to the terms</label>
</form></div></body></html>`;

// A Workday-style "My Information" step: tall page, custom dropdowns that open a listbox,
// a required consent box and the step's own Save and Continue button.
const STEP_URL = "https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Pune/Analyst_R-9/apply/myInformation";
const STEP_HTML = `<!doctype html><html><head><title>My Information</title>
<style>.gap{height:700px} [role=listbox]{position:absolute;background:#fff;border:1px solid #999;list-style:none;margin:0;padding:0}</style></head><body>
<h2>My Information</h2>
<label for="fn">First Name</label><input id="fn"><div class="gap"></div>
<label id="ptl">Phone Device Type</label><button id="ptype" type="button" aria-haspopup="listbox" aria-labelledby="ptl">Select One</button><div class="gap"></div>
<label id="pcl">Country / Territory Phone Code</label><button id="pcode" type="button" aria-haspopup="listbox" aria-labelledby="pcl">Select One</button>
<label for="ph">Phone Number</label><input id="ph"><div class="gap"></div>
<label><input type="checkbox" id="consent" required> I accept the privacy statement *</label>
<button id="next" type="button">Save and Continue</button>
<script>
  let scrolls = []; addEventListener("scroll", () => scrolls.push(Math.round(scrollY)));
  window.__scrolls = () => scrolls;
  window.__continued = 0;
  document.getElementById("next").addEventListener("click", () => window.__continued++);
  const lists = { ptype: ["Landline", "Mobile", "Other"], pcode: ["Afghanistan (+93)", "India (+91)", "Indonesia (+62)", "United States of America (+1)"] };
  for (const [id, items] of Object.entries(lists)) {
    const button = document.getElementById(id);
    button.addEventListener("click", () => {
      document.querySelector("[role=listbox]")?.remove();
      const list = document.createElement("ul"); list.setAttribute("role", "listbox");
      for (const text of items) {
        const li = document.createElement("li"); li.setAttribute("role", "option"); li.textContent = text;
        li.addEventListener("click", () => { button.textContent = text; list.remove(); });
        list.append(li);
      }
      document.body.append(list);
    });
  }
</script></body></html>`;

// A whole application in Auto mode: account step (the account exists → sign in), a step
// with one required question for the user, a review page with the final Submit.
const FLOW_URL = "https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Pune/Analyst_R-77/apply";
const FLOW_HTML = `<!doctype html><html><head><title>Apply - Analyst</title></head><body><main id="app"></main>
<script>
  const app = document.getElementById("app");
  window.__clicks = [];
  const steps = {
    create: () => \`<h2>Create Account</h2><form onsubmit="return false">
      <label for="em">Email Address</label><input id="em" type="email" required>
      <label for="pw">Password</label><input id="pw" type="password" required>
      <label for="pw2">Verify New Password</label><input id="pw2" type="password" required>
      <label><input type="checkbox" id="ok" required> I accept the privacy statement *</label>
      \${window.__exists ? '<p role="alert">An account already exists for this email address.</p>' : ""}
      <button type="submit" id="go">Create Account</button>
      <p>Already have an account? <a href="#" id="signin">Sign In</a></p></form>\`,
    signin: () => \`<h2>Sign In</h2><form onsubmit="return false">
      <label for="em">Email Address</label><input id="em" type="email" required>
      <label for="pw">Password</label><input id="pw" type="password" required>
      <button type="submit" id="go">Sign In</button></form>\`,
    info: () => \`<h2>My Information</h2><form onsubmit="return false">
      <label for="fn">First Name</label><input id="fn" required>
      <label for="ln">Last Name</label><input id="ln" required>
      <label for="why">Why do you want to join Acme? *</label><textarea id="why" required></textarea>
      <button type="submit" id="go">Save and Continue</button></form>\`,
    review: () => \`<h2>Review</h2><p>Check your application.</p><button type="button" id="go">Submit</button>\`,
    done: () => \`<h2>Thank you for applying!</h2><p>Your application has been submitted.</p>\`,
  };
  let step = "create";
  const render = () => { app.innerHTML = steps[step](); };
  app.addEventListener("click", (e) => {
    const t = e.target;
    if (t.id === "signin") { e.preventDefault(); window.__clicks.push("signin-link"); step = "signin"; render(); }
    if (t.id !== "go") return;
    window.__clicks.push(t.textContent);
    if (step === "create") { window.__exists = true; render(); }
    else if (step === "signin") { window.__signedIn = [document.getElementById("em").value, document.getElementById("pw").value]; step = "info"; render(); }
    else if (step === "info") { step = "review"; render(); }
    else if (step === "review") { step = "done"; render(); }
  });
  render();
</script></body></html>`;

/** Clicks until `done()` resolves true: the embedded panel can re-layout while live updates arrive. */
async function clickUntil(locator, done, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    // Playwright's mouse clicks into an iframe inside a shadow root occasionally miss in this
    // headless setup; after one real click, dispatch the event directly.
    if (i === 0) await locator.click({ timeout: 8000 }).catch(() => undefined);
    else await locator.dispatchEvent("click").catch(() => undefined);
    if (await done().then((v) => v, () => false)) return true;
  }
  return false;
}

// Workday's "My Experience" step: repeatable sections behind "Add" buttons, split Month/Year
// dates, a skills search box that takes one skill at a time, a hidden resume upload.
const EXP_URL = "https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Pune/Analyst_R-88/apply/myExperience";
const EXP_HTML = `<!doctype html><html><head><title>My Experience</title></head><body>
<h2>My Experience</h2>
<section id="work"><h3>Work Experience</h3><div class="entries"></div><button type="button" class="add">Add</button></section>
<section id="edu"><h3>Education</h3><p>Type in school name and click enter.</p><div class="entries"></div><button type="button" class="add">Add</button></section>
<section><h3>Skills</h3><label for="skills">Type to Add Skills</label>
  <input id="skills" data-uxi-widget-type="selectinput" aria-autocomplete="list"><ul id="chips"></ul></section>
<section><h3>Resume/CV</h3><p>Upload a file (5MB max)</p>
  <div class="drop"><input type="file" id="cv" style="display:none"><span>Drop files here</span> or <button type="button">Select files</button></div></section>
<section><h3>Social Network URLs</h3><label for="li">LinkedIn</label><input id="li"></section>
<button type="button" id="next">Save and Continue</button>
<script>
  let n = 0;
  const block = (kind) => {
    n++;
    if (kind === "work") return \`<div class="entry">
      <label for="t\${n}">Job Title</label><input id="t\${n}" class="title">
      <label for="c\${n}">Company</label><input id="c\${n}" class="company">
      <label><input type="checkbox" class="current"> I currently work here</label>
      <div role="group" aria-labelledby="fl\${n}"><span id="fl\${n}">From</span>
        <input aria-label="Month" class="fm" placeholder="MM"><input aria-label="Year" class="fy" placeholder="YYYY"></div>
      <label for="d\${n}">Role Description</label><textarea id="d\${n}" class="desc"></textarea></div>\`;
    return \`<div class="entry"><label for="s\${n}">School or University</label><input id="s\${n}" class="school">
      <label for="g\${n}">Degree</label><input id="g\${n}" class="degree"></div>\`;
  };
  for (const id of ["work", "edu"]) {
    const sec = document.getElementById(id);
    sec.querySelector(".add").addEventListener("click", () => {
      sec.querySelector(".entries").insertAdjacentHTML("beforeend", block(id));
      sec.querySelector(".add").textContent = "Add Another";
    });
  }
  const skills = document.getElementById("skills");
  const known = ["Python", "Go", "SQL", "JavaScript", "AWS", "Docker", "Kubernetes", "PostgreSQL", "Git", "Terraform", "Django"];
  skills.addEventListener("input", () => {
    document.querySelector("[role=listbox]")?.remove();
    const q = skills.value.toLowerCase(); if (!q) return;
    const list = document.createElement("ul"); list.setAttribute("role", "listbox");
    for (const k of known.filter((k) => k.toLowerCase().startsWith(q))) {
      const li = document.createElement("li"); li.setAttribute("role", "option"); li.textContent = k;
      li.addEventListener("click", () => { document.getElementById("chips").insertAdjacentHTML("beforeend", "<li class=chip>" + k + "</li>"); list.remove(); });
      list.append(li);
    }
    document.body.append(list);
  });
  window.__atContinue = null;
  document.getElementById("next").addEventListener("click", () => {
    window.__atContinue = {
      titles: [...document.querySelectorAll(".title")].map((i) => i.value),
      companies: [...document.querySelectorAll(".company")].map((i) => i.value),
      months: [...document.querySelectorAll(".fm")].map((i) => i.value),
      years: [...document.querySelectorAll(".fy")].map((i) => i.value),
      schools: [...document.querySelectorAll(".school")].map((i) => i.value),
      chips: [...document.querySelectorAll(".chip")].map((c) => c.textContent),
      cv: document.getElementById("cv").files[0]?.name ?? null,
      linkedin: document.getElementById("li").value,
    };
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
  // Most steps below exercise filling on request; the Auto apply mode is tested on its own.
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "manual" } }));
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
  await panel.getByText(/Filled \d+ fields?/).first().waitFor();
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
  check(values.resume === "Priya_Raman_Resume.pdf" && values.resumeSize > 1000, `resume attached (${values.resume}, ${values.resumeSize} bytes)`);
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

  // 8c. Application tracking.
  const listApplications = () =>
    fetch(`${API}/api/v1/applications`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
  let tracked = [];
  for (let i = 0; i < 20 && !(tracked[0]?.status === "in_progress"); i++) {
    tracked = await listApplications();
    if (!(tracked[0]?.status === "in_progress")) await new Promise((r) => setTimeout(r, 250));
  }
  check(tracked.length === 1 && tracked[0].company_name === "Acme Corp", "application recorded in the tracker");
  check(tracked[0].status === "in_progress" && tracked[0].fields_filled >= 8, `autofill moved it to in progress (${tracked[0].fields_filled} fields filled)`);
  const detail = await fetch(`${API}/api/v1/applications/${tracked[0].id}`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
  check(detail.answers.length === 1 && detail.resume_file_name === "priya_raman_resume.pdf", "inserted answer and resume version linked to the application");
  await panel.getByRole("button", { name: /I submitted this application/ }).click();
  await panel.getByText("Marked as submitted").waitFor();
  check((await listApplications())[0].status === "submitted", "user marked the application submitted from the panel");
  await page.goto(`${WEB}/applications`);
  await page.getByText("Senior Backend Engineer").waitFor();
  if (shots) await page.screenshot({ path: `${shots}/web-applications.png`, fullPage: true });
  await page.getByText("Senior Backend Engineer").click();
  await page.getByRole("dialog").getByText("Answers you inserted").waitFor();
  if (shots) await page.screenshot({ path: `${shots}/web-application-detail.png` });
  check(true, "web tracker shows the application with its timeline and answers");

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
  await workday.waitForFunction(() => document.getElementById("degree")?.value !== "", null, { timeout: 15000 }).catch(() => undefined);
  const step2 = await workday.evaluate(() => [document.getElementById("school").value, document.getElementById("degree").value]);
  check(step2[0] === "Anna University" && step2[1] === "B.Tech", `Workday step 2 filled after re-scan (${step2.join(", ")})`);

  // 10b. Plain careers form is recognised on its own; a weak form can be filled on request.
  await context.route(PLAIN_URL, (route) => route.fulfill({ contentType: "text/html", body: PLAIN_HTML }));
  await context.route(WEAK_URL, (route) => route.fulfill({ contentType: "text/html", body: WEAK_HTML }));
  const plain = await context.newPage();
  await plain.goto(PLAIN_URL);
  const plainTab = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id, PLAIN_URL);
  await panel.goto(panelUrl(plainTab));
  await panel.getByText("Application detected").waitFor();
  await panel.getByRole("button", { name: /^Autofill \d+ fields?$/ }).click();
  await panel.getByText(/Filled \d+ fields?/).waitFor();
  const plainValues = await plain.evaluate(() => ({
    name: document.querySelector("[name=your-name]").value,
    phone: document.querySelector("[name=contact]").value,
    email: document.querySelector("[name=your-email]").value,
    cv: document.querySelector("[name=file-583]").files[0]?.name ?? null,
  }));
  check(
    plainValues.name.startsWith("Priya") && plainValues.phone === "+919876543210" && plainValues.email === "priya.raman@example.com" && plainValues.cv === "Priya_Raman_Resume.pdf",
    `plain careers form filled, CV attached to the hidden input (${JSON.stringify(plainValues)})`,
  );
  const weak = await context.newPage();
  await weak.goto(WEAK_URL);
  const weakTab = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id, WEAK_URL);
  await panel.goto(panelUrl(weakTab));
  await panel.getByRole("button", { name: /Fill this page anyway/ }).click();
  await panel.getByRole("button", { name: "Autofill 1 field" }).click();
  await panel.getByText(/Filled 1 field/).waitFor();
  check((await weak.inputValue("input[type=email]")) === "priya.raman@example.com", "\"Fill this page anyway\" fills an unrecognised form");

  // 10c. In-page drawer with the full Copilot panel (no Chrome side panel).
  const widget = (p) => p.locator("copilot-assistant");
  const panelIn = (p) => widget(p).locator("iframe").contentFrame();
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  check(!manifest.side_panel && !manifest.permissions.includes("sidePanel"), "Chrome's side panel is gone; the drawer is the only panel");
  await context.route(NAUKRI_URL, (route) => route.fulfill({ contentType: "text/html", body: NAUKRI_HTML }));
  const naukri = await context.newPage();
  await naukri.goto(NAUKRI_URL);
  const bubble = widget(naukri).getByRole("button", { name: "Open Copilot" });
  await bubble.waitFor({ timeout: 15000 });
  check(true, "edge tab shown on a Naukri job posting");
  if (shots) await naukri.screenshot({ path: `${shots}/widget-bubble.png` });
  await bubble.click();
  await widget(naukri).locator(".drawer.open").waitFor();
  await panelIn(naukri).getByRole("heading", { name: "Data Scientist" }).waitFor({ timeout: 15000 });
  await naukri.waitForTimeout(400); // slide-in animation
  const drawer = await widget(naukri).locator(".drawer").boundingBox();
  const viewport = naukri.viewportSize();
  check(Math.round(drawer.x + drawer.width) === viewport.width && Math.round(drawer.height) === viewport.height, "drawer docks full-height on the right with the Copilot panel inside");
  const pageWidth = await naukri.evaluate(() => document.documentElement.getBoundingClientRect().width);
  check(Math.abs(pageWidth - (viewport.width - 380)) < 2, `page shrinks to make room for the drawer (${pageWidth}px)`);
  await clickUntil(panelIn(naukri).getByRole("tab", { name: /Match/ }), () => panelIn(naukri).getByText(/^Missing \(/).waitFor({ timeout: 5000 }).then(() => true));
  check(await panelIn(naukri).getByText("Snowflake").isVisible(), "Match tab lists skills missing from the profile");
  if (shots) await naukri.screenshot({ path: `${shots}/widget-match.png` });
  await clickUntil(panelIn(naukri).getByRole("tab", { name: /Autofill/ }), () =>
    panelIn(naukri).getByRole("button", { name: "Save job" }).waitFor({ timeout: 4000 }).then(() => true),
  );
  await clickUntil(panelIn(naukri).getByRole("button", { name: "Save job" }), () =>
    panelIn(naukri).getByText(/^Tracked/).waitFor({ timeout: 6000 }).then(() => true),
  );
  check(true, "job saved to the tracker from the panel");
  const storedTheme = () => worker.evaluate(async () => (await chrome.storage.local.get("theme")).theme);
  await clickUntil(panelIn(naukri).getByRole("button", { name: /theme$/ }), async () => {
    await naukri.waitForTimeout(500);
    return (await storedTheme()) !== undefined && (await storedTheme()) !== "system";
  });
  const theme = await storedTheme();
  check(theme === "light" || theme === "dark", `theme switch saved (${theme})`);
  // The panel's close button collapses the drawer to the edge tab.
  await clickUntil(panelIn(naukri).getByRole("button", { name: "Close", exact: true }), () => bubble.waitFor({ timeout: 5000 }).then(() => true));
  const restored = await naukri.evaluate(() => document.documentElement.getBoundingClientRect().width);
  check(Math.abs(restored - viewport.width) < 2, "close collapses it and the page returns to full width");
  const box = await bubble.boundingBox();
  const savedTabY = () => worker.evaluate(async () => (await chrome.storage.local.get("widget")).widget?.y);
  for (let attempt = 0; attempt < 2; attempt++) {
    const from = await bubble.boundingBox();
    await naukri.mouse.move(from.x + 20, from.y + 20);
    await naukri.mouse.down();
    await naukri.mouse.move(200, 500, { steps: 8 });
    await naukri.mouse.up();
    await naukri.waitForTimeout(400);
    if ((await savedTabY()) > box.y) break;
  }
  const tabBox = await bubble.boundingBox();
  const savedY = await savedTabY();
  check(Math.round(tabBox.x + tabBox.width) === viewport.width && Math.abs(savedY - tabBox.y) < 2 && savedY > box.y, "edge tab drags vertically, stays on the edge, position saved");
  // Toolbar icon: the same toggle message the icon's click handler sends.
  const naukriTab = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]?.id, NAUKRI_URL);
  const toggle = (tabId) => worker.evaluate(async (id) => chrome.tabs.sendMessage(id, { type: "WIDGET_TOGGLE" }, { frameId: 0 }), tabId);
  await toggle(naukriTab);
  await widget(naukri).locator(".drawer.open").waitFor();
  await toggle(naukriTab);
  await bubble.waitFor();
  check(true, "toolbar icon opens the drawer, and closes it on the next click");
  // Another website can't load the panel without the drawer's one-time code.
  const forged = await naukri.evaluate(async (base) => {
    const frame = document.createElement("iframe");
    frame.src = `${base}sidepanel/index.html?tab=1&embed=1&nonce=guess`;
    document.body.append(frame);
    await new Promise((r) => setTimeout(r, 1500));
    try { return frame.contentDocument?.body?.innerText ?? "blocked"; } catch { return "blocked"; }
  }, `chrome-extension://${extensionId}/`);
  check(forged === "blocked" || !/Autofill|Profile/.test(forged), "other websites can't embed the panel");

  await context.route(WIDGET_FORM_URL, (route) => route.fulfill({ contentType: "text/html", body: WIDGET_FORM_HTML }));
  const form = await context.newPage();
  await form.goto(WIDGET_FORM_URL);
  const fillButton = panelIn(form).getByRole("button", { name: /^Autofill \d+ fields$/ });
  await fillButton.waitFor({ timeout: 15000 });
  await panelIn(form).getByText(/^Tracked/).waitFor({ timeout: 10000 }).catch(() => undefined); // let the panel settle
  if (shots) await form.screenshot({ path: `${shots}/widget-autofill.png` });
  await clickUntil(fillButton, () => form.waitForFunction(() => document.getElementById("f").value !== "", null, { timeout: 8000 }).then(() => true));
  const formValues = await form.evaluate(() => ["a", "b", "c", "d", "e", "f"].map((id) => document.getElementById(id).value));
  check(
    formValues[0] === "Priya" && formValues[2] === "priya.raman@example.com" && formValues[4] !== "" && formValues[5] !== "",
    `drawer opened by itself on the form and filled it (${formValues.join(" | ")})`,
  );
  if (shots) await form.screenshot({ path: `${shots}/widget-filled.png` });

  // 10d. Create-account page: the preset job-site password goes into both password boxes.
  await worker.evaluate(async () => chrome.storage.local.set({ accountPassword: "Str0ng!Pass" }));
  await context.route(ACCOUNT_URL, (route) => route.fulfill({ contentType: "text/html", body: ACCOUNT_HTML }));
  const account = await context.newPage();
  await account.goto(ACCOUNT_URL);
  const accountFill = panelIn(account).getByRole("button", { name: /^Autofill \d+ fields$/ });
  await accountFill.waitFor({ timeout: 15000 });
  await panelIn(account).getByText(/^Tracked/).waitFor({ timeout: 10000 }).catch(() => undefined);
  await clickUntil(accountFill, () => account.waitForFunction(() => document.getElementById("pw2").value !== "", null, { timeout: 8000 }).then(() => true));
  const creds = await account.evaluate(() => [document.getElementById("em").value, document.getElementById("pw").value, document.getElementById("pw2").value]);
  check(creds[0] === "priya.raman@example.com" && creds[1] === "Str0ng!Pass" && creds[2] === "Str0ng!Pass", "create-account page: email and both password boxes filled");
  const shellRight = await account.evaluate(() => document.getElementById("shell").getBoundingClientRect().right);
  check(Math.abs(shellRight - (account.viewportSize().width - 380)) < 2, `full-screen app layer (Workday-style) moves out from under the drawer (right edge ${shellRight})`);
  const sessionDump = await worker.evaluate(async () => JSON.stringify(await chrome.storage.session.get(null)));
  check(!sessionDump.includes("Str0ng!Pass"), "the password never lands in the tab state");
  if (shots) await account.screenshot({ path: `${shots}/widget-account.png` });

  // 10e. Interactive fill on a Workday-style step: scrolls field by field, picks options in
  // custom dropdowns, ticks the required consent, shows progress, and the panel's copy of the
  // page's button presses Save and Continue.
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "manual", fillProgress: "popup" } }));
  await context.route(STEP_URL, (route) => route.fulfill({ contentType: "text/html", body: STEP_HTML }));
  const step = await context.newPage();
  await step.goto(STEP_URL);
  const stepFill = panelIn(step).getByRole("button", { name: /^Autofill \d+ fields$/ });
  await stepFill.waitFor({ timeout: 15000 });
  await clickUntil(stepFill, () => widget(step).locator(".progress-card").waitFor({ timeout: 6000 }).then(() => true));
  await widget(step).locator(".progress-card").waitFor({ timeout: 10000 });
  if (shots) await step.screenshot({ path: `${shots}/fill-progress.png` });
  await widget(step).getByText("Completed!").waitFor({ timeout: 20000 });
  const stepValues = await step.evaluate(() => ({
    first: document.getElementById("fn").value,
    type: document.getElementById("ptype").textContent,
    code: document.getElementById("pcode").textContent,
    phone: document.getElementById("ph").value,
    consent: document.getElementById("consent").checked,
    scrolls: window.__scrolls(),
  }));
  check(stepValues.first === "Priya" && stepValues.type === "Mobile" && stepValues.code === "India (+91)", `custom dropdowns chosen like a person would (${stepValues.type}, ${stepValues.code})`);
  check(stepValues.phone === "9876543210", `phone number without the country code when the form asks for it separately (${stepValues.phone})`);
  check(stepValues.consent, "required consent box ticked");
  const distinct = new Set(stepValues.scrolls.map((y) => Math.round(y / 200))).size;
  check(distinct >= 3, `page scrolled to each field while filling (${distinct} scroll positions)`);
  if (shots) await step.screenshot({ path: `${shots}/fill-done.png` });
  const actionButton = panelIn(step).getByRole("button", { name: /^Save and Continue/ });
  await clickUntil(actionButton, () => step.waitForFunction(() => window.__continued >= 1, null, { timeout: 6000 }).then(() => true));
  check(true, "panel's “Save and Continue” presses the page's own button");

  // 10f. Auto apply mode: account → sign in → fill → the user answers one question → review → submit.
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "auto", fillProgress: "off" } }));
  await context.route(FLOW_URL, (route) => route.fulfill({ contentType: "text/html", body: FLOW_HTML }));
  const flow = await context.newPage();
  await flow.goto(FLOW_URL);
  await flow.waitForFunction(() => window.__signedIn, null, { timeout: 40000 });
  const signedIn = await flow.evaluate(() => ({ creds: window.__signedIn, clicks: window.__clicks }));
  check(signedIn.clicks[0] === "Create Account" && signedIn.clicks.includes("signin-link"), `auto: created the account, saw it exists and switched to Sign In (${signedIn.clicks.join(" → ")})`);
  check(signedIn.creds[0] === "priya.raman@example.com" && signedIn.creds[1] === "Str0ng!Pass", "auto: signed in with the saved email and password");
  await flow.waitForFunction(() => document.getElementById("ln")?.value === "Raman", null, { timeout: 20000 });
  const needItem = panelIn(flow).getByRole("button", { name: /Why do you want to join Acme/ });
  await needItem.waitFor({ timeout: 15000 });
  check(true, "auto: filled the next page and stopped at the question that needs the user");
  if (shots) await flow.screenshot({ path: `${shots}/flow-needs-you.png` });
  const focusedWhy = async () => flow.waitForFunction(() => document.activeElement?.id === "why", null, { timeout: 10000 }).then(() => true, () => false);
  await flow.waitForTimeout(1500); // let the panel settle after the step change
  await needItem.dispatchEvent("mousedown");
  if (!(await focusedWhy())) {
    await needItem.dispatchEvent("mousedown");
    if (!(await focusedWhy())) throw new Error("FAILED: needs-you click didn't focus the field");
  }
  check(true, "clicking a needs-you item in the panel jumps to that field");
  await flow.keyboard.type("I build data products and Acme's analytics team is where I want to grow.");
  await panelIn(flow).getByText("Everything is filled. Submit the application?").waitFor({ timeout: 20000 });
  const reviewClicks = await flow.evaluate(() => window.__clicks);
  check(reviewClicks.includes("Save and Continue") && !reviewClicks.includes("Submit"), "auto: continued once the user answered, then stopped before Submit");
  if (shots) await flow.screenshot({ path: `${shots}/flow-submit.png` });
  await clickUntil(panelIn(flow).getByRole("button", { name: "Submit", exact: true }), () =>
    flow.getByText("Thank you for applying!").waitFor({ timeout: 8000 }).then(() => true),
  );
  let flowStatus;
  for (let i = 0; i < 20 && flowStatus !== "submitted"; i++) {
    const apps = await fetch(`${API}/api/v1/applications`, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
    flowStatus = apps.find((a) => a.job_url?.startsWith("https://acme.wd1.myworkdayjobs.com/en-US/careers/job/Pune/Analyst_R-77"))?.status;
    if (flowStatus !== "submitted") await new Promise((r) => setTimeout(r, 250));
  }
  check(flowStatus === "submitted", `submitted after the user's OK and saved in the tracker (${flowStatus})`);
  await panelIn(flow).getByText("Submitted and saved to your tracker").waitFor();
  check(true, "activity log shows each step");
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "manual" } }));

  // 10g. Workday "My Experience" in Auto mode: Add sections, fill every block, then continue.
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "auto", fillProgress: "off" } }));
  const expCounts = await worker.evaluate(async () => {
    const p = (await chrome.storage.local.get("profile")).profile.profile;
    return { jobs: p.experience.length, schools: p.education.length, first: p.experience.find((e) => e.is_current) ?? p.experience[0], school: p.education[0]?.institution };
  });
  await context.route(EXP_URL, (route) => route.fulfill({ contentType: "text/html", body: EXP_HTML }));
  const exp = await context.newPage();
  await exp.goto(EXP_URL);
  await exp.waitForFunction(() => window.__atContinue, null, { timeout: 60000 });
  const atContinue = await exp.evaluate(() => window.__atContinue);
  if (shots) await exp.screenshot({ path: `${shots}/my-experience.png`, fullPage: true });
  check(atContinue.titles.length === expCounts.jobs && atContinue.schools.length === expCounts.schools, `pressed Add for each job and school in the profile (${atContinue.titles.length} jobs, ${atContinue.schools.length} schools)`);
  check(atContinue.titles[0] === expCounts.first.designation && atContinue.companies[0] === expCounts.first.company_name, `work experience filled before continuing (${atContinue.titles[0]} at ${atContinue.companies[0]})`);
  check(/^\d{2}$/.test(atContinue.months[0]) && /^\d{4}$/.test(atContinue.years[0]), `split From date filled as month and year (${atContinue.months[0]}/${atContinue.years[0]})`);
  check(atContinue.schools[0] === expCounts.school, `education filled (${atContinue.schools[0]})`);
  check(atContinue.chips.length >= 3, `skills entered one at a time in the search box (${atContinue.chips.join(", ")})`);
  check(atContinue.cv === "Priya_Raman_Resume.pdf" && atContinue.linkedin.includes("linkedin.com"), "resume uploaded under its section heading, LinkedIn filled");
  await worker.evaluate(async () => chrome.storage.local.set({ settings: { applyMode: "manual" } }));

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
