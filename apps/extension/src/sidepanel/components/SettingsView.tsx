import { Alert, Button } from "@copilot/ui";
import { ArrowLeft, Globe, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

import { send, useLocal } from "@/sidepanel/chrome-state";
import { WEB_URL } from "@/shared/config";
import type { UserRead } from "@/shared/types";

const ALL_SITES = ["https://*/*", "http://*/*"];

export function SettingsView({ user, onBack }: { user: UserRead; onBack: () => void }) {
  const allSites = useLocal("allSitesEnabled");
  const sync = useLocal("sync");
  const [message, setMessage] = useState<string | null>(null);

  async function enableAllSites() {
    // Must run in the panel: permission prompts need a user gesture.
    const granted = await chrome.permissions.request({ origins: ALL_SITES });
    if (!granted) {
      setMessage("Permission not granted. Copilot keeps working on the supported job portals.");
      return;
    }
    const reply = await send<boolean>({ type: "ENABLE_ALL_SITES" });
    setMessage(reply.ok ? "Copilot now checks company career sites too. Reload open tabs to start." : reply.error);
  }

  return (
    <div className="grid gap-4 p-4">
      <Button variant="ghost" size="sm" className="-ml-2 justify-self-start" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back
      </Button>
      <section className="grid gap-1">
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <a className="text-xs font-medium text-primary hover:underline" href={`${WEB_URL}/profile`} target="_blank" rel="noreferrer">
          Manage profile on the website
        </a>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Profile sync</h2>
        <p className="text-xs text-muted-foreground">
          {sync.lastSyncedAt ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}` : "Not synced yet"}
          {sync.error ? ` · ${sync.error}` : ""}
        </p>
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => send({ type: "SYNC_PROFILE", force: true })}>
          <RefreshCw aria-hidden="true" /> Sync now
        </Button>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Where Copilot works</h2>
        <p className="text-xs text-muted-foreground">
          By default Copilot only runs on Greenhouse, Lever, Workday, Ashby and LinkedIn. You can allow it on company career
          sites too. It only reads pages to find application forms.
        </p>
        {allSites ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-success">
            <Globe className="size-3.5" aria-hidden="true" /> Enabled on all career sites
          </p>
        ) : (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={enableAllSites}>
            <Globe aria-hidden="true" /> Enable on all career sites
          </Button>
        )}
        {message && <Alert>{message}</Alert>}
      </section>
      <Button variant="outline" size="sm" className="justify-self-start text-destructive" onClick={() => send({ type: "SIGN_OUT" })}>
        <LogOut aria-hidden="true" /> Sign out
      </Button>
    </div>
  );
}
