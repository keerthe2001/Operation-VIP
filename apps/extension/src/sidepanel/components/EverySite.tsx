import { Alert, Button } from "@copilot/ui";
import { Globe } from "lucide-react";
import { useState } from "react";

import { send, useLocal } from "@/sidepanel/chrome-state";

const ALL_SITES = ["https://*/*", "http://*/*"];

/** Asks Chrome for access to every site (needs the user's click), then starts Copilot there. */
export function useEverySite() {
  const enabled = useLocal("allSitesEnabled");
  const [message, setMessage] = useState<string | null>(null);
  async function enable() {
    const granted = await chrome.permissions.request({ origins: ALL_SITES });
    if (!granted) {
      setMessage("Not allowed. Copilot keeps working on the job portals it knows.");
      return;
    }
    const reply = await send<boolean>({ type: "ENABLE_ALL_SITES" });
    setMessage(reply.ok ? "On for every career site, including tabs already open." : reply.error);
  }
  return { enabled, message, enable };
}

/** Top-of-panel prompt until Copilot may run on company career sites too. */
export function EverySiteCard() {
  const { enabled, message, enable } = useEverySite();
  if (enabled && !message) return null;
  return (
    <section aria-label="Every career site" className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      {enabled ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-success">
          <Globe className="size-3.5" aria-hidden="true" /> {message}
        </p>
      ) : (
        <>
          <p className="text-xs">
            <span className="font-semibold">Use Copilot on every company career site.</span> It already works on 50+ job portals; this
            lets it find and fill application forms anywhere. Pages are only read on your device.
          </p>
          <Button size="sm" className="justify-self-start" onClick={() => void enable()}>
            <Globe aria-hidden="true" /> Turn on for every site
          </Button>
          {message && <Alert>{message}</Alert>}
        </>
      )}
    </section>
  );
}
