import { describe, expect, it } from "vitest";

import { classify, mapFields } from "@/mapping/engine";
import { splitLocation } from "@/mapping/location";
import type { FieldDescriptor } from "@/shared/fields";
import { makeProfile } from "@/test/profile-fixture";

function field(label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id: label, kind: "text", label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "",
    required: false, options: [], currentValue: "", accept: "", maxLength: null, ...extra,
  };
}

describe("field vocabulary", () => {
  // Labels from real forms (Indian career pages, global ATSs). Each must be recognised.
  it.each([
    ["First Name *", "first_name"], ["Last Name *", "last_name"], ["Candidate Name", "full_name"], ["Applicant's Name", "full_name"],
    ["Date of Birth (optional)", "date_of_birth"], ["DOB", "date_of_birth"],
    ["Mobile Number *", "phone"], ["Contact No.", "phone"], ["WhatsApp Number", "phone"], ["Alternate Mobile Number", "alternate_phone"],
    ["Email Address *", "email"], ["Email ID", "email"], ["Confirm Email", "email"],
    ["City", "city"], ["State", "state"], ["Country", "country"], ["PIN Code", "postal_code"], ["Zip / Postal code", "postal_code"],
    ["Current Address", "address"], ["Permanent Address", "address"], ["Current Location", "location"],
    ["Preferred Location", "preferred_location"], ["Marital Status", "marital_status"], ["Father's Name", "father_name"],
    ["Latest Employer Name *", "current_company"], ["Last Company", "current_company"], ["Organization Name", "current_company"],
    ["Current Employer", "current_company"], ["Designation on Leaving *", "current_title"], ["Designation", "current_title"],
    ["Current Role", "current_title"], ["Job Duration *", "job_duration"], ["Tenure", "job_duration"],
    ["Date of Joining", "employment_start"], ["Date of Relieving", "employment_end"], ["Last Working Day", "employment_end"],
    ["Current / Last CTC", "current_salary"], ["Current CTC (LPA)", "current_salary"], ["Last drawn salary", "current_salary"],
    ["Expected CTC", "expected_salary"], ["ECTC", "expected_salary"], ["Notice Period", "notice_period"],
    ["Total Experience", "years_experience"], ["Experience (in years)", "years_experience"], ["Total Exp", "years_experience"],
    ["Highest Qualification", "degree"], ["Qualification", "degree"], ["College / University", "school"], ["Institute Name", "school"],
    ["Branch", "discipline"], ["Specialisation", "discipline"], ["Year of Passing", "graduation_year"], ["Passing Year", "graduation_year"],
    ["Percentage*", "gpa"], ["CGPA", "gpa"], ["Aggregate Marks", "gpa"],
    ["Portfolio / LinkedIn / GitHub Link (optional)", "profile_links"], ["LinkedIn Profile URL", "linkedin"], ["GitHub", "github"],
    ["Are you currently employed?", "currently_employed"],
  ] as const)("%s → %s", (label, key) => {
    expect(classify(field(label)).key).toBe(key);
  });

  it("sends short 'own words' questions to the answer library", () => {
    expect(classify(field("Reason for Change *")).question).toBe(true);
    expect(classify(field("Why should we hire you", { kind: "textarea" })).question).toBe(true);
  });

  it("doesn't confuse look-alikes", () => {
    expect(classify(field("Country code")).key).not.toBe("country");
    expect(classify(field("Father's Name")).key).not.toBe("full_name");
    expect(classify(field("Applying for position")).key).not.toBe("current_title");
    expect(classify(field("Statement of purpose", { kind: "textarea" })).key).not.toBe("state");
  });
});

describe("splitLocation", () => {
  it.each([
    ["Bangalore, India", { city: "Bangalore", state: "Karnataka", country: "India" }],
    ["Chennai, Tamil Nadu 600001", { city: "Chennai", state: "Tamil Nadu", country: "India", postalCode: "600001" }],
    ["Austin, TX, USA", { city: "Austin", state: "Texas", country: "United States" }],
    ["Pune", { city: "Pune", state: "Maharashtra", country: "India" }],
    ["Springfield", { city: "Springfield", state: null, country: null }],
  ])("%s", (location, expected) => {
    expect(splitLocation(location)).toMatchObject(expected);
  });
});

describe("filling a full Indian-style application", () => {
  it("fills every part from the profile, including repeated employer blocks", () => {
    const base = makeProfile();
    const profile = makeProfile({
      personal_information: { ...base.personal_information, location: "Bangalore, India" },
      additional_info: { ...base.additional_info, date_of_birth: "2001-05-14", current_salary: "6 LPA", expected_salary: "9 LPA", notice_period: "30 days" },
      experience: [
        { ...base.experience[0]!, company_name: "Old Co", designation: "Intern", is_current: false, start_date: "2022-01", end_date: "2022-06" },
        { ...base.experience[0]!, company_name: "Sify Technologies", designation: "Data Scientist", is_current: true, start_date: "2024-07", end_date: null },
      ],
      professional_summary: { ...base.professional_summary, current_designation: "Data Scientist" },
    });
    const form = [
      field("City"), field("State"), field("Country"), field("Date of Birth", { kind: "date" }),
      field("Latest Employer Name *"), field("Designation on Leaving *"), field("Job Duration *"),
      field("Latest Employer Name *", { id: "e2" }), field("Designation on Leaving *", { id: "d2" }), field("Job Duration *", { id: "j2" }),
      field("Current / Last CTC"), field("Expected CTC"), field("Notice Period"),
      field("Portfolio / LinkedIn / GitHub Link (optional)"),
    ];
    const mapped = mapFields(form, 0, profile, null);
    const values = Object.fromEntries(mapped.map((f) => [f.id, [f.value, f.status]]));
    expect(values["City"]).toEqual(["Bangalore", "auto"]);
    expect(values["State"]).toEqual(["Karnataka", "auto"]);
    expect(values["Country"]).toEqual(["India", "auto"]);
    expect(values["Date of Birth"]).toEqual(["2001-05-14", "auto"]);
    expect(values["Latest Employer Name *"]).toEqual(["Sify Technologies", "auto"]);
    expect(values["Designation on Leaving *"]).toEqual(["Data Scientist", "auto"]);
    expect(values["Job Duration *"]![0]).toMatch(/^Jul 2024 – Present \(/);
    expect(values["e2"]).toEqual(["Old Co", "auto"]);
    expect(values["d2"]).toEqual(["Intern", "auto"]);
    expect(values["j2"]![0]).toBe("Jan 2022 – Jun 2022 (5 months)");
    expect(values["Current / Last CTC"]).toEqual(["6 LPA", "auto"]);
    expect(values["Expected CTC"]).toEqual(["9 LPA", "auto"]);
    expect(values["Notice Period"]).toEqual(["30 days", "auto"]);
    expect(values["Portfolio / LinkedIn / GitHub Link (optional)"]![0]).toBe("https://priyaraman.dev");
  });
});
