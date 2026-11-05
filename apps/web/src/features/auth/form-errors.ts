import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError } from "@/lib/api/errors";

/**
 * Maps an API failure onto the form: field validation errors go to their inputs,
 * everything else becomes a form-level message. Returns the form-level message.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  let unmatched = false;
  for (const { field, message } of error.fieldErrors) {
    if ((fields as readonly string[]).includes(field)) setError(field as Path<T>, { message });
    else unmatched = true;
  }
  return error.fieldErrors.length > 0 && !unmatched ? null : error.message;
}
