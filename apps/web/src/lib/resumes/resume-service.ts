import type { components } from "@copilot/api-types";

import { call } from "@/lib/api/call";
import type { ApiClient } from "@/lib/api/client";
import { uploadWithProgress } from "@/lib/api/upload";
import type { SessionStore } from "@/lib/auth/session";

export type Resume = components["schemas"]["ResumeRead"];
export type ResumeDetail = components["schemas"]["ResumeDetail"];
export type ResumeStatus = Resume["status"];

export const ACCEPTED_TYPES = ".pdf,.doc,.docx,.png,.jpg,.jpeg";
export const MAX_UPLOAD_MB = 10;

const PROCESSING: ResumeStatus[] = ["uploaded", "scanning", "extracting", "parsing"];
export const isProcessing = (status: ResumeStatus) => PROCESSING.includes(status);

/** Client-side pre-check so users get instant feedback; the server validates again. */
export function precheckFile(file: File): string | null {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["pdf", "doc", "docx", "png", "jpg", "jpeg"].includes(extension)) {
    return "Upload a PDF, DOC, DOCX, PNG or JPG file.";
  }
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `The file is larger than ${MAX_UPLOAD_MB} MB.`;
  return null;
}

export class ResumeService {
  constructor(
    private readonly api: ApiClient,
    private readonly session: SessionStore,
    private readonly refresh: (origin: string) => Promise<boolean>,
    private readonly origin: string,
  ) {}

  list(): Promise<Resume[]> {
    return call(() => this.api.GET("/api/v1/resumes"));
  }

  get(id: string): Promise<ResumeDetail> {
    return call(() => this.api.GET("/api/v1/resumes/{resume_id}", { params: { path: { resume_id: id } } }));
  }

  upload(file: File, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<Resume> {
    return uploadWithProgress<Resume>({
      url: `${this.origin}/api/v1/resumes/upload`,
      file,
      session: this.session,
      refresh: this.refresh,
      onProgress,
      signal,
    });
  }

  reprocess(id: string): Promise<Resume> {
    return call(() =>
      this.api.POST("/api/v1/resumes/{resume_id}/process", { params: { path: { resume_id: id } } }),
    );
  }

  async remove(id: string): Promise<void> {
    await call(() => this.api.DELETE("/api/v1/resumes/{resume_id}", { params: { path: { resume_id: id } } }));
  }

  /** Downloads the original file as a Blob (used for in-app preview). */
  file(id: string): Promise<Blob> {
    return call(() =>
      this.api.GET("/api/v1/resumes/{resume_id}/file", {
        params: { path: { resume_id: id } },
        parseAs: "blob",
      }),
    ) as Promise<Blob>;
  }
}
