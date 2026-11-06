import { useEffect, useState } from "react";

import type { FormState } from "@/shared/fields";
import type { PanelMessage, Reply } from "@/shared/messages";
import { DEFAULT_SETTINGS, type AutofillSettings } from "@/shared/settings";
import { appKey, DEFAULT_LOCAL, DEFAULT_WIDGET, formKey, tabKey, type LocalStore, type WidgetPrefs } from "@/shared/storage";
import type { ActivityEntry, TabState, TrackedApplication } from "@/shared/types";

/** Live value from chrome.storage.local. */
export function useLocal<K extends keyof LocalStore>(key: K): LocalStore[K] {
  const [value, setValue] = useState<LocalStore[K]>(DEFAULT_LOCAL[key]);
  useEffect(() => {
    let active = true;
    void chrome.storage.local.get(key).then((r) => active && setValue((r[key] as LocalStore[K]) ?? DEFAULT_LOCAL[key]));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && key in changes) setValue((changes[key]!.newValue as LocalStore[K]) ?? DEFAULT_LOCAL[key]);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [key]);
  return value;
}

/** The tab the panel is attached to (overridable with ?tab=<id> for testing). */
export function useActiveTabId(): number | null {
  const [tabId, setTabId] = useState<number | null>(() => {
    const forced = new URLSearchParams(location.search).get("tab");
    return forced ? Number(forced) : null;
  });
  useEffect(() => {
    if (new URLSearchParams(location.search).get("tab")) return;
    const update = () =>
      void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setTabId(tab?.id ?? null));
    update();
    chrome.tabs.onActivated.addListener(update);
    return () => chrome.tabs.onActivated.removeListener(update);
  }, []);
  return tabId;
}

function useSessionValue<T>(key: string | null): T | null {
  const [state, setState] = useState<T | null>(null);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    void chrome.storage.session.get(key).then((r) => active && setState((r[key] as T) ?? null));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && key in changes) setState((changes[key]!.newValue as T) ?? null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [key]);
  return state;
}

export const useTabState = (tabId: number | null) => useSessionValue<TabState>(tabId === null ? null : tabKey(tabId));
export const useFormState = (tabId: number | null) => useSessionValue<FormState>(tabId === null ? null : formKey(tabId));

export const STALE_WORKER_EVENT = "copilot:stale-worker";

export async function send<T = unknown>(message: PanelMessage): Promise<Reply<T>> {
  try {
    const reply = ((await chrome.runtime.sendMessage(message)) as Reply<T>) ?? { ok: false, error: "No response" };
    // The panel only sends valid messages, so a rejection means the background is still
    // running an older build: Chrome reloads panel files from disk but keeps the old
    // service worker until the extension is reloaded.
    if (!reply.ok && reply.error === "Invalid message") {
      window.dispatchEvent(new Event(STALE_WORKER_EVENT));
      return { ok: false, error: "Copilot was updated. Restart it to finish the update.", code: "STALE_WORKER" };
    }
    return reply;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Extension error" };
  }
}
export const useTrackedApplication = (tabId: number | null) =>
  useSessionValue<TrackedApplication>(tabId === null ? null : appKey(tabId));

export const useActivity = (tabId: number | null) => useSessionValue<ActivityEntry[]>(tabId === null ? null : `activity:${tabId}`) ?? [];

/** Settings with defaults for anything not saved yet (older installs, partial writes). */
export function useSettings(): AutofillSettings {
  const stored = useLocal("settings");
  return { ...DEFAULT_SETTINGS, ...stored };
}
export function useWidgetPrefs(): WidgetPrefs {
  const stored = useLocal("widget");
  return { ...DEFAULT_WIDGET, ...stored };
}
