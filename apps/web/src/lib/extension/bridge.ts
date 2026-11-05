/**
 * Talks to the Copilot browser extension through Chrome's externally_connectable
 * messaging. Only this web app's origin is allowed by the extension's manifest.
 */
export const EXTENSION_ID: string = import.meta.env.VITE_EXTENSION_ID ?? "ghnfgeieaebkhfpmgkbmikimkhidhmce";

type Reply<T> = { ok: true; data?: T } | { ok: false; error: string };

interface ChromeRuntime {
  sendMessage(id: string, message: unknown, callback: (reply: unknown) => void): void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | null {
  const chromeGlobal = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  // chrome.runtime.sendMessage is only exposed to pages an installed extension allows.
  return chromeGlobal?.runtime?.sendMessage ? chromeGlobal.runtime : null;
}

function send<T>(message: unknown, timeoutMs = 4000): Promise<Reply<T> | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, message, (reply) => {
        clearTimeout(timer);
        resolve(rt.lastError ? null : ((reply as Reply<T>) ?? null));
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export interface ExtensionStatus {
  installed: boolean;
  signedIn: boolean;
  version?: string;
}

export interface ExtensionBridge {
  status(): Promise<ExtensionStatus>;
  connect(refreshToken: string): Promise<{ ok: boolean; error?: string }>;
}

export const chromeBridge: ExtensionBridge = {
  async status() {
    const reply = await send<{ version: string; signedIn: boolean }>({ type: "PING" });
    if (!reply || !reply.ok || !reply.data) return { installed: false, signedIn: false };
    return { installed: true, signedIn: reply.data.signedIn, version: reply.data.version };
  },
  async connect(refreshToken) {
    const reply = await send({ type: "AUTH_HANDOFF", refreshToken }, 15000);
    if (!reply) return { ok: false, error: "The extension didn't respond. Make sure it's installed and enabled." };
    return reply.ok ? { ok: true } : { ok: false, error: reply.error };
  },
};
