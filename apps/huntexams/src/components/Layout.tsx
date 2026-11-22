import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

import { Icon } from "./Icon";

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" /><span>{label}…</span></div>;
}

export function ErrorBox({ error, retry }: { error: { message: string } | null; retry?: () => void }) {
  if (!error) return null;
  return (
    <div className="wrap page">
      <div className="alert bad stack" role="alert">
        <b>Couldn't load this page.</b>
        <span>{error.message}</span>
        {retry && <button className="btn btn-ghost btn-sm" type="button" onClick={retry} style={{ justifySelf: "start" }}>Try again</button>}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useSession();
  return (
    <button className="btn btn-text btn-sm" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}

export function Footer() {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="stack" style={{ gap: 8 }}>
          <Link to="/" className="brand"><span className="mark" aria-hidden="true" />HuntExams</Link>
          <p>Learn AI engineering by seeing it move, then building it.</p>
        </div>
        <div><h4>Learn</h4><Link to="/roadmap">Roadmap</Link><Link to="/learn">All topics</Link><Link to="/guides">Guides</Link></div>
        <div><h4>Product</h4><Link to="/pricing">Pricing</Link><Link to="/verify">Verify a certificate</Link></div>
        <div><h4>Company</h4><Link to="/about">About</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const links = [["/roadmap", "Roadmap"], ["/learn", "See it move"], ["/pricing", "Pricing"], ["/guides", "Guides"]] as const;
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <header className="topnav">
        <div className="wrap">
          <Link to="/" className="brand"><span className="mark" aria-hidden="true" />HuntExams</Link>
          <nav aria-label="Main">
            {links.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "on" : "")}>{label}</NavLink>)}
          </nav>
          <div className="right">
            <ThemeToggle />
            {user ? (
              <Link className="btn btn-primary btn-sm" to="/dashboard">My dashboard</Link>
            ) : (
              <>
                <Link className="btn btn-text btn-sm hide-m" to="/login">Log in</Link>
                <Link className="btn btn-primary btn-sm" to="/signup">Start free</Link>
              </>
            )}
            <button className="menu-btn" type="button" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="mobile-menu"><div className="wrap">
          {links.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
          {!user && <Link to="/login">Log in</Link>}
        </div></div>
      )}
      <main id="main"><Outlet /></main>
      <Footer />
    </>
  );
}

export function RequireAuth({ children, onboarded = true, admin = false }: { children: ReactNode; onboarded?: boolean; admin?: boolean }) {
  const { user, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  if (onboarded && !admin && !user.profile.onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function AppLayout() {
  const { user, logout } = useSession();
  const loc = useLocation();
  // Admin screens don't need learner onboarding.
  const isAdmin = loc.pathname.startsWith("/admin");
  const items = [["/dashboard", "home", "Home"], ["/roadmap", "map", "Roadmap"], ["/practice", "check", "Practice"],
    ["/missions", "folder", "Missions"], ["/profile", "user", "Profile"]] as const;
  return (
    <RequireAuth onboarded={!isAdmin}>
      <a href="#main" className="skip">Skip to content</a>
      <div className="shell">
        <aside className="side" aria-label="App">
          <Link to="/" className="brand"><span className="mark" aria-hidden="true" />HuntExams</Link>
          <nav>
            {items.map(([to, icon, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "on" : "")}><Icon name={icon} />{label}</NavLink>
            ))}
            {user?.role === "admin" && <NavLink to="/admin" className={({ isActive }) => `hide-m ${isActive ? "on" : ""}`}><Icon name="settings" />Admin</NavLink>}
          </nav>
          <div className="me">
            <span className="avatar">{user?.name.slice(0, 1)}</span>
            <div><b>{user?.name}</b><span className="tiny faint">{user?.plan === "pro" ? "Pro" : "Free plan"}</span></div>
            <button className="btn btn-text btn-sm" type="button" onClick={() => void logout()} aria-label="Log out" title="Log out">↪</button>
          </div>
        </aside>
        <div className="app-main">
          <div className="mtop">
            <Link to="/dashboard" className="brand"><span className="mark" aria-hidden="true" />HuntExams</Link>
            <span className="grow" />
            <ThemeToggle />
            {user?.role === "admin" && <Link className="btn btn-text btn-sm" to="/admin">Admin</Link>}
          </div>
          <main id="main"><Outlet /></main>
        </div>
      </div>
    </RequireAuth>
  );
}

export function FocusBar({ back, crumb, right }: { back: { to: string; label: string }; crumb: string; right?: ReactNode }) {
  return (
    <div className="focusbar"><div className="bar-in">
      <Link className="btn btn-text btn-sm" to={back.to}>← {back.label}</Link>
      <span className="crumb">{crumb}</span>
      <span className="grow" />
      {right}
    </div></div>
  );
}

/* --------------------------------------------------------------- ads */

type AdConfig = { adsense_publisher_id: string | null; placements: Record<string, { enabled: boolean; unit: string | null }> };
let adConfig: Promise<AdConfig> | null = null;

/**
 * Google AdSense placement. Renders nothing unless the site has a publisher ID, the admin has
 * enabled this placement, and the visitor isn't on Pro. Never used inside learning screens.
 */
export function AdSlot({ placement }: { placement: "homepage_banner" | "roadmap_inline" | "article_inline" | "dashboard_banner" }) {
  const { user } = useSession();
  const [cfg, setCfg] = useState<AdConfig | null>(null);
  useEffect(() => {
    adConfig ??= api<AdConfig>("/public/config").catch(() => ({ adsense_publisher_id: null, placements: {} }));
    void adConfig.then(setCfg);
  }, []);
  const p = cfg?.placements[placement];
  const show = Boolean(cfg?.adsense_publisher_id && p?.enabled && p.unit && user?.plan !== "pro");
  useEffect(() => {
    if (!show || !cfg?.adsense_publisher_id) return;
    const id = "adsbygoogle-js";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.adsense_publisher_id)}`;
      document.head.appendChild(s);
    }
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}); } catch { /* blocked */ }
  }, [show, cfg]);
  if (!show) return null;
  return (
    <div className="adslot" aria-label="Advertisement">
      <ins className="adsbygoogle" style={{ display: "block", width: "100%" }} data-ad-client={cfg!.adsense_publisher_id!}
        data-ad-slot={p!.unit!} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
