import { describe, expect, it } from "vitest";

import { jobLocation, jobMatch, jobSkills, requiredYears } from "./job-match";

const profile = {
  skills: { programming_languages: ["Python", "SQL"], frameworks: ["Pandas", "sklearn"], cloud: ["AWS (S3)"], tools: ["Power BI"] },
  professional_summary: { total_experience_years: 2 },
  personal_information: { location: "Chennai, Tamil Nadu" },
  additional_info: { preferred_locations: ["Bengaluru"], willing_to_relocate: null },
} as unknown as Parameters<typeof jobMatch>[0];

const JD = `Location: Bengaluru, Karnataka
We need 3+ years of experience in Python, SQL and Scikit-learn.
Hands-on with AWS, Docker and Kubernetes. Experience with Tableau is a plus. Go is nice to have.`;

describe("jobMatch", () => {
  it("finds skills the job asks for, matched and missing", () => {
    expect(jobSkills("Strong in R and Go; react.js; we go to market fast")).toEqual(["Go", "R", "React"]);
    const match = jobMatch(profile, JD);
    expect(match.skills.matched).toEqual(["Python", "SQL", "sklearn", "AWS (S3)"]);
    expect(match.skills.missing).toEqual(["Go", "Docker", "Kubernetes", "Tableau"]);
  });

  it("reads required experience and location", () => {
    expect(requiredYears("Minimum 2-4 yrs of relevant experience; 10 years of company history")).toBe(2);
    expect(requiredYears("Founded 20 years ago")).toBeNull();
    expect(jobLocation("Job Location: Pune\nAbout us")).toBe("Pune");
    const match = jobMatch(profile, JD);
    expect(match.experience).toEqual({ required: 3, have: 2, ok: false });
    expect(match.location).toEqual({ job: "Bengaluru, Karnataka", ok: true });
    expect(match.score).toBeGreaterThan(40);
    expect(match.score).toBeLessThan(80);
  });

  it("has no score without a description", () => {
    expect(jobMatch(profile, null).score).toBeNull();
  });
});
