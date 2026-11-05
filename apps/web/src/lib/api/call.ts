import { networkError, toApiError } from "@/lib/api/errors";

/** Unwraps an openapi-fetch result, throwing a normalized ApiError on failure. */
export async function call<T>(
  request: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<ReturnType<typeof request>>;
  try {
    result = await request();
  } catch {
    throw networkError();
  }
  if (result.error !== undefined || (result.data === undefined && result.response.status !== 204)) {
    throw toApiError(result.error, result.response);
  }
  return result.data as T;
}
