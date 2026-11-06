/**
 * Answer library logic shared by the web app (preview) and the extension (suggestions):
 * question intent, matching saved answers to a question, and rendering templates.
 * Everything is deterministic and runs locally; no AI service is involved.
 */
import type { components } from "@copilot/api-types";

import { analyzeJobDescription } from "./job-insights";

type Schemas = components["schemas"];
export type SavedAnswer = Schemas["SavedAnswerRead"];
export type AnswerCategory = SavedAnswer["category"];
type Profile = Schemas["ProfileRead"];

export const CATEGORY_LABELS: Record<AnswerCategory, string> = {
  why_company: "Why this company",
  why_role: "Why this role",
  about_you: "About you",
  strengths: "Strengths",
  weaknesses: "Weaknesses",
  challenging_project: "Challenging project",
  career_goals: "Career goals",
  leaving_reason: "Reason for leaving",
  why_hire: "Why hire you",
  availability: "Availability",
  salary: "Salary",
  relocation: "Relocation",
  other: "Other",
};

/** Ordered: more specific intents first. */
const INTENTS: [AnswerCategory, RegExp][] = [
  ["leaving_reason", /\b(why (are|did|do) you (want to )?(leav|look|quit)|reason(s)? for (leaving|change|looking)|leaving your (current|last))/],
  ["why_hire", /\b(why should (we|i) hire|what (makes|sets) you (a good|apart|the right|unique)|why (are|would) you (be )?(a )?(good|great|strong|the right) (fit|candidate)|why you\b)/],
  ["why_role", /\b(why (are you|do you) .*(interest|apply|want).*(role|position|job|opportunit)|interest(ed)? in (this|the) (role|position|job|opportunit)|why (this|the) (role|position)|what (attracts|interests|excites) you about (this|the) (role|position|job))/],
  ["why_company", /\b(why (do|would) you (want to )?(work|join)|why .*(us|our company|this company|join|work (at|for|with))\b|what (excites|attracts|interests|draws) you (about|to) (us|the company|this company|working|joining|our|the team)|why are you interested in (us|working|joining))/],
  ["about_you", /\b(tell (us|me) (a bit |a little )?about (yourself|you)|introduce yourself|describe yourself|who are you|about yourself)/],
  ["strengths", /\bstrength/],
  ["weaknesses", /\b(weakness|area(s)? (of|for) (improvement|growth)|improve on)/],
  ["challenging_project", /\b(challeng|difficult (project|problem|situation|task)|proud of|accomplishment|project you (worked|led|built)|hardest)/],
  ["career_goals", /\b(career (goal|aspiration|plan)|where do you see yourself|(five|5|ten|10) years|long[- ]term goal|future goals)/],
  ["availability", /\b(when can you (start|join)|notice period|availability|earliest (start|joining)|start date)/],
  ["salary", /\b(salary|compensation|pay expectation|ctc|remuneration)/],
  ["relocation", /\brelocat/],
];

