import { describe, expect, it } from "vitest";

import { classifyIntent, matchAnswers, matchJobSkills, placeholderValues, renderTemplate, type SavedAnswer } from "./answers";

function answer(id: string, category: SavedAnswer["category"], question: string, usage = 0): SavedAnswer {
  return {
    id, category, question_text: question, answer_template: `${id} answer`, variants: [], usage_count: usage,
    created_at: "", updated_at: "",
  };
}

describe("classifyIntent", () => {
  it.each([
    ["Why do you want to work at Acme?", "why_company"],
    ["What excites you about joining our team?", "why_company"],
    ["Why are you interested in this position?", "why_role"],
    ["What interests you about this role?", "why_role"],
    ["Tell us a little about yourself", "about_you"],
    ["What are your greatest strengths?", "strengths"],
    ["Describe an area for improvement", "weaknesses"],
    ["Describe a challenging project you worked on", "challenging_project"],
    ["Where do you see yourself in five years?", "career_goals"],
    ["Why are you leaving your current job?", "leaving_reason"],
    ["Why should we hire you?", "why_hire"],
    ["What is your notice period?", "availability"],
    ["What are your salary expectations?", "salary"],
    ["Are you open to relocation?", "relocation"],
    ["Link to your favourite open-source project", null],
  ] as const)("%s → %s", (question, intent) => {
    expect(classifyIntent(question)).toBe(intent);
  });
});

describe("matchAnswers", () => {
  const library = [
    answer("company", "why_company", "Why do you want to work here?"),
    answer("role", "why_role", "Why this role?"),
    answer("about", "about_you", "Tell us about yourself"),
    answer("misc", "other", "How did you hear about us?"),
  ];

  it("prefers answers with the same intent", () => {
    expect(matchAnswers("Why do you want to join Acme?", library)[0]!.answer.id).toBe("company");
    expect(matchAnswers("What interests you about this position?", library)[0]!.answer.id).toBe("role");
  });

  it("falls back to wording similarity for other questions", () => {
    expect(matchAnswers("How did you hear about this job?", library)[0]!.answer.id).toBe("misc");
  });

  it("returns nothing for unrelated questions", () => {
    expect(matchAnswers("Please list your publications", library)).toEqual([]);
  });

  it("breaks ties by how often an answer was used", () => {
    const ranked = matchAnswers("Why do you want to work here?", [
      answer("a", "why_company", "Why do you want to work here?", 1),
      answer("b", "why_company", "Why do you want to work here?", 5),
    ]);
    expect(ranked.map((m) => m.answer.id)).toEqual(["b", "a"]);
  });
});

describe("renderTemplate", () => {
  const profile = {
    personal_information: { full_name: "Priya Raman", first_name: "Priya" },
    professional_summary: { current_designation: "Senior Engineer", total_experience_years: 7 },
    experience: [{ company_name: "Acme Tech", designation: "Senior Engineer", is_current: true }],
    education: [{ degree: "B.Tech" }],
    skills: { programming_languages: ["Python", "Go"], frameworks: ["Django"], databases: ["Postgres"] },
    additional_info: { notice_period: null },
  } as unknown as Parameters<typeof placeholderValues>[0];

  it("fills placeholders from the profile and job", () => {
    const values = placeholderValues(profile, { company: "Globex", title: "Staff Engineer" });
    const rendered = renderTemplate("As a {current_designation} with {years_experience} years in {top_skills}, I'd love to join {company} as {job_title}.", values);
    expect(rendered.text).toBe("As a Senior Engineer with 7 years in Python, Go and Django, I'd love to join Globex as Staff Engineer.");
    expect(rendered.missing).toEqual([]);
  });

  it("uses {name|fallback} text when a value is unknown", () => {
    const rendered = renderTemplate("I can start {notice_period|soon} at {company|your company}{job_title}.", placeholderValues(profile, { company: "Globex" }));
    expect(rendered.text).toBe("I can start soon at Globex{job_title}.");
    expect(rendered.missing).toEqual(["job_title"]);
  });

  it("keeps missing values visible and reports prompts to personalize", () => {
    const rendered = renderTemplate("Notice: {notice_period}. I like {company} because [your reason].", placeholderValues(profile));
    expect(rendered.text).toBe("Notice: {notice_period}. I like {company} because [your reason].");
    expect(rendered.missing).toEqual(["notice_period", "company"]);
    expect(rendered.prompts).toEqual(["your reason"]);
  });
});

describe("job description matching", () => {
  it("finds the user's skills that the description mentions", () => {
    const description = "We use Python, Node.js and C++ daily. Experience with AWS is a plus. JavaScript not required.";
    expect(matchJobSkills(description, ["Go", "Python", "C++", "Node.js", "AWS", "Java", "python"])).toEqual(["Python", "C++", "Node.js", "AWS"]);
    expect(matchJobSkills(null, ["Python"])).toEqual([]);
  });

  it("fills {matching_skills} from the description, falling back to top skills", () => {
    const profile = {
      personal_information: {}, professional_summary: {}, experience: [], education: [], additional_info: {},
      skills: { programming_languages: ["Python", "Go", "Rust"], frameworks: ["Django"], databases: ["PostgreSQL"] },
    } as unknown as Parameters<typeof placeholderValues>[0];
    expect(placeholderValues(profile, { description: "Django and PostgreSQL experience needed" }).matching_skills).toBe("Django and PostgreSQL");
    expect(placeholderValues(profile, {}).matching_skills).toBe("Python, Go and Rust");
  });
});
