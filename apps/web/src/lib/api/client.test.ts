import { describe, expect, it, vi } from "vitest";

import { createAuthFetch } from "@/lib/api/client";
import { SessionStore } from "@/lib/auth/session";

const ORIGIN = "http://app.test";
const user = { id: "u1", email: "jane@example.com", full_name: "Jane", created_at: "2026-01-01T00:00:00Z" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function authenticated(token = "old-token") {
  const session = new SessionStore();
  session.setAuthenticated(token, user);
  return session;
}

describe("createAuthFetch", () => {
  it("attaches the bearer token", async () => {
    const base = vi.fn(async (_: Request) => json(200, {}));
    const { authFetch } = createAuthFetch(authenticated("abc"), base);
    await authFetch(new Request(`${ORIGIN}/api/v1/auth/me`));
    expect(base.mock.calls[0]![0].headers.get("Authorization")).toBe("Bearer abc");
  });

  it("refreshes once and retries the original request after a 401", async () => {
    const session = authenticated();
    const base = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/v1/auth/refresh") return json(200, { access_token: "new-token", user });
      return request.headers.get("Authorization") === "Bearer new-token" ? json(200, { ok: true }) : json(401, {});
    });
    const { authFetch } = createAuthFetch(session, base);

    const response = await authFetch(new Request(`${ORIGIN}/api/v1/things`, { method: "POST", body: "payload" }));

    expect(response.status).toBe(200);
    expect(session.getAccessToken()).toBe("new-token");
    const retried = base.mock.calls[2]![0];
    expect(await retried.text()).toBe("payload");
  });

  it("shares one refresh between concurrent 401s", async () => {
    let refreshCalls = 0;
    const base = vi.fn(async (request: Request) => {
      if (new URL(request.url).pathname === "/api/v1/auth/refresh") {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return json(200, { access_token: "new-token", user });
      }
      return request.headers.get("Authorization") === "Bearer new-token" ? json(200, {}) : json(401, {});
    });
    const { authFetch } = createAuthFetch(authenticated(), base);

    const results = await Promise.all([
      authFetch(new Request(`${ORIGIN}/api/v1/a`)),
      authFetch(new Request(`${ORIGIN}/api/v1/b`)),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it("clears the session when refresh is rejected", async () => {
    const session = authenticated();
    const base = vi.fn(async () => json(401, { error: { code: "INVALID_TOKEN", message: "x" } }));
    const { authFetch } = createAuthFetch(session, base);

    const response = await authFetch(new Request(`${ORIGIN}/api/v1/things`));

    expect(response.status).toBe(401);
    expect(session.getSnapshot().status).toBe("anonymous");
  });

  it("does not try to refresh for auth endpoints", async () => {
    const base = vi.fn(async () => json(401, {}));
    const { authFetch } = createAuthFetch(authenticated(), base);
    await authFetch(new Request(`${ORIGIN}/api/v1/auth/login`, { method: "POST" }));
    expect(base).toHaveBeenCalledTimes(1);
  });
});
