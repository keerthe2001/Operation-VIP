/**
 * Builds the extension into dist/:
 *   - side panel (HTML + React) and background service worker as ES modules
 *   - content script as a single IIFE (content scripts cannot import modules)
 *   - manifest.json generated from API_URL / WEB_URL
 *
 * Usage: API_URL=https://api.example.com WEB_URL=https://app.example.com node scripts/build.mjs [--watch]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = `${root}src`;
const dist = `${root}dist`;
const watch = process.argv.includes("--watch");

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const define = {
  __API_URL__: JSON.stringify(API_URL),
  __WEB_URL__: JSON.stringify(WEB_URL),
  // E2E builds open the assistant's shadow root so tests can reach it; real builds keep it closed.
  __WIDGET_SHADOW__: JSON.stringify(process.env.E2E === "1" ? "open" : "closed"),
  "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
};
const resolve = { alias: { "@": src } };

await build({
  configFile: false,
  root: src,
  base: "/",
  publicDir: `${root}public`,
  define,
  resolve,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: dist,
    emptyOutDir: true,
    sourcemap: watch ? "inline" : false,
    watch: watch ? {} : null,
    rolldownOptions: {
      input: { sidepanel: `${src}/sidepanel/index.html`, background: `${src}/background/index.ts` },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  logLevel: "warn",
});

await build({
  configFile: false,
  publicDir: false,
  define,
  resolve,
  build: {
    outDir: dist,
    emptyOutDir: false,
    sourcemap: watch ? "inline" : false,
    watch: watch ? {} : null,
    lib: { entry: `${src}/content/index.ts`, formats: ["iife"], name: "CopilotContent", fileName: () => "content.js" },
  },
  logLevel: "warn",
});

// The floating assistant: React in a shadow root, top frame only.
await build({
  configFile: false,
  publicDir: false,
  define,
  resolve,
  plugins: [react()],
  build: {
    outDir: dist,
    emptyOutDir: false,
    sourcemap: watch ? "inline" : false,
    watch: watch ? {} : null,
    lib: { entry: `${src}/widget/index.tsx`, formats: ["iife"], name: "CopilotWidget", fileName: () => "widget.js" },
  },
  logLevel: "warn",
});

const pkg = JSON.parse(await readFile(`${root}package.json`, "utf8"));
const key = (await readFile(`${root}extension-key.pub.txt`, "utf8")).trim();
const apiOrigin = new URL(API_URL).origin;
const webOrigin = new URL(WEB_URL).origin;

// Content scripts run automatically only on supported portals; other sites are
// opt-in through optional_host_permissions (requested from the side panel).
const PORTALS = [
  "https://*.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://*.myworkdayjobs.com/*",
  "https://*.myworkday.com/*",
  "https://jobs.ashbyhq.com/*",
  "https://www.linkedin.com/jobs/*",
  // More applicant tracking systems and job boards.
  "https://jobs.smartrecruiters.com/*",
  "https://*.icims.com/*",
  "https://jobs.jobvite.com/*",
  "https://*.bamboohr.com/*",
  "https://*.taleo.net/*",
  "https://*.successfactors.com/*",
  "https://*.naukri.com/*",
  "https://www.naukri.com/*",
  "https://smartapply.indeed.com/*",
  "https://wellfound.com/*",
];

const manifest = {
  manifest_version: 3,
  name: "Copilot – Job Application Assistant",
  short_name: "Copilot",
  version: pkg.version,
  description: "Detects job applications and fills them from your Copilot profile. You always review and submit.",
  key,
  minimum_chrome_version: "116",
  icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
  action: { default_title: "Open Copilot", default_icon: { 16: "icons/16.png", 32: "icons/32.png" } },
  background: { service_worker: "background.js", type: "module" },
  permissions: ["storage", "alarms", "scripting", "activeTab"],
  // The in-page drawer shows the Copilot panel in an iframe. use_dynamic_url gives it a
  // per-session address, and the panel also checks a one-time code from the background.
  web_accessible_resources: [
    { resources: ["sidepanel/index.html", "assets/*", "icons/*"], matches: ["<all_urls>"], use_dynamic_url: true },
  ],
  host_permissions: [`${apiOrigin}/*`, ...PORTALS],
  optional_host_permissions: ["https://*/*", "http://*/*"],
  content_scripts: [
    { matches: PORTALS, js: ["content.js"], run_at: "document_idle", all_frames: true },
    { matches: PORTALS, js: ["widget.js"], run_at: "document_idle", all_frames: false },
  ],
  externally_connectable: { matches: [`${webOrigin}/*`] },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};

await mkdir(dist, { recursive: true });
await writeFile(`${dist}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Built extension → ${dist} (API ${apiOrigin}, web ${webOrigin})`);
