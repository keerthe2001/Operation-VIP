import { useEffect, useState } from "react";

import type { PanelMessage, Reply } from "@/shared/messages";
import { DEFAULT_LOCAL, tabKey, type LocalStore } from "@/shared/storage";
import type { TabState } from "@/shared/types";

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

export function useTabState(tabId: number | null): TabState | null {
  const [state, setState] = useState<TabState | null>(null);
  useEffect(() => {
    if (tabId === null) return;
    const key = tabKey(tabId);
    let active = true;
    void chrome.storage.session.get(key).then((r) => active && setState((r[key] as TabState) ?? null));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && key in changes) setState((changes[key]!.newValue as TabState) ?? null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [tabId]);
  return state;
}

export async function send<T = unknown>(message: PanelMessage): Promise<Reply<T>> {
  try {
    return ((await chrome.runtime.sendMessage(message)) as Reply<T>) ?? { ok: false, error: "No response" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Extension error" };
  }
}
