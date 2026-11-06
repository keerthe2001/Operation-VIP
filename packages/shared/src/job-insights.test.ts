import { describe, expect, it } from "vitest";

import { placeholderValues, renderTemplate } from "./answers";
import { analyzeJobDescription } from "./job-insights";

const POSTING = `About Northwind
Northwind helps hospitals predict patient readmissions with clinical data.

What you'll do
• Building machine learning models that flag high-risk patients for our care teams
• Partner with clinicians to define success metrics.

Requirements
• 2+ years of Python and SQL
We are an equal opportunity employer.`;

describe("analyzeJobDescription", () => {
  it("reads what the company does and the main responsibility", () => {
    expect(analyzeJobDescription(POSTING, "Northwind")).toEqual({
      companyFocus: "helps hospitals predict patient readmissions with clinical data",
      responsibility: "build machine learning models that flag high-risk patients for your care teams",
    });
  });

  it("handles 'we' sentences, missions and lead-ins", () => {
    const posting = "We're a fintech startup that makes payroll simple for our customers.\nResponsibilities\nYou will design APIs used by millions of people every day.";
    expect(analyzeJobDescription(posting, null)).toEqual({
      companyFocus: "is a fintech startup that makes payroll simple for its customers",
      responsibility: "design APIs used by millions of people every day",
    });
    expect(analyzeJobDescription("Our mission is to make clean energy affordable for every home.", null).companyFocus).toBe(
      "is on a mission to make clean energy affordable for every home",
    );
  });

  it("returns nothing when there is nothing reliable to use", () => {
    expect(analyzeJobDescription("", "Acme")).toEqual({ companyFocus: null, responsibility: null });
    expect(analyzeJobDescription("Salary: competitive. Apply now!", "Acme")).toEqual({ companyFocus: null, responsibility: null });
  });
});

describe("profile-derived placeholders", () => {
  const profile = {
    personal_information: { full_name: "Asha Menon" },
    professional_summary: { current_designation: "Data Scientist", total_experience_years: 2 },
    experience: [
      {
        company_name: "Contoso",
        designation: "Data Scientist",
        is_current: true,
        responsibilities: ["Engineered data pipelines using Python and SQL.", "Cut report time by 40% with automation."],
        achievements: [],
      },
    ],
    education: [{ degree: "Bachelor of Engineering", specialization: "Computer Science", graduation_year: 2024 }],
    projects: [{ project_name: "Readmission Risk Model", points: ["Developed Random Forest models on 100,000+ records.", "Achieved over 90% accuracy."] }],
    skills: { programming_languages: ["Python", "SQL"], frameworks: [], databases: [] },
    additional_info: { notice_period: "30 days" },
  } as unknown as Parameters<typeof placeholderValues>[0];

  it("builds a natural answer without anything to fill in by hand", () => {
    const values = placeholderValues(profile, { company: "Northwind", title: "ML Engineer", description: POSTING });
    expect(values.background).toBe("a Data Scientist with 2 years of experience");
    expect(values.recent_work).toBe("engineered data pipelines using Python and SQL");
    expect(values.top_achievement).toBe("cut report time by 40% with automation");
    expect(values.project_highlight).toBe("developed Random Forest models on 100,000+ records");
    expect(values.project_result).toBe("achieved over 90% accuracy");
    expect(values.start_availability).toBe("after my notice period of 30 days");
    const rendered = renderTemplate(
      "I'm excited about {company} because it {company_focus|does great work}. As {background}, I'd love to {job_responsibility|help}.",
      values,
    );
    expect(rendered.text).toBe(
      "I'm excited about Northwind because it helps hospitals predict patient readmissions with clinical data. As a Data Scientist with 2 years of experience, I'd love to build machine learning models that flag high-risk patients for your care teams.",
    );
    expect(rendered.missing).toEqual([]);
  });

  it("describes students by their degree", () => {
    const student = { ...profile, professional_summary: {}, experience: [], education: [{ degree: "B.Tech", specialization: "Electronics", graduation_year: 2099 }] } as unknown as Parameters<typeof placeholderValues>[0];
    expect(placeholderValues(student).background).toBe("a B.Tech student in Electronics");
  });
});
