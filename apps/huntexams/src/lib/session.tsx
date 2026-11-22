import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ApiError } from "./api";
import type { User } from "./types";

type Toast = { id: number; text: string; icon?: string };
type Ctx = {
  user: User | null; loading: boolean;
  refresh: () => Promise<User | null>; setUser: (u: User | null) => void; logout: () => Promise<void>;
  toast: (text: string, icon?: string) => void;
  celebrate: (r: { xp?: number; achievements?: string[] } | undefined) => void;
  theme: "dark" | "light"; setTheme: (t: "dark" | "light") => void;
};

const SessionCtx = createContext<Ctx | null>(null);

const ACH: Record<string, string> = {
  first_scene: "First scene watched", first_check: "First check passed", first_code_run: "First code run",
  first_lab: "First guided lab", first_topic: "First topic practised", first_mission: "First mission submitted",
  rag_builder: "RAG builder", agent_developer: "Agent developer", streak_7: "7-day streak", certified: "Certified",
};

function readTheme(): "dark" | "light" {
  try { return localStorage.getItem("hx-theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<"dark" | "light">(readTheme);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api<{ user: User | null }>("/auth/session");
      setUser(u);
      return u;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.warn(e);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("hx-theme", theme); } catch { /* private mode */ }
  }, [theme]);

  const toast = useCallback((text: string, icon?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, icon }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const celebrate = useCallback((r: { xp?: number; achievements?: string[] } | undefined) => {
    if (!r) return;
    if (r.xp) toast(`+${r.xp} XP`, "✦");
    for (const a of r.achievements ?? []) toast(`Achievement unlocked: ${ACH[a] ?? a}`, "★");
  }, [toast]);

  const logout = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, setUser, logout, toast, celebrate, theme, setTheme: setThemeState }),
    [user, loading, refresh, logout, toast, celebrate, theme]);

  return (
    <SessionCtx.Provider value={value}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast">{t.icon && <span style={{ color: "var(--acc)" }}>{t.icon}</span>}{t.text}</div>)}
      </div>
    </SessionCtx.Provider>
  );
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("SessionProvider missing");
  return c;
}

/** Load data from the API with loading and error state. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setData(await api<T>(path)); } catch (e) { setError(e instanceof ApiError ? e : new ApiError(0, String(e))); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
