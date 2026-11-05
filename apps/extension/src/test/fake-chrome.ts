import { vi } from "vitest";

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

/** Just enough of the chrome.* API for side panel component tests. */
export function installFakeChrome(initial: { local?: Record<string, unknown>; session?: Record<string, unknown> } = {}) {
  const listeners = new Set<Listener>();
  const areas: Record<"local" | "session", Record<string, unknown>> = {
    local: { ...initial.local },
    session: { ...initial.session },
  };
  const area = (name: "local" | "session") => ({
    get: vi.fn(async (key: string) => (key in areas[name] ? { [key]: areas[name][key] } : {})),
    set: vi.fn(async (values: Record<string, unknown>) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [k, v] of Object.entries(values)) {
        changes[k] = { oldValue: areas[name][k], newValue: v };
        areas[name][k] = v;
      }
      listeners.forEach((l) => l(changes, name));
    }),
  });
  const sendMessage = vi.fn(async (_message: unknown): Promise<{ ok: boolean; error?: string }> => ({ ok: true }));
  const chromeFake = {
    storage: {
      local: area("local"),
      session: area("session"),
      onChanged: { addListener: (l: Listener) => listeners.add(l), removeListener: (l: Listener) => listeners.delete(l) },
    },
    runtime: { sendMessage, id: "test" },
    tabs: {
      query: vi.fn(async () => [{ id: 7 }]),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    permissions: { request: vi.fn(async () => true) },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeFake;
  return { chrome: chromeFake, sendMessage, set: (name: "local" | "session", values: Record<string, unknown>) => chromeFake.storage[name].set(values) };
}
