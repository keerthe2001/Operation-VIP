export type User = {
  id: string; name: string; email: string; role: "student" | "admin"; plan: "free" | "pro";
  profile: { career_path: string; skill_level: Skill | null; time_budget: Budget | null;
    explain_mode: "simple" | "eng"; autoplay: boolean; onboarded: boolean };
};
export type Skill = "beginner" | "intermediate" | "advanced";
export type Budget = "30m" | "1h" | "2h" | "weekends";

export type SceneStep = { at: number; caption: string; tone?: "ask" | "good" | "bad"; when?: string; [k: string]: unknown };
export type SceneSwitch = { id: string; label: string; label_on: string; label_off: string; track: number };
export type Scene = { engine: string; title: string; track: string[]; steps: SceneStep[]; switches?: SceneSwitch[]; [k: string]: unknown };

export type Question = {
  id: string; type: "predict" | "mcq" | "multi" | "order" | "fill" | "debug" | "tune";
  prompt: string; hint?: string; options?: string[]; items?: string[]; code?: string;
  labels?: string[]; logits?: number[]; target?: number; min?: number; max?: number; range?: [number, number];
};

export type TopicBody = {
  objectives: string[]; intro: string; intro_eng?: string; scenes: Scene[];
  points: { title: string; text: string; eng?: string; step?: number }[];
  words?: [string, string][];
  code?: { file: string; source: string; notes?: Record<string, [string, string]> };
  exercise?: { prompt: string; starter: string; tests: string; solution: string };
  checks: Question[]; lab?: string;
};

export type TopicState = { status: "new" | "started" | "watched" | "practised"; checks_total: number;
  checks_passed: number; watched: boolean; tested_out: boolean };

export type Topic = {
  slug: string; title: string; summary: string; minutes: number; number: number; count: number;
  level: { number: number; slug: string; title: string }; body: TopicBody;
  lab: { slug: string; title: string } | null; prev: string | null; next: string | null;
  outline: { slug: string; title: string }[];
  progress: (TopicState & { passed_ids: string[]; unlocked: boolean }) | null;
};

export type Curriculum = {
  path: { slug: string; title: string; summary: string };
  levels: { number: number; slug: string; title: string; summary: string; hours: number; optional: boolean;
    mission: { slug: string; title: string } | null;
    topics: { slug: string; number: number; title: string; summary: string; minutes: number; engine: string | null;
      practice: string[]; has_code: boolean; lab: string | null }[] }[];
};

export type LevelState = {
  number: number; slug: string; title: string; summary: string; hours: number; optional: boolean; unlocked: boolean;
  topics: (TopicState & { slug: string; title: string; number: number; minutes: number; lab: string | null; lab_done: boolean })[];
  practised: number; complete: boolean; proven: boolean;
  mission: { slug: string; title: string; status: "not_submitted" | "submitted" | "passed" | "needs_work"; score: number | null } | null;
};

export type NextActivity = { kind: "watch" | "practise" | "lab" | "mission" | "diagnostic" | "certificate";
  title: string; why: string; minutes: number; slug?: string; level?: number; topic?: string };

export type LearnerState = {
  path: { slug: string; title: string }; levels: LevelState[];
  totals: { topics: number; practised: number; percent: number };
  xp: number; streak: number; week: { day: string; minutes: number }[];
  next: NextActivity | null; certificate: { eligible: boolean; code: string | null };
  plan: { hours: number; weekly_hours: number; weeks: number; start: string; time_label: string; explain_mode: string } | null;
};

export type LabStep = { id: string; say: string; kind?: "code" | "read"; starter?: string; append?: string; show?: string; replace?: boolean;
  check?: { expr?: string; stdout?: string; fail?: string }; hint?: string; explain?: string; notes?: Record<string, string> };
export type Lab = { slug: string; title: string; body: { intro: string; minutes: number; steps: LabStep[] };
  topic: { slug: string; title: string } | null; level: { number: number; title: string } | null;
  progress: { steps_done: string[]; code: Record<string, string>; completed: boolean } | null };

export type Submission = { id: string; repo_url: string; demo_url: string | null; notes: string;
  status: "submitted" | "passed" | "needs_work"; score: number | null; rubric_scores: Record<string, number>;
  feedback: string; created_at: string; reviewed_at: string | null };
export type Project = { slug: string; title: string; level: { number: number; slug: string; title: string };
  body: { problem: string; requirements: string[]; milestones: string[]; rubric: { name: string; points: number; pass: string }[];
    pass_mark: number; submit: string; starter?: string };
  progress: { milestones_done: string[]; submissions: Submission[]; unlocked: boolean; level_complete: boolean } | null };

export type Certificate = { code: string; name: string; issued_at: string; path: string; summary: { levels?: number; topics?: number; missions?: number } };
export type Achievement = { code: string; title: string; icon: string; tone: string; how: string; earned_at: string | null };
