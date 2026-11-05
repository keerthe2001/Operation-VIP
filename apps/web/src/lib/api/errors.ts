import type { ApiErrorBody } from "@copilot/api-types";

export interface FieldError {
  field: string;
  message: string;
}

/** Normalized error thrown by every API call in the app. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level validation errors, when the API returned VALIDATION_ERROR. */
  get fieldErrors(): FieldError[] {
    if (this.code !== "VALIDATION_ERROR" || !Array.isArray(this.details)) return [];
    return this.details.filter(
      (d): d is FieldError => typeof d?.field === "string" && typeof d?.message === "string",
    );
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiErrorBody).error?.code === "string"
  );
}

export function toApiError(body: unknown, response: Response | undefined): ApiError {
  const status = response?.status ?? 0;
  if (isErrorBody(body)) {
    return new ApiError(status, body.error.code, body.error.message, body.error.details);
  }
  return new ApiError(status, "UNEXPECTED_RESPONSE", "Something went wrong. Please try again.");
}

export const networkError = () =>
  new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
