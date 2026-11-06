import { describe, expect, it } from "vitest";

import { scanFields } from "@/content/forms/scanner";
import { mapFields } from "@/mapping/engine";
import { makeProfile } from "@/test/profile-fixture";

import { SAMPLES } from "./samples";

const outcome = (f: { key: string | null; status: string }) => (f.status === "question" ? "question" : f.key);

describe("recognition across ATS and career-page samples", () => {
  const results: { sample: string; total: number; wrong: string[] }[] = [];

  it.each(SAMPLES.map((s) => [s.name, s] as const))("%s", (_name, sample) => {
    document.body.innerHTML = sample.html;
    const mapped = mapFields(scanFields(), 0, makeProfile(), "priya.pdf");
    expect(mapped.length, `${sample.name}: fields found`).toBe(sample.expect.length);
    const wrong = sample.expect
      .map(([label, key], i) => ({ label, key, got: outcome(mapped[i]!) }))
      .filter((r) => r.got !== r.key)
      .map((r) => `${r.label}: expected ${r.key}, got ${r.got}`);
    results.push({ sample: sample.name, total: sample.expect.length, wrong });
    expect(wrong, sample.name).toEqual([]);
  });

  it("reports overall accuracy", () => {
    const total = results.reduce((sum, r) => sum + r.total, 0);
    const wrong = results.reduce((sum, r) => sum + r.wrong.length, 0);
    console.info(`Field recognition: ${total - wrong}/${total} across ${results.length} samples`);
    expect(total).toBeGreaterThan(100);
  });
});
