import { describe, expect, it, vi } from "vitest";

import { ApplicationTracker } from "@/background/tracker";
import { memoryArea, type SessionStore } from "@/shared/storage";
import type { DetectedJob } from "@/shared/types";

const job: DetectedJob = {
  portal: "greenhouse", company: "Acme", title: "Engineer", url: "https://boards.greenhouse.io/acme/jobs/1",
  isApplicationPage: true, confidence: 1, signals: [], fieldCount: 9, description: "Build things",
};

function setup() {
  const session = memoryArea<SessionStore>();
  const bodies: Record<string, unknown>[] = [];
  const api = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.body) bodies.push(JSON.parse(init.body as string));
    if (path.startsWith("/api/v1/applications/")) return new Response("{}", { status: 200 });
    return new Response(JSON.stringify({ id: "a1", status: bodies.at(-1)?.fields_filled ? "in_progress" : "detected" }), { status: 200 });
  });
  return { tracker: new ApplicationTracker(api, session), api, bodies, session };
}

describe("ApplicationTracker", () => {
  it("reports each application page once per tab and URL", async () => {
    const { tracker, api, bodies } = setup();
    await Promise.all([tracker.onDetected(1, job), tracker.onDetected(1, job)]);
    await tracker.onDetected(1, job);
    expect(api).toHaveBeenCalledTimes(1);
    expect(bodies[0]).toMatchObject({ job_url: job.url, company_name: "Acme", job_description: "Build things", fields_detected: 9, fields_filled: 0 });
    expect(await tracker.get(1)).toEqual({ id: "a1", url: job.url, status: "detected" });
  });

  it("ignores pages that are not applications and reports fills", async () => {
    const { tracker, api, bodies } = setup();
    expect(await tracker.onDetected(1, { ...job, isApplicationPage: false })).toBeNull();
    expect(api).not.toHaveBeenCalled();
    await tracker.onFilled(1, job, 6);
    expect(bodies[0]!.fields_filled).toBe(6);
    expect((await tracker.get(1))!.status).toBe("in_progress");
  });

  it("updates the status when the user marks it submitted", async () => {
    const { tracker, api } = setup();
    await tracker.onDetected(1, job);
    expect((await tracker.setStatus(1, "submitted")).status).toBe("submitted");
    expect(api).toHaveBeenLastCalledWith("/api/v1/applications/a1", expect.objectContaining({ method: "PATCH" }));
  });

  it("stays quiet when offline", async () => {
    const session = memoryArea<SessionStore>();
    const tracker = new ApplicationTracker(vi.fn(async () => { throw new Error("offline"); }), session);
    expect(await tracker.onDetected(1, job)).toBeNull();
  });
});
