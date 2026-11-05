import { Button } from "@copilot/ui";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router";

import { Logo } from "@/components/Logo";
import { useServices, useSession } from "@/lib/services";

function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AppShell() {
  const { auth } = useServices();
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const user = session.user;

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
              <span
                className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-medium"
                aria-hidden="true"
              >
                {initials(user.full_name, user.email)}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut} loading={signingOut}>
                {!signingOut && <LogOut aria-hidden="true" />}
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
