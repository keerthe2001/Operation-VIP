import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/sidepanel/App";

// Theme: the user's choice (Settings or the page assistant), else the system setting.
const media = window.matchMedia("(prefers-color-scheme: dark)");
let choice: "system" | "light" | "dark" = "system";
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", choice === "dark" || (choice === "system" && media.matches));
applyTheme();
media.addEventListener("change", applyTheme);
void chrome.storage.local.get("theme").then((r) => {
  choice = (r.theme as typeof choice) ?? "system";
  applyTheme();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.theme) {
    choice = (changes.theme.newValue as typeof choice) ?? "system";
    applyTheme();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
