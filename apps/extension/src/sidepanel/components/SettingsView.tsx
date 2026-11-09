import { Alert, Button, Input, NativeSelect } from "@copilot/ui";
import { ArrowLeft, Globe, LogOut, RefreshCw } from "lucide-react";
import { useId, useState } from "react";

import { send, useLocal, useWidgetPrefs } from "@/sidepanel/chrome-state";
import { AutofillSettings } from "@/sidepanel/components/AutofillSettings";
import { useEverySite } from "@/sidepanel/components/EverySite";
import { WEB_URL } from "@/shared/config";
import type { UserRead } from "@/shared/types";

export function SettingsView({ user, onBack }: { user: UserRead; onBack: () => void }) {
  const { enabled: allSites, message, enable: enableAllSites } = useEverySite();
  const sync = useLocal("sync");

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
          Copilot runs on 50+ job portals (Workday, Greenhouse, Lever, Ashby, iCIMS, SuccessFactors, Oracle, Workable…). Allow
          it on every site to fill company career pages too. It only reads pages on your device to find application forms.
        </p>
        {allSites ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-success">
            <Globe className="size-3.5" aria-hidden="true" /> Enabled on all career sites
          </p>
        ) : (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => void enableAllSites()}>
            <Globe aria-hidden="true" /> Turn on for every site
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
  const widget = useWidgetPrefs();
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
