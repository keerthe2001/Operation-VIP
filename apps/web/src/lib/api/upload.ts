import { ApiError, networkError, toApiError } from "@/lib/api/errors";
import type { SessionStore } from "@/lib/auth/session";

export interface UploadOptions {
  url: string;
  file: File;
  field?: string;
  session: SessionStore;
  refresh: (origin: string) => Promise<boolean>;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function send<T>(options: UploadOptions): Promise<{ status: number; body: T | unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", options.url);
    const token = options.session.getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.((event.loaded / event.total) * 100);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response });
    xhr.onerror = () => reject(networkError());
    xhr.onabort = () => reject(new ApiError(0, "ABORTED", "Upload cancelled."));
    options.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append(options.field ?? "file", options.file);
    xhr.send(form);
  });
}

/**
 * Multipart upload with progress events (fetch has no upload progress), sharing
 * the session's token and refreshing it once on 401.
 */
export async function uploadWithProgress<T>(options: UploadOptions): Promise<T> {
  let result = await send<T>(options);
  if (result.status === 401 && (await options.refresh(new URL(options.url, window.location.href).origin))) {
    options.onProgress?.(0);
    result = await send<T>(options);
  }
  if (result.status >= 200 && result.status < 300) return result.body as T;
  throw toApiError(result.body, new Response(null, { status: result.status }));
}
