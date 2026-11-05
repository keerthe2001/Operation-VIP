import { ApiError, type Api } from "@/background/api";
import type { KeyValueArea, LocalStore } from "@/shared/storage";
import type { ExtensionProfile, SyncState } from "@/shared/types";

/** Keeps a local copy of the profile, using ETags so unchanged profiles cost one 304. */
export class ProfileSync {
  private running: Promise<SyncState> | null = null;

  constructor(
    private readonly api: Api,
    private readonly local: KeyValueArea<LocalStore>,
  ) {}

  sync(force = false): Promise<SyncState> {
    this.running ??= this.run(force).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(force: boolean): Promise<SyncState> {
    const previous = (await this.local.get("sync")) ?? { state: "idle", lastSyncedAt: null, error: null };
    await this.local.set({ sync: { ...previous, state: "syncing" } });
    const etag = force ? null : await this.local.get("profileEtag");
    let next: SyncState;
    try {
      const response = await this.api("/api/v1/extension/profile", {
        headers: etag ? { "If-None-Match": etag } : {},
      });
      if (response.status === 304) {
        next = { state: "ok", lastSyncedAt: Date.now(), error: null };
      } else if (response.ok) {
        const profile = (await response.json()) as ExtensionProfile;
        await this.local.set({ profile, profileEtag: response.headers.get("ETag") });
        next = { state: "ok", lastSyncedAt: Date.now(), error: null };
      } else {
        next = { ...previous, state: "error", error: `Server error (${response.status})` };
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
        next = { ...previous, state: "offline", error: "Offline. Showing your saved profile." };
      } else {
        next = { ...previous, state: "error", error: error instanceof Error ? error.message : "Sync failed" };
      }
    }
    await this.local.set({ sync: next });
    return next;
  }
}
