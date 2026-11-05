import type { components } from "@copilot/api-types";

import type { KeyValueArea, LocalStore, SessionStore } from "@/shared/storage";
import type { AuthState } from "@/shared/types";

type TokenResponse = components["schemas"]["TokenResponse"];

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const EXPIRY_MARGIN_MS = 60_000;

async function readError(response: Response): Promise<AuthError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return new AuthError(body.error?.message ?? "Request failed", body.error?.code ?? `HTTP_${response.status}`);
  } catch {
    return new AuthError("Request failed", `HTTP_${response.status}`);
  }
}

/**
 * Owns the extension's session. The refresh token lives in storage.local (survives
 * restarts); the short-lived access token lives in storage.session (memory only).
 * Concurrent refreshes share one request, since refresh tokens rotate.
 */
export class AuthManager {
  private refreshing: Promise<string | null> | null = null;

  constructor(
    private readonly apiUrl: string,
    private readonly local: KeyValueArea<LocalStore>,
    private readonly session: KeyValueArea<SessionStore>,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  async state(): Promise<AuthState> {
    return (await this.local.get("auth")) ?? { status: "signed_out", user: null };
  }

  async signIn(email: string, password: string): Promise<AuthState> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, client: "extension" }),
      });
    } catch {
      throw new AuthError("Can't reach the server. Check your connection.", "NETWORK_ERROR");
    }
    if (!response.ok) throw await readError(response);
    return this.store((await response.json()) as TokenResponse);
  }

  /** Accepts a refresh token handed over by the signed-in web app. */
  async acceptHandoff(refreshToken: string): Promise<AuthState> {
    await this.local.set({ refreshToken });
    const token = await this.refresh();
    if (!token) throw new AuthError("The connection link expired. Try connecting again.", "INVALID_TOKEN");
    return this.state();
  }

  async getAccessToken(): Promise<string | null> {
    const [token, expiresAt] = await Promise.all([this.session.get("accessToken"), this.session.get("accessExpiresAt")]);
    if (token && expiresAt && expiresAt - EXPIRY_MARGIN_MS > Date.now()) return token;
    return this.refresh();
  }

  /** Forces a refresh (e.g. after a 401). Returns the new access token or null. */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = await this.local.get("refreshToken");
    if (!refreshToken) return null;
    let response: Response;
    try {
      response = await this.fetchFn(`${this.apiUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      return null; // offline: keep the session, try again later
    }
    if (response.status === 401) {
      await this.clear("expired");
      return null;
    }
    if (!response.ok) return null;
    const state = await this.store((await response.json()) as TokenResponse);
    return state.status === "signed_in" ? ((await this.session.get("accessToken")) ?? null) : null;
  }

  async signOut(): Promise<void> {
    const refreshToken = await this.local.get("refreshToken");
    if (refreshToken) {
      try {
        await this.fetchFn(`${this.apiUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Signing out locally must work offline too.
      }
    }
    await this.clear("signed_out");
  }

  private async store(body: TokenResponse): Promise<AuthState> {
    const auth: AuthState = { status: "signed_in", user: body.user };
    await this.session.set({ accessToken: body.access_token, accessExpiresAt: Date.parse(body.expires_at) });
    await this.local.set({ auth, ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}) });
    return auth;
  }

  private async clear(status: "signed_out" | "expired"): Promise<void> {
    await this.session.remove(["accessToken", "accessExpiresAt"]);
    await this.local.remove(["refreshToken", "profile", "profileEtag"]);
    await this.local.set({ auth: { status, user: null } });
  }
}
