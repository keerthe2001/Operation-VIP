import { Button } from "@copilot/ui";
import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { send, STALE_WORKER_EVENT, useLocal, useSettings } from "@/sidepanel/chrome-state";

/** Shown when the background is still running an older build of Copilot. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const onStale = () => setStale(true);
    window.addEventListener(STALE_WORKER_EVENT, onStale);
    return () => window.removeEventListener(STALE_WORKER_EVENT, onStale);
  }, []);
  if (!stale) return null;
  return (
    <div role="alert" className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
      <p className="flex-1">Copilot was updated. Restart it to finish the update, then refresh the job page.</p>
      <Button size="sm" onClick={() => chrome.runtime.reload()}>
        <RotateCw aria-hidden="true" /> Restart
      </Button>
    </div>
  );
}

const NOTES = [
  "Fills one field at a time and shows its progress",
  "Workday-style dropdowns, the page's Continue button, and copy-paste for fields it can't fill",
  "More settings, including which fields to autofill",
];

/** A short note after each update (Settings → “What's new” notification). */
export function WhatsNew() {
  const settings = useSettings();
  const seen = useLocal("seenVersion");
  // Render only once storage has loaded, so the note doesn't flash and shift the panel.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void chrome.storage.local.get(["seenVersion", "settings"]).then(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);
  const version = chrome.runtime.getManifest?.().version ?? "";
  if (!loaded || !settings.whatsNew || !version || seen === version) return null;
  return (
    <div className="mx-4 mt-4 grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-semibold">What's new in {version}</p>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Dismiss what's new" onClick={() => send({ type: "DISMISS_WHATS_NEW" })}>
          ×
        </button>
      </div>
      <ul className="list-disc pl-4 text-muted-foreground">
        {NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
