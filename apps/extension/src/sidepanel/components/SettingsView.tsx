import { Alert, Button, Input, NativeSelect } from "@copilot/ui";
import { ArrowLeft, Globe, LogOut, RefreshCw } from "lucide-react";
import { useId, useState } from "react";

import { send, useLocal } from "@/sidepanel/chrome-state";
import { AutofillSettings } from "@/sidepanel/components/AutofillSettings";
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
      <AccountPassword />
      <ThemeSettings />
      <WidgetSettings />
      <AutofillSettings />
      <Button variant="outline" size="sm" className="justify-self-start text-destructive" onClick={() => send({ type: "SIGN_OUT" })}>
        <LogOut aria-hidden="true" /> Sign out
      </Button>
    </div>
  );
}

function WidgetSettings() {
  const widget = useLocal("widget");
  const modeId = useId();
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">Copilot tab on pages</h2>
      <p className="text-xs text-muted-foreground">The tab on the right edge opens this panel. The toolbar icon opens it on any page.</p>
      <label htmlFor={modeId} className="text-xs font-medium">
        Show it
      </label>
      <NativeSelect
        id={modeId}
        value={widget.mode}
        onChange={(e) => send({ type: "SET_WIDGET_PREFS", prefs: { mode: e.target.value as "job_pages" | "always" | "off" } })}
      >
        <option value="job_pages">On job pages</option>
        <option value="always">On every page Copilot runs on</option>
        <option value="off">Never</option>
      </NativeSelect>
      {widget.hiddenHosts.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => send({ type: "SET_WIDGET_PREFS", prefs: { showOnAllHosts: true } })}
        >
          Show it again on {widget.hiddenHosts.length} hidden site{widget.hiddenHosts.length === 1 ? "" : "s"}
        </Button>
      )}
    </section>
  );
}

function AccountPassword() {
  const saved = useLocal("accountPassword");
  const id = useId();
  const [value, setValue] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const current = value ?? saved ?? "";
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">Job-site account password</h2>
      <p className="text-xs text-muted-foreground">Filled on sign-up and sign-in pages (Workday, Taleo…). Stored only on this device.</p>
      <div className="flex gap-2">
        <Input
          id={id}
          aria-label="Job-site account password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={current}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={() => setShow((s) => !s)}>
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      <Button
        size="sm"
        className="justify-self-start"
        disabled={value === null || value === (saved ?? "")}
        onClick={async () => {
          await send({ type: "SET_ACCOUNT_PASSWORD", password: current || null });
          setValue(null);
        }}
      >
        Save
      </Button>
    </section>
  );
}

function ThemeSettings() {
  const theme = useLocal("theme");
  const id = useId();
  return (
    <section className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        Theme
      </label>
      <NativeSelect id={id} value={theme} onChange={(e) => send({ type: "SET_THEME", theme: e.target.value as "system" | "light" | "dark" })}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </NativeSelect>
    </section>
  );
}
