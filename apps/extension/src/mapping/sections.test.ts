import { describe, expect, it } from "vitest";

import { classify, mapFields } from "@/mapping/engine";
import type { FieldDescriptor } from "@/shared/fields";
import { makeProfile } from "@/test/profile-fixture";

function field(label: string, section: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id: `${section}:${label}:${Math.random()}`, kind: "text", label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "",
    required: false, options: [], currentValue: "", accept: "", maxLength: null, section, ...extra,
  };
}

describe("Workday 'My Experience' sections", () => {
  it("reads fields by their section", () => {
    expect(classify(field("To Year", "Education")).key).toBe("graduation_year");
    expect(classify(field("From Year", "Education")).key).toBe("education_start");
    expect(classify(field("To Month", "Work Experience")).key).toBe("employment_end");
    expect(classify(field("Location", "Work Experience")).key).toBe("job_location");
    expect(classify(field("I currently work here", "Work Experience", { kind: "checkbox" })).key).toBe("currently_working");
    expect(classify(field("Role Description", "Work Experience", { kind: "textarea" })).key).toBe("role_description");
    expect(classify(field("Language", "Languages", { kind: "listbox" })).key).toBe("language_item");
    expect(classify(field("URL", "Websites")).key).toBe("website_item");
    expect(classify(field("Type to Add Skills", "Skills", { kind: "combobox" })).key).toBe("skills");
    expect(classify(field("Resume/CV Upload a file (5MB max)", "Resume/CV", { kind: "file" })).key).toBe("resume");
    expect(classify(field("Graduation Year", "")).key).toBe("graduation_year");
  });

  it("fills each job's block, with split month/year dates", () => {
    const base = makeProfile();
    const profile = makeProfile({
      experience: [
        { ...base.experience[0]!, company_name: "Sify", designation: "Data Scientist", is_current: true, start_date: "2024-07", end_date: null, location: "Chennai", responsibilities: ["Built pipelines", "Ran EDA"] },
        { ...base.experience[0]!, company_name: "Old Co", designation: "Intern", is_current: false, start_date: "2022-01", end_date: "2022-06", location: null, responsibilities: [] },
      ],
      additional_info: { ...base.additional_info, languages: ["English", "Tamil"] },
    });
    const W = "Work Experience";
    const form = [
      field("Job Title", W), field("Company", W), field("Location", W), field("I currently work here", W, { kind: "checkbox" }),
      field("From Month", W), field("From Year", W), field("Role Description", W, { kind: "textarea" }),
      field("Job Title", W), field("Company", W), field("From Month", W), field("From Year", W), field("To Month", W), field("To Year", W),
      field("Language", "Languages", { kind: "listbox" }), field("Language", "Languages", { kind: "listbox" }),
    ];
    const values = mapFields(form, 0, profile, null).map((f) => f.value);
    expect(values.slice(0, 7)).toEqual(["Data Scientist", "Sify", "Chennai", "Yes", "07", "2024", "• Built pipelines\n• Ran EDA"]);
    expect(values.slice(7, 13)).toEqual(["Intern", "Old Co", "01", "2022", "06", "2022"]);
    expect(values.slice(13)).toEqual(["English", "Tamil"]);
  });
});