export function classifyIntent(question: string): AnswerCategory | null {
  const text = question.toLowerCase().replace(/\s+/g, " ");
  return INTENTS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

const STOPWORDS = new Set(
  "a an the and or of to in on at for with you your yours we us our is are was were be been do does did can could would should will what why how when where which who this that these those it its me my i please describe tell about".split(" "),
);
const SYNONYMS: Record<string, string> = {
  organization: "company", organisation: "company", firm: "company", employer: "company", team: "company",
  position: "role", job: "role", opportunity: "role", vacancy: "role",
  join: "work", joining: "work", working: "work",
  interested: "interest", excites: "interest", excited: "interest", attracts: "interest", motivates: "interest",
  goals: "goal", aspirations: "goal",
};

/** Words every application question shares; intent detection already covers them. */
const GENERIC = new Set(["company", "role", "work", "interest", "want", "like"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map((w) => SYNONYMS[w] ?? w.replace(/(ing|ed|es|s)$/, ""))
      .filter((w) => w && !GENERIC.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export interface AnswerMatch {
  answer: SavedAnswer;
  score: number;
}

export const MATCH_THRESHOLD = 0.3;

/** Ranks saved answers for a question: same intent counts most, wording similarity breaks ties. */
export function matchAnswers(question: string, answers: SavedAnswer[]): AnswerMatch[] {
  const intent = classifyIntent(question);
  const words = tokens(question);
  return answers
    .map((answer) => {
      const similarity = jaccard(words, tokens(answer.question_text));
      const score = intent && answer.category === intent ? 0.6 + 0.4 * similarity : similarity;
      return { answer, score: Math.round(score * 100) / 100 };
    })
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || b.answer.usage_count - a.answer.usage_count);
}

// ------------------------------------------------------------------ templates

export interface JobContext {
  company?: string | null;
  title?: string | null;
  /** Plain-text job description, when the page has one. */
  description?: string | null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The user's own skills that the job description mentions, in profile order.
 * Only exact (case-insensitive, whole-word) mentions count, so nothing is guessed.
 */
export function matchJobSkills(description: string | null | undefined, skills: string[]): string[] {
  if (!description) return [];
  const text = description.toLowerCase();
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    // Word boundaries that also work for names like "C++", "Node.js" or ".NET"; "AWS (S3)" also
    // matches a plain "AWS".
    const names = [key, key.split("(")[0]!.trim()].filter(Boolean);
    return names.some((name) => new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(name)}(?![a-z0-9+#])`, "i").test(text));
  });
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

type ProfileLike = Pick<
  Profile,
  "personal_information" | "professional_summary" | "experience" | "education" | "skills" | "additional_info"
> & { projects?: Profile["projects"] };

/** "Engineered data pipelines." → "engineered data pipelines" so it reads after "I". */
export function asClause(text: string | null | undefined): string | null {
  const clean = text?.replace(/\s+/g, " ").trim().replace(/[\s.;,:]+$/, "");
  if (!clean) return null;
  // Keep acronyms and names ("SQL", "AWS") as written.
  return /^[A-Z][a-z]/.test(clean) ? clean[0]!.toLowerCase() + clean.slice(1) : clean;
}

const article = (word: string) => (/^[aeiou]/i.test(word) && !/^(uni|use|eu)/i.test(word) ? "an" : "a");
const hasNumber = (point: string) => /\d|%/.test(point);
const RESULT_WORDS =
  /^(achieved|improved|increased|reduced|cut|saved|grew|boosted|raised|won|delivered|accelerated|lowered|doubled|tripled|exceeded)\b/i;
/** The strongest result: a measurable outcome first ("Achieved 90% accuracy"), then any number. */
const bestResult = (points: string[]) =>
  points.find((p) => RESULT_WORDS.test(p.trim()) && hasNumber(p)) ??
  points.find((p) => /%/.test(p)) ??
  points.find(hasNumber);

function background(profile: ProfileLike | null, years: string | null): string | null {
  if (!profile) return null;
  const current = profile.experience.find((e) => e.is_current) ?? profile.experience[0];
  const designation = profile.professional_summary.current_designation ?? current?.designation ?? null;
  if (designation) {
    const base = `${article(designation)} ${designation}`;
    if (!years || Number(years) < 1) return base;
    return `${base} with ${years} year${years === "1" ? "" : "s"} of experience`;
  }
  const education = profile.education[0];
  if (education?.degree) {
    const student = !!education.graduation_year && education.graduation_year > new Date().getFullYear();
    const field = education.specialization ? ` in ${education.specialization}` : "";
    return `${article(education.degree)} ${education.degree} ${student ? "student" : "graduate"}${field}`;
  }
  return null;
}

/** Values for {placeholders}, taken only from the profile and the detected job. */
export function placeholderValues(profile: ProfileLike | null, job: JobContext = {}): Record<string, string | null> {
  const p = profile?.personal_information;
  const s = profile?.professional_summary;
  const current = profile?.experience.find((e) => e.is_current) ?? profile?.experience[0];
  const allSkills = profile ? Object.values(profile.skills).flat() : [];
  const skills = allSkills.slice(0, 3);
  const matching = matchJobSkills(job.description, allSkills).slice(0, 4);
  const yearsValue = s?.total_experience_years;
  const years =
    yearsValue === null || yearsValue === undefined ? null : Number.isInteger(yearsValue) ? String(yearsValue) : yearsValue.toFixed(1);
  const insights = analyzeJobDescription(job.description, job.company);

  // Older cached profiles (extension storage) may lack some lists, so read them defensively.
  const workPoints = profile?.experience.flatMap((e) => [...(e.achievements ?? []), ...(e.responsibilities ?? [])]) ?? [];
  const project = profile?.projects?.find((pr) => pr.points?.length) ?? profile?.projects?.[0];
  const projectPoints = project?.points ?? [];
  const allPoints = [...workPoints, ...(profile?.projects?.flatMap((pr) => pr.points ?? []) ?? [])];
  const projectResult = bestResult(projectPoints.slice(1)) ?? null;
  const notice = profile?.additional_info.notice_period?.trim() || null;

  return {
    company: job.company ?? null,
    job_title: job.title ?? null,
    role: job.title ? `the ${job.title.replace(/\s+(role|position)$/i, "")} role` : null,
    company_focus: insights.companyFocus,
    job_responsibility: insights.responsibility,
    first_name: p?.first_name ?? p?.full_name?.split(" ")[0] ?? null,
    full_name: p?.full_name ?? null,
    background: background(profile, years),
    current_designation: s?.current_designation ?? current?.designation ?? null,
    current_company: current?.company_name ?? null,
    years_experience: years,
    top_skills: skills.length ? listOf(skills) : null,
    // Falls back to the top skills when the page has no description to compare with.
    matching_skills: matching.length ? listOf(matching) : skills.length ? listOf(skills) : null,
    recent_work: asClause(current?.responsibilities?.[0] ?? current?.achievements?.[0] ?? projectPoints[0]),
    top_achievement: asClause(bestResult(allPoints)),
    project_name: project?.project_name ?? null,
    project_highlight: asClause(projectPoints[0]),
    project_result: asClause(projectResult),
    highest_degree: profile?.education[0]?.degree ?? null,
    notice_period: notice,
    start_availability: notice
      ? /immediate|^0\s*(day|week)|none|n\/a/i.test(notice)
        ? "immediately"
        : `after my notice period of ${notice}`
      : null,
  };
}

export interface RenderedAnswer {
  text: string;
  /** Placeholders without a value (left visible in the text). */
  missing: string[];
  /** [Bracketed prompts] the user still has to replace with their own words. */
  prompts: string[];
}

/**
 * Fills {placeholders}. `{name|fallback text}` uses the fallback when the value isn't known
 * (for example when the job page has no description), so the answer still reads naturally.
 */
export function renderTemplate(template: string, values: Record<string, string | null>): RenderedAnswer {
  const missing = new Set<string>();
  const text = template.replace(/\{(\w+)(?:\|([^{}]*))?\}/g, (_match, name: string, fallback: string | undefined) => {
    const value = values[name];
    if (value) return value;
    if (fallback !== undefined) return fallback;
    missing.add(name);
    return `{${name}}`;
  });
  const prompts = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!);
  return { text, missing: [...missing], prompts };
}
