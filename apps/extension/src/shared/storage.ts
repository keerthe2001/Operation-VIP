import type { FormState } from "@/shared/fields";
import type { AuthState, ExtensionProfile, SyncState, TabState } from "@/shared/types";

/**
 * Typed storage layout.
 * - local: survives browser restarts (refresh token, cached profile).
 * - session: in-memory, cleared when the browser closes (access token, tab state).
 */
export interface LocalStore {
  refreshToken: string | null;
  auth: AuthState;
  profile: ExtensionProfile | null;
  profileEtag: string | null;
  sync: SyncState;
  allSitesEnabled: boolean;
}

export interface SessionStore {
  accessToken: string | null;
  accessExpiresAt: number | null;
  [tabKey: `tab:${number}`]: TabState | undefined;
  [formKey: `form:${number}`]: FormState | undefined;
}

export const tabKey = (tabId: number) => `tab:${tabId}` as const;
export const formKey = (tabId: number) => `form:${tabId}` as const;

// Computed keys widen to `string` in TypeScript; these keep session writes typed.
export const tabEntry = (tabId: number, state: TabState): Partial<SessionStore> =>
  ({ [tabKey(tabId)]: state }) as unknown as Partial<SessionStore>;
export const formEntry = (tabId: number, state: FormState): Partial<SessionStore> =>
  ({ [formKey(tabId)]: state }) as unknown as Partial<SessionStore>;

export const DEFAULT_LOCAL: LocalStore = {
  refreshToken: null,
  auth: { status: "signed_out", user: null },
  profile: null,
  profileEtag: null,
  sync: { state: "idle", lastSyncedAt: null, error: null },
  allSitesEnabled: false,
};

/** Small async key/value interface so background logic is testable without Chrome. */
export interface KeyValueArea<T> {
  get<K extends keyof T>(key: K): Promise<T[K] | undefined>;
  set(values: Partial<T>): Promise<void>;
  remove(keys: (keyof T)[]): Promise<void>;
}

export function chromeArea<T>(area: chrome.storage.StorageArea): KeyValueArea<T> {
  return {
    async get(key) {
      const result = await area.get(key as string);
      return result[key as string] as T[typeof key] | undefined;
    },
    async set(values) {
      await area.set(values as Record<string, unknown>);
    },
    async remove(keys) {
      await area.remove(keys as string[]);
    },
  };
}

export function memoryArea<T>(initial: Partial<T> = {}): KeyValueArea<T> & { data: Partial<T> } {
  const data: Partial<T> = { ...initial };
  return {
    data,
    async get(key) {
      return data[key];
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(keys) {
      for (const key of keys) delete data[key];
    },
  };
}
