import type { FormState } from "@/shared/fields";
import { DEFAULT_SETTINGS, type AutofillSettings } from "@/shared/settings";
import type { AuthState, ExtensionProfile, SyncState, TabState, TrackedApplication } from "@/shared/types";

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
  widget: WidgetPrefs;
  /** Password for new accounts on job portals. Kept on this device only, never synced. */
  accountPassword: string | null;
  theme: "system" | "light" | "dark";
  settings: AutofillSettings;
  /** Last version whose "What's new" note was dismissed. */
  seenVersion: string | null;
}

/** The floating in-page assistant. */
export interface WidgetPrefs {
  /** "job_pages": only where a job is detected; "always": on every page Copilot runs on. */
  mode: "job_pages" | "always" | "off";
  /** Expand the assistant by itself when an application form is found. */
  autoOpen: boolean;
  /** Bubble position: docked to a side, `y` in pixels from the top of the window. */
  side: "left" | "right";
  y: number;
  /** Sites where the user closed the assistant. */
  hiddenHosts: string[];
}

export const DEFAULT_WIDGET: WidgetPrefs = { mode: "job_pages", autoOpen: true, side: "right", y: 160, hiddenHosts: [] };

export interface SessionStore {
  accessToken: string | null;
  accessExpiresAt: number | null;
  [tabKey: `tab:${number}`]: TabState | undefined;
  [formKey: `form:${number}`]: FormState | undefined;
  [appKey: `app:${number}`]: TrackedApplication | undefined;
}

export const tabKey = (tabId: number) => `tab:${tabId}` as const;
export const formKey = (tabId: number) => `form:${tabId}` as const;
export const appKey = (tabId: number) => `app:${tabId}` as const;

// Computed keys widen to `string` in TypeScript; these keep session writes typed.
export const tabEntry = (tabId: number, state: TabState): Partial<SessionStore> =>
  ({ [tabKey(tabId)]: state }) as unknown as Partial<SessionStore>;
export const appEntry = (tabId: number, app: TrackedApplication): Partial<SessionStore> =>
  ({ [appKey(tabId)]: app }) as unknown as Partial<SessionStore>;
export const formEntry = (tabId: number, state: FormState): Partial<SessionStore> =>
  ({ [formKey(tabId)]: state }) as unknown as Partial<SessionStore>;

export const DEFAULT_LOCAL: LocalStore = {
  refreshToken: null,
  auth: { status: "signed_out", user: null },
  profile: null,
  profileEtag: null,
  sync: { state: "idle", lastSyncedAt: null, error: null },
  allSitesEnabled: false,
  widget: DEFAULT_WIDGET,
  accountPassword: null,
  theme: "system",
  settings: DEFAULT_SETTINGS,
  seenVersion: null,
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
