import type { components } from "@copilot/api-types";

import { call } from "@/lib/api/call";
import type { ApiClient } from "@/lib/api/client";

export type SavedAnswer = components["schemas"]["SavedAnswerRead"];
export type SavedAnswerInput = components["schemas"]["SavedAnswerCreate"];
export type AnswerTemplate = components["schemas"]["AnswerTemplate"];

export class AnswerService {
  constructor(private readonly api: ApiClient) {}

  list(): Promise<SavedAnswer[]> {
    return call(() => this.api.GET("/api/v1/answers"));
  }

  templates(): Promise<AnswerTemplate[]> {
    return call(() => this.api.GET("/api/v1/answers/templates"));
  }

  placeholders(): Promise<Record<string, string>> {
    return call(() => this.api.GET("/api/v1/answers/placeholders"));
  }

  create(input: SavedAnswerInput): Promise<SavedAnswer> {
    return call(() => this.api.POST("/api/v1/answers", { body: input }));
  }

  update(id: string, input: Partial<SavedAnswerInput>): Promise<SavedAnswer> {
    return call(() => this.api.PATCH("/api/v1/answers/{answer_id}", { params: { path: { answer_id: id } }, body: input }));
  }

  async remove(id: string): Promise<void> {
    await call(() => this.api.DELETE("/api/v1/answers/{answer_id}", { params: { path: { answer_id: id } } }));
  }
}
