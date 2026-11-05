import { call } from "@/lib/api/call";
import type { ApiClient } from "@/lib/api/client";

export class ExtensionService {
  constructor(private readonly api: ApiClient) {}

  /** A fresh extension session token, passed straight to the extension and never stored here. */
  async handoffToken(): Promise<string> {
    const data = await call(() => this.api.POST("/api/v1/extension/handoff"));
    return data.refresh_token;
  }
}
