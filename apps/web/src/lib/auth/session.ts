import type { UserRead } from "@copilot/api-types";

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: UserRead };

type Listener = () => void;

/**
 * In-memory session. The access token never touches localStorage; on reload the
 * session is restored from the HttpOnly refresh cookie.
 */
export class SessionStore {
  private state: SessionState = { status: "loading", user: null };
  private accessToken: string | null = null;
  private listeners = new Set<Listener>();

  getSnapshot = (): SessionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAuthenticated(accessToken: string, user: UserRead): void {
    this.accessToken = accessToken;
    this.update({ status: "authenticated", user });
  }

  clear(): void {
    this.accessToken = null;
    this.update({ status: "anonymous", user: null });
  }

  private update(next: SessionState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
