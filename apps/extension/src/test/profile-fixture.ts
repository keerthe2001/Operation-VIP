import type { ExtensionProfile } from "@/shared/types";

export function makeProfile(overrides: Partial<ExtensionProfile["profile"]> = {}): ExtensionProfile["profile"] {
  return {
    id: "p1",
    source_resume_id: null,
    updated_at: "2026-01-01T00:00:00Z",
    personal_information: {
      full_name: "Priya Raman", first_name: "Priya", last_name: "Raman", email: "priya.raman@example.com",
      phone: "+919876543210", location: "Bengaluru, India", linkedin: "https://linkedin.com/in/priya-raman",
      github: "https://github.com/priyaraman", portfolio: "https://priyaraman.dev",
    },
    professional_summary: { current_designation: "Senior Software Engineer", total_experience_years: 7, summary: "Backend engineer." },
    experience: [
      {
        company_name: "Acme Technologies", designation: "Senior Software Engineer", employment_type: null, location: null,
        start_date: "2021-01", end_date: null, is_current: true, responsibilities: [], achievements: [], technologies: [],
        confidence: 0.9, is_confirmed: true,
      },
    ],
    education: [
      {
        degree: "B.Tech", institution: "Anna University", specialization: "Computer Science", start_year: 2013,
        graduation_year: 2017, grade: "8.6/10", confidence: 0.9, is_confirmed: true,
      },
    ],
    projects: [],
    certifications: [],
    skills: {
      programming_languages: ["Python", "Go"], frameworks: ["Django"], databases: ["PostgreSQL"], cloud: ["AWS"],
      ai_ml: [], tools: ["Git"], soft_skills: [], other: [],
    },
    additional_info: {
      work_authorization: "Indian citizen", requires_sponsorship: false, notice_period: "30 days",
      expected_salary: "30 LPA", current_salary: null, willing_to_relocate: true, preferred_locations: [],
      gender: null, pronouns: null, date_of_birth: null, nationality: "Indian", languages: ["English", "Tamil"],
    },
    field_meta: {},
    completion: { percentage: 90, sections: {}, items: [], unconfirmed_fields: 0 },
    ...overrides,
  } as ExtensionProfile["profile"];
}
