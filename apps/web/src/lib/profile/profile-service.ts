import type { components } from "@copilot/api-types";

import { call } from "@/lib/api/call";
import type { ApiClient } from "@/lib/api/client";

export type Profile = components["schemas"]["ProfileRead"];
export type ProfileWrite = components["schemas"]["ProfileWrite"];
export type ProfileCompletion = components["schemas"]["ProfileCompletion"];

export class ProfileService {
  constructor(private readonly api: ApiClient) {}

  get(): Promise<Profile> {
    return call(() => this.api.GET("/api/v1/profile"));
  }

  save(profile: ProfileWrite): Promise<Profile> {
    return call(() => this.api.PUT("/api/v1/profile", { body: profile }));
  }

  importResume(resumeId: string): Promise<Profile> {
    return call(() =>
      this.api.POST("/api/v1/profile/import/{resume_id}", { params: { path: { resume_id: resumeId } } }),
    );
  }
}
