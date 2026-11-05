import { describe, expect, it } from "vitest";

import type { ProfileWrite } from "@/lib/profile/profile-service";
import { applyEdits, cleanForSave, confirmAll, countUnconfirmed, emptyItem, needsReview } from "@/lib/profile/form";

function sample(): ProfileWrite {
  return {
    personal_information: { full_name: "Jane", email: "jane@example.com" },
    professional_summary: { summary: "Hi" },
    experience: [
      { ...emptyItem("experience"), company_name: "A", is_confirmed: false, confidence: 0.7 },
      { ...emptyItem("experience"), company_name: "B", is_confirmed: false, confidence: 0.7 },
    ],
    education: [],
    projects: [],
    certifications: [],
    skills: { programming_languages: [], frameworks: [], databases: [], cloud: [], ai_ml: [], tools: ["Git"], soft_skills: [], other: [] },
    additional_info: { languages: [], preferred_locations: [] },
    field_meta: {
      "personal_information.full_name": { confidence: 0.9, is_confirmed: false },
      "personal_information.email": { confidence: 0.97, is_confirmed: false },
    },
  };
}

describe("profile form logic", () => {
  it("flags unconfirmed extracted fields only", () => {
    const values = sample();
    expect(needsReview(values.field_meta, "personal_information.email")).toBe(true);
    expect(needsReview(values.field_meta, "personal_information.phone")).toBe(false);
    expect(countUnconfirmed(values)).toBe(4);
  });

  it("marks edited fields and items as confirmed", () => {
    const result = applyEdits(sample(), {
      personal_information: { email: true },
      experience: [undefined as never, { company_name: true }],
      skills: { tools: [true] },
    });
    expect(result.field_meta!["personal_information.email"]!.is_confirmed).toBe(true);
    expect(result.field_meta!["personal_information.full_name"]!.is_confirmed).toBe(false);
    expect(result.field_meta!["skills"]!.is_confirmed).toBe(true);
    expect(result.experience!.map((e) => e.is_confirmed)).toEqual([false, true]);
  });

  it("confirms everything", () => {
    expect(countUnconfirmed(confirmAll(sample()))).toBe(0);
  });

  it("cleans blanks and NaN before saving", () => {
    const values = sample();
    values.personal_information!.phone = "  ";
    values.experience![0]!.responsibilities = ["Did a thing", "", "  "];
    values.education = [{ ...emptyItem("education"), graduation_year: Number.NaN }];
    const cleaned = cleanForSave(values);
    expect(cleaned.personal_information!.phone).toBeNull();
    expect(cleaned.experience![0]!.responsibilities).toEqual(["Did a thing"]);
    expect(cleaned.education![0]!.graduation_year).toBeNull();
  });
});
