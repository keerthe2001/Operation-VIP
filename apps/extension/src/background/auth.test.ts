import { describe, expect, it, vi } from "vitest";

import { createApi } from "@/background/api";
import { AuthManager } from "@/background/auth";
import { ProfileSync } from "@/background/profile-sync";
import { memoryArea, type LocalStore, type SessionStore } from "@/shared/storage";

const API = "http://api.test";
const user = { id: "u1", email: "jane@example.com", full_name: "Jane Doe", created_at: "2026-01-01T00:00:00Z" };

function token(access: string, refresh: string, inMs = 15 * 60_000) {
  return { access_token: access, refresh_token: refresh, token_type: "bearer", expires_at: new Date(Date.now() + inMs).toISOString(), user };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function setup(routes: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const local = memoryArea<LocalStore>();
  const session = memoryArea<SessionStore>();
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => routes(String(url), init));
  const auth = new AuthManager(API, local, session, fetchFn as unknown as typeof fetch);
  return { local, session, fetchFn, auth };
}

describe("AuthManager", () => {
  it("signs in as an extension client and stores tokens in the right areas", async () => {
    const { auth, local, session, fetchFn } = setup(() => json(200, token("a1", "r1")));
    const state = await auth.signIn("jane@example.com", "pw");
    expect(state).toEqual({ status: "signed_in", user });
    expect(JSON.parse(fetchFn.mock.calls[0]![1]!.body as string)).toMatchObject({ client: "extension" });
    expect(local.data.refreshToken).toBe("r1");
    expect(session.data.accessToken).toBe("a1");
    expect(local.data).not.toHaveProperty("accessToken");
  });

  it("surfaces server errors", async () => {
    const { auth } = setup(() => json(401, { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } }));
    await expect(auth.signIn("a@b.co", "x")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("refreshes expired access tokens once for concurrent callers", async () => {
    let refreshes = 0;
    const { auth, local } = setup(async (url) => {
      if (url.endsWith("/login")) return json(200, token("a1", "r1", 1000)); // expires inside the margin
      refreshes += 1;
      await new Promise((r) => setTimeout(r, 5));
      return json(200, token("a2", "r2"));
    });
    await auth.signIn("jane@example.com", "pw");
    const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(tokens).toEqual(["a2", "a2", "a2"]);
    expect(refreshes).toBe(1);
    expect(local.data.refreshToken).toBe("r2"); // rotated
  });

  it("marks the session expired when the refresh token is rejected", async () => {
    const { auth, local } = setup((url) => (url.endsWith("/login") ? json(200, token("a1", "r1", 0)) : json(401, {})));
    await auth.signIn("jane@example.com", "pw");
    expect(await auth.getAccessToken()).toBeNull();
    expect(local.data.auth).toEqual({ status: "expired", user: null });
    expect(local.data.refreshToken).toBeUndefined();
  });

  it("keeps the session when offline", async () => {
    let online = true;
    const { auth, local } = setup((_url) => {
      if (!online) throw new TypeError("Failed to fetch");
      return json(200, token("a1", "r1", 0));
    });
    await auth.signIn("jane@example.com", "pw");
    online = false;
    expect(await auth.getAccessToken()).toBeNull();
    expect(local.data.auth?.status).toBe("signed_in");
    expect(local.data.refreshToken).toBe("r1");
  });

  it("accepts a handoff token from the web app", async () => {
    const { auth, local } = setup(() => json(200, token("a1", "r-rotated")));
    const state = await auth.acceptHandoff("r-from-web-app-xxxxxxxxxxxx");
    expect(state.status).toBe("signed_in");
    expect(local.data.refreshToken).toBe("r-rotated");
  });

  it("signs out locally even when the server is unreachable", async () => {
    let online = true;
    const { auth, local, session } = setup(() => {
      if (!online) throw new TypeError("offline");
      return json(200, token("a1", "r1"));
    });
    await auth.signIn("jane@example.com", "pw");
    online = false;
    await auth.signOut();
    expect(local.data.auth).toEqual({ status: "signed_out", user: null });
    expect(session.data.accessToken).toBeUndefined();
  });
});

describe("ProfileSync", () => {
  it("stores the profile and uses ETags for later syncs", async () => {
    const etags: (string | null)[] = [];
    const { auth, local, fetchFn } = setup((url, init) => {
      if (url.endsWith("/login")) return json(200, token("a1", "r1"));
      const sent = new Headers(init?.headers).get("If-None-Match");
      etags.push(sent);
      return sent === 'W/"v1"' ? new Response(null, { status: 304 }) : json(200, { profile: { id: "p" } }, { ETag: 'W/"v1"' });
    });
    await auth.signIn("jane@example.com", "pw");
    const sync = new ProfileSync(createApi(API, auth, fetchFn as unknown as typeof fetch), local);
    expect((await sync.sync()).state).toBe("ok");
    expect(local.data.profile).toEqual({ profile: { id: "p" } });
    expect((await sync.sync()).state).toBe("ok");
    expect(etags).toEqual([null, 'W/"v1"']);
  });

  it("reports offline without losing the cached profile", async () => {
    let online = true;
    const { auth, local, fetchFn } = setup((url) => {
      if (url.endsWith("/login")) return json(200, token("a1", "r1"));
      if (!online) throw new TypeError("offline");
      return json(200, { profile: { id: "p" } }, { ETag: "e" });
    });
    await auth.signIn("jane@example.com", "pw");
    const sync = new ProfileSync(createApi(API, auth, fetchFn as unknown as typeof fetch), local);
    await sync.sync();
    online = false;
    const state = await sync.sync(true);
    expect(state.state).toBe("offline");
    expect(local.data.profile).toEqual({ profile: { id: "p" } });
  });
});
