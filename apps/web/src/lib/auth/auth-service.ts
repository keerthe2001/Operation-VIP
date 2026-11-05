import type { LoginRequest, RegisterRequest, UserRead } from "@copilot/api-types";

import type { ApiClient } from "@/lib/api/client";
import { call } from "@/lib/api/call";
import type { SessionStore } from "@/lib/auth/session";

type Credentials = Pick<LoginRequest, "email" | "password">;
type Registration = Pick<RegisterRequest, "email" | "password" | "full_name">;

/** Authentication use-cases. UI components call these; they never call the API directly. */
export class AuthService {
  constructor(
    private readonly api: ApiClient,
    private readonly session: SessionStore,
    private readonly refreshSession: (origin: string) => Promise<boolean>,
    private readonly origin: string,
  ) {}

  async login(credentials: Credentials): Promise<UserRead> {
    const data = await call(() =>
      this.api.POST("/api/v1/auth/login", { body: { ...credentials, client: "web" } }),
    );
    this.session.setAuthenticated(data.access_token, data.user);
    return data.user;
  }

  async register(registration: Registration): Promise<UserRead> {
    const data = await call(() =>
      this.api.POST("/api/v1/auth/register", { body: { ...registration, client: "web" } }),
    );
    this.session.setAuthenticated(data.access_token, data.user);
    return data.user;
  }

  /** Restores the session from the refresh cookie on page load. */
  async restore(): Promise<void> {
    const restored = await this.refreshSession(this.origin);
    if (!restored) this.session.clear();
  }

  async logout(): Promise<void> {
    try {
      await this.api.POST("/api/v1/auth/logout", {});
    } finally {
      // Always drop local state, even if the network call failed.
      this.session.clear();
    }
  }
}
