import type { Api } from "@/background/api";
import { appEntry, appKey, type KeyValueArea, type SessionStore } from "@/shared/storage";
import type { ApplicationStatus, DetectedJob, TrackedApplication } from "@/shared/types";

/**
 * Records detected application pages in the user's tracker. Detection is idempotent
 * per job URL on the server; statuses past "in progress" are only ever set by the user.
 */
export class ApplicationTracker {
  private inflight = new Map<number, Promise<TrackedApplication | null>>();

  constructor(
    private readonly api: Api,
    private readonly session: KeyValueArea<SessionStore>,
  ) {}

  async get(tabId: number): Promise<TrackedApplication | null> {
    return (await this.session.get(appKey(tabId))) ?? null;
  }

  /** Called when a tab shows an application page; at most one request per tab and URL. */
  async onDetected(tabId: number, job: DetectedJob): Promise<TrackedApplication | null> {
    if (!job.isApplicationPage) return null;
    const known = await this.get(tabId);
    if (known?.url === job.url) return known;
    const pending = this.inflight.get(tabId);
    if (pending) return pending;
    const request = this.report(tabId, job, 0).finally(() => this.inflight.delete(tabId));
    this.inflight.set(tabId, request);
    return request;
  }

  async onFilled(tabId: number, job: DetectedJob | null | undefined, filledCount: number): Promise<void> {
    if (!job?.isApplicationPage || filledCount <= 0) return;
    await this.report(tabId, job, filledCount);
  }

  private async report(tabId: number, job: DetectedJob, filled: number): Promise<TrackedApplication | null> {
    try {
      const response = await this.api("/api/v1/extension/detect-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_url: job.url,
          company_name: job.company,
          job_title: job.title,
          portal: job.portal,
          job_description: job.description ?? null,
          fields_detected: job.fieldCount,
          fields_filled: filled,
        }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { id: string; status: ApplicationStatus };
      const tracked: TrackedApplication = { id: body.id, url: job.url, status: body.status };
      await this.session.set(appEntry(tabId, tracked));
      return tracked;
    } catch {
      return null; // offline or signed out: tracking is best-effort
    }
  }

  async setStatus(tabId: number, status: ApplicationStatus): Promise<TrackedApplication> {
    const tracked = await this.get(tabId);
    if (!tracked) throw new Error("This application isn't tracked yet.");
    const response = await this.api(`/api/v1/applications/${tracked.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error("Couldn't update the application.");
    const next = { ...tracked, status };
    await this.session.set(appEntry(tabId, next));
    return next;
  }
}
