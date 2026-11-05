import { Button, cn } from "@copilot/ui";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";

import { Logo } from "@/components/Logo";
import { useServices, useSession } from "@/lib/services";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/profile", label: "Profile" },
  { to: "/resumes", label: "Resumes" },
  { to: "/answers", label: "Answers" },
];

export function initials(name: string | null | undefined, email: string): string {
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
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <NavLink to="/" aria-label="Copilot home">
            <Logo textClassName="hidden sm:inline" />
          </NavLink>
          <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground md:inline">{user.email}</span>
              <span
                className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-medium"
                title={user.email}
                aria-hidden="true"
              >
                {initials(user.full_name, user.email)}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut} loading={signingOut} aria-label="Sign out">
                {!signingOut && <LogOut aria-hidden="true" />}
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
