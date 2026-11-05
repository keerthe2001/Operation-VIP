import { describe, expect, it } from "vitest";

import { classify, mapField } from "@/mapping/engine";
import { parseRange } from "@/mapping/options";
import type { FieldDescriptor } from "@/shared/fields";
import { makeProfile } from "@/test/profile-fixture";

function field(label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id: "f1", kind: "text", label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "",
    required: false, options: [], currentValue: "", accept: "", maxLength: null, ...extra,
  };
}
const opts = (...labels: string[]) => labels.map((label, i) => ({ value: `v${i}`, label }));

describe("classify", () => {
  it.each([
    // [label, extra, expected key] — labels taken from real portal forms
    ["First Name", {}, "first_name"],
    ["Given Name(s)", {}, "first_name"],
    ["Legal First Name *", {}, "first_name"],
    ["Last Name", {}, "last_name"],
    ["Family Name", {}, "last_name"],
    ["Surname", {}, "last_name"],
    ["Full name", {}, "full_name"],
    ["Name", {}, "full_name"],
    ["", { name: "_systemfield_name" }, "full_name"],
    ["Email", { kind: "email" }, "email"],
    ["Email Address", {}, "email"],
    ["", { name: "job_application[email]" }, "email"],
    ["Phone", { kind: "tel" }, "phone"],
    ["Mobile phone number", {}, "phone"],
    ["Current location", {}, "location"],
    ["City", {}, "location"],
    ["LinkedIn Profile", {}, "linkedin"],
    ["LinkedIn URL", { kind: "url" }, "linkedin"],
    ["GitHub URL", {}, "github"],
    ["Website", {}, "portfolio"],
    ["Portfolio", {}, "portfolio"],
    ["Current Company", {}, "current_company"],
    ["Current Title", {}, "current_title"],
    ["Years of experience", { kind: "number" }, "years_experience"],
    ["Total experience (in years)", {}, "years_experience"],
    ["School", {}, "school"],
    ["University", {}, "school"],
    ["Degree", { kind: "select" }, "degree"],
    ["Discipline", {}, "discipline"],
    ["Field of study", {}, "discipline"],
    ["Graduation year", {}, "graduation_year"],
    ["Resume/CV", { kind: "file" }, "resume"],
    ["Are you legally authorized to work in the United States?", { kind: "radio" }, "work_authorization"],
    ["Will you now or in the future require sponsorship for employment visa status?", { kind: "select" }, "requires_sponsorship"],
    ["Notice period", {}, "notice_period"],
    ["What are your salary expectations?", {}, "expected_salary"],
    ["Expected CTC", {}, "expected_salary"],
    ["Are you willing to relocate?", { kind: "radio" }, "willing_to_relocate"],
    ["", { autocomplete: "given-name" }, "first_name"],
    ["", { autocomplete: "email" }, "email"],
  ] as [string, Partial<FieldDescriptor>, string][])("%s → %s", (label, extra, key) => {
    expect(classify(field(label, extra)).key).toBe(key);
  });

  it.each([
    ["Emergency contact name"],
    ["Reference's email"],
    ["Company name of your reference"],
    ["Password"],
  ])("does not map %s to a profile field", (label) => {
    const result = classify(field(label));
    expect(result.confidence < 0.6 || result.key === null).toBe(true);
  });

  it("treats free-text questions as questions", () => {
    expect(classify(field("Why do you want to work at Acme?", { kind: "textarea" })).question).toBe(true);
    expect(classify(field("Tell us about a project you are proud of", { kind: "textarea" })).question).toBe(true);
    expect(classify(field("Cover letter", { kind: "textarea" })).question).toBe(false);
  });

  it("never maps voluntary EEO questions or consent boxes", () => {
    expect(classify(field("Are you a protected veteran?", { kind: "select" })).key).toBeNull();
    expect(classify(field("Race/Ethnicity", { kind: "select" })).key).toBeNull();
    expect(classify(field("I agree to the privacy policy", { kind: "checkbox" })).key).toBeNull();
  });

  it("gives attribute-only matches less confidence than labelled ones", () => {
    const labelled = classify(field("First name", { name: "first_name" })).confidence;
    const attrOnly = classify(field("Your details", { name: "fname" })).confidence;
    expect(labelled).toBeGreaterThan(0.95);
    expect(attrOnly).toBeLessThan(0.85);
  });
});

describe("mapField", () => {
  const profile = makeProfile();

  it("fills high-confidence fields automatically", () => {
    expect(mapField(field("Email", { kind: "email" }), 0, profile, null)).toMatchObject({ status: "auto", value: "priya.raman@example.com" });
    expect(mapField(field("Last Name"), 0, profile, null)).toMatchObject({ status: "auto", value: "Raman" });
  });

  it("chooses select/radio options", () => {
    const sponsorship = mapField(
      field("Will you require visa sponsorship?", { kind: "radio", options: opts("Yes", "No") }), 0, profile, null,
    );
    expect(sponsorship).toMatchObject({ value: "No", optionValue: "v1", status: "review" });

    const years = mapField(
      field("Years of experience", { kind: "select", options: opts("Select...", "0-1 years", "1-3 years", "3-5 years", "5-8 years", "8+ years") }),
      0, profile, null,
    );
    expect(years).toMatchObject({ value: "5-8 years", status: "auto" });

    const relocate = mapField(field("Are you willing to relocate?", { kind: "select", options: opts("Yes", "No") }), 0, profile, null);
    expect(relocate.value).toBe("Yes");

    const degree = mapField(field("Degree", { kind: "select", options: opts("High School", "B.Tech", "M.Tech") }), 0, profile, null);
    expect(degree.value).toBe("B.Tech");
  });

  it("answers work authorization only when sponsorship is known", () => {
    const question = field("Are you legally authorized to work in this country?", { kind: "radio", options: opts("Yes", "No") });
    expect(mapField(question, 0, profile, null)).toMatchObject({ value: "Yes", status: "review" });
    const unknown = makeProfile({ additional_info: { ...profile.additional_info, requires_sponsorship: null } });
    expect(mapField(question, 0, unknown, null).status).toBe("missing");
  });

  it("marks recognized fields without profile data as missing", () => {
    const empty = makeProfile({ personal_information: {} });
    expect(mapField(field("Phone"), 0, empty, null)).toMatchObject({ key: "phone", status: "missing", value: null });
  });

  it("joins lists and respects maxLength", () => {
    expect(mapField(field("Skills"), 0, profile, null).value).toBe("Python, Go, Django, PostgreSQL, AWS, Git");
    expect(mapField(field("Full name", { maxLength: 5 }), 0, profile, null).value).toBe("Priya");
  });

  it("maps the resume upload to the primary resume", () => {
    expect(mapField(field("Resume/CV", { kind: "file" }), 0, profile, "priya.pdf")).toMatchObject({ status: "auto", value: "priya.pdf" });
    expect(mapField(field("Resume/CV", { kind: "file" }), 0, profile, null).status).toBe("missing");
  });
});

describe("parseRange", () => {
  it.each([
    ["0-1 years", 0, 1], ["3 to 5 years", 3, 5], ["10+ years", 10, Infinity], ["Less than 1 year", 0, 1],
    ["More than 8 years", 8, Infinity], ["5", 5, 5],
  ] as const)("%s", (label, min, max) => {
    expect(parseRange(label)).toEqual({ min, max });
  });
});
