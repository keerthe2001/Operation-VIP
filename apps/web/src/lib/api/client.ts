import type { paths, TokenResponse } from "@copilot/api-types";
import createClient from "openapi-fetch";

import type { SessionStore } from "@/lib/auth/session";

const REFRESH_PATH = "/api/v1/auth/refresh";
const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register", REFRESH_PATH, "/api/v1/auth/logout"];

type Fetch = (request: Request) => Promise<Response>;

/**
 * Wraps fetch with bearer-token injection and a single transparent retry after
 * refreshing an expired access token. Concurrent 401s share one refresh call.
 */
export function createAuthFetch(session: SessionStore, baseFetch: Fetch = (r) => fetch(r)) {
  let refreshing: Promise<boolean> | null = null;

  async function refresh(origin: string): Promise<boolean> {
    try {
      const response = await baseFetch(
        new Request(new URL(REFRESH_PATH, origin), { method: "POST", credentials: "same-origin" }),
      );
      if (!response.ok) {
        session.clear();
        return false;
      }
      const body = (await response.json()) as TokenResponse;
      session.setAuthenticated(body.access_token, body.user);
      return true;
    } catch {
      // Network failure: keep the current session state; the caller sees the 401.
      return false;
    }
  }

  function refreshOnce(origin: string): Promise<boolean> {
    refreshing ??= refresh(origin).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  function withToken(request: Request): Request {
    const token = session.getAccessToken();
    if (!token) return request;
    const authorized = new Request(request);
    authorized.headers.set("Authorization", `Bearer ${token}`);
    return authorized;
  }

  const authFetch: Fetch = async (request) => {
    const url = new URL(request.url);
    const retryable = request.clone();
    const response = await baseFetch(withToken(request));
    if (response.status !== 401 || AUTH_PATHS.includes(url.pathname)) return response;
    const refreshed = await refreshOnce(url.origin);
    return refreshed ? baseFetch(withToken(retryable)) : response;
  };

  return { authFetch, refresh: refreshOnce };
}

export function createApiClient(session: SessionStore, baseUrl: string, baseFetch?: Fetch) {
  const { authFetch, refresh } = createAuthFetch(session, baseFetch);
  const client = createClient<paths>({ baseUrl, fetch: authFetch, credentials: "same-origin" });
  return { client, refresh };
}

export type ApiClient = ReturnType<typeof createApiClient>["client"];
