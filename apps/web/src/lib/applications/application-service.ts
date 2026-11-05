import type { components } from "@copilot/api-types";

import { call } from "@/lib/api/call";
import type { ApiClient } from "@/lib/api/client";

export type Application = components["schemas"]["ApplicationRead"];
export type ApplicationDetail = components["schemas"]["ApplicationDetail"];
export type ApplicationStats = components["schemas"]["ApplicationStats"];
export type ApplicationStatus = Application["status"];
export type ApplicationCreate = components["schemas"]["ApplicationCreate"];
export type ApplicationUpdate = components["schemas"]["ApplicationUpdate"];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  detected: "Detected",
  in_progress: "In progress",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};
export const STATUSES = Object.keys(STATUS_LABELS) as ApplicationStatus[];

export class ApplicationService {
  constructor(private readonly api: ApiClient) {}

  list(filters: { status?: ApplicationStatus; q?: string } = {}): Promise<Application[]> {
    return call(() => this.api.GET("/api/v1/applications", { params: { query: { status: filters.status, q: filters.q || undefined } } }));
  }

  get(id: string): Promise<ApplicationDetail> {
    return call(() => this.api.GET("/api/v1/applications/{application_id}", { params: { path: { application_id: id } } }));
  }

  stats(): Promise<ApplicationStats> {
    return call(() => this.api.GET("/api/v1/applications/stats"));
  }

  create(input: ApplicationCreate): Promise<Application> {
    return call(() => this.api.POST("/api/v1/applications", { body: input }));
  }

  update(id: string, input: ApplicationUpdate): Promise<Application> {
    return call(() =>
      this.api.PATCH("/api/v1/applications/{application_id}", { params: { path: { application_id: id } }, body: input }),
    );
  }

  async remove(id: string): Promise<void> {
    await call(() => this.api.DELETE("/api/v1/applications/{application_id}", { params: { path: { application_id: id } } }));
  }
}
