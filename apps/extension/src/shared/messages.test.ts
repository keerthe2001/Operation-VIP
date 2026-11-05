import { describe, expect, it } from "vitest";

import { contentMessageSchema, externalMessageSchema, panelMessageSchema } from "@/shared/messages";

describe("message validation", () => {
  it("accepts well-formed messages", () => {
    expect(panelMessageSchema.safeParse({ type: "SIGN_OUT" }).success).toBe(true);
    expect(externalMessageSchema.safeParse({ type: "AUTH_HANDOFF", refreshToken: "x".repeat(43) }).success).toBe(true);
  });

  it("rejects unknown types, bad payloads and oversized values", () => {
    expect(panelMessageSchema.safeParse({ type: "DELETE_EVERYTHING" }).success).toBe(false);
    expect(panelMessageSchema.safeParse({ type: "SIGN_IN", email: "not-an-email", password: "x" }).success).toBe(false);
    expect(externalMessageSchema.safeParse({ type: "AUTH_HANDOFF", refreshToken: "short" }).success).toBe(false);
    expect(externalMessageSchema.safeParse({ type: "SIGN_OUT" }).success).toBe(false);
    const job = {
      portal: "evil", company: null, title: null, url: "https://x.com", isApplicationPage: true,
      confidence: 2, signals: [], fieldCount: 1,
    };
    expect(contentMessageSchema.safeParse({ type: "PAGE_ANALYZED", url: "https://x.com", job }).success).toBe(false);
  });
});
