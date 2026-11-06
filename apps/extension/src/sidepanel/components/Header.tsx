import { Button, cn } from "@copilot/ui";
import { ChevronsRight, Moon, Settings, Sun } from "lucide-react";

import { send, useLocal } from "@/sidepanel/chrome-state";

import { Logo } from "@/sidepanel/components/Logo";
import type { SyncState, UserRead } from "@/shared/types";

const STATUS: Record<SyncState["state"], { label: string; dot: string }> = {
  idle: { label: "Connected", dot: "bg-success" },
  ok: { label: "Synced", dot: "bg-success" },
  syncing: { label: "Syncing…", dot: "bg-primary animate-pulse" },
  offline: { label: "Offline", dot: "bg-warning" },
  error: { label: "Sync failed", dot: "bg-destructive" },
};

function initials(user: UserRead) {
  const source = user.full_name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Header({
  user,
  sync,
  onSettings,
  onClose,
}: {
  user: UserRead;
  sync: SyncState;
  onSettings: () => void;
  /** Shown when the panel is docked in the page: collapses it to the edge tab. */
  onClose?: () => void;
}) {
  const status = STATUS[sync.state];
  const theme = useLocal("theme");
  const dark = document.documentElement.classList.contains("dark");
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
      <Logo />
      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={sync.error ?? undefined}>
        <span className={cn("size-2 rounded-full", status.dot)} aria-hidden="true" />
        {status.label}
      </span>
      <span className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-medium" title={user.email}>
        {initials(user)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={dark ? "Light theme" : "Dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
        data-theme={theme}
        onClick={() => send({ type: "SET_THEME", theme: dark ? "light" : "dark" })}
      >
        {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={onSettings} aria-label="Settings">
        <Settings aria-hidden="true" />
      </Button>
      {onClose && (
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close" title="Close">
          <ChevronsRight aria-hidden="true" />
        </Button>
      )}
    </header>
  );
}
