import { describe, expect, it } from "vitest";

import { toApiError } from "@/lib/api/errors";

describe("toApiError", () => {
  it("parses the API error shape and exposes field errors", () => {
    const error = toApiError(
      { error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", details: [{ field: "email", message: "bad" }] } },
      new Response(null, { status: 422 }),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.fieldErrors).toEqual([{ field: "email", message: "bad" }]);
  });

  it("falls back for unexpected bodies", () => {
    const error = toApiError("<html>", new Response(null, { status: 502 }));
    expect(error.code).toBe("UNEXPECTED_RESPONSE");
    expect(error.fieldErrors).toEqual([]);
  });
});
