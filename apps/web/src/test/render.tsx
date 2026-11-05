import type { UserRead } from "@copilot/api-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import { SessionStore } from "@/lib/auth/session";
import { SKILL_CATEGORIES } from "@/lib/profile/form";
import type { SavedAnswer, SavedAnswerInput } from "@/lib/answers/answer-service";
import { STATUSES, type Application, type ApplicationCreate, type ApplicationStats, type ApplicationUpdate } from "@/lib/applications/application-service";
import type { Profile, ProfileWrite } from "@/lib/profile/profile-service";
import type { Resume } from "@/lib/resumes/resume-service";
import { ServicesProvider, type Services } from "@/lib/services";
import { routes } from "@/router";

export const testUser: UserRead = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "jane@example.com",
  full_name: "Jane Doe",
  created_at: "2026-01-01T00:00:00Z",
};

export function emptyProfile(): Profile {
  return {
    id: "p1",
    source_resume_id: null,
    updated_at: "2026-01-01T00:00:00Z",
    personal_information: {},
    professional_summary: {},
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    skills: Object.fromEntries(SKILL_CATEGORIES.map(([k]) => [k, []])) as unknown as Profile["skills"],
    additional_info: { preferred_locations: [], languages: [] },
    field_meta: {},
    completion: { percentage: 0, sections: {}, items: [], unconfirmed_fields: 0 },
  };
}

export function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "r1",
    file_name: "jane.pdf",
    mime_type: "application/pdf",
    size_bytes: 12345,
    doc_class: "text_pdf",
    status: "ready",
    error_code: null,
    error_message: null,
    page_count: 1,
    is_primary: true,
    created_at: "2026-01-01T00:00:00Z",
    processed_at: "2026-01-01T00:00:01Z",
    ocr_confidence: null,
    warnings: [],
    ...overrides,
  };
}

interface Options {
  authenticated?: boolean;
  profile?: Profile;
  resumes?: Resume[];
  extension?: { installed: boolean; signedIn: boolean };
  answers?: SavedAnswer[];
  applications?: Application[];
}

export function renderApp(path: string, options: Options = {}) {
  const session = new SessionStore();
  if (options.authenticated) session.setAuthenticated("token", testUser);
  else session.clear();

  let profileState = options.profile ?? emptyProfile();
  let resumeState = options.resumes ?? [];

  const auth = {
    login: vi.fn(async () => {
      session.setAuthenticated("token", testUser);
      return testUser;
    }),
    register: vi.fn(async () => {
      session.setAuthenticated("token", testUser);
      return testUser;
    }),
    logout: vi.fn(async () => session.clear()),
    restore: vi.fn(async () => undefined),
  } satisfies Services["auth"];

  const resumes = {
    list: vi.fn(async () => resumeState),
    get: vi.fn(async (id: string) => ({ ...resumeState.find((r) => r.id === id)!, extracted_text: "text", extracted_data: null, extraction_meta: null })),
    upload: vi.fn(async (file: File, onProgress?: (p: number) => void) => {
      onProgress?.(100);
      const resume = makeResume({ id: `r${resumeState.length + 1}`, file_name: file.name, status: "uploaded" });
      resumeState = [resume, ...resumeState.map((r) => ({ ...r, is_primary: false }))];
      return resume;
    }),
    reprocess: vi.fn(async (id: string) => resumeState.find((r) => r.id === id)!),
    remove: vi.fn(async (id: string) => {
      resumeState = resumeState.filter((r) => r.id !== id);
    }),
    file: vi.fn(async () => new Blob(["%PDF-"], { type: "application/pdf" })),
  } satisfies Services["resumes"];

  const profile = {
    get: vi.fn(async () => profileState),
    save: vi.fn(async (values: ProfileWrite) => {
      profileState = { ...profileState, ...(values as Partial<Profile>) };
      return profileState;
    }),
    importResume: vi.fn(async () => profileState),
  } satisfies Services["profile"];

  const extension = { handoffToken: vi.fn(async () => "refresh-token-for-extension-xxxxxxxx") } satisfies Services["extension"];
  const extensionBridge = {
    status: vi.fn(async () => options.extension ?? { installed: false, signedIn: false }),
    connect: vi.fn(async () => ({ ok: true })),
  } satisfies Services["extensionBridge"];

  let answerState: SavedAnswer[] = options.answers ?? [];
  const answers = {
    list: vi.fn(async () => answerState),
    templates: vi.fn(async () => [
      { category: "why_company" as const, question_text: "Why do you want to work at this company?", answer_template: "I like {company} because [reason].", variants: [] },
    ]),
    placeholders: vi.fn(async () => ({ company: "Company", current_designation: "Your title" })),
    create: vi.fn(async (input: SavedAnswerInput) => {
      const created = { ...input, variants: input.variants ?? [], id: `a${answerState.length + 1}`, usage_count: 0, created_at: "", updated_at: "" } as SavedAnswer;
      answerState = [...answerState, created];
      return created;
    }),
    update: vi.fn(async (id: string, input: Partial<SavedAnswerInput>) => {
      answerState = answerState.map((a) => (a.id === id ? ({ ...a, ...input } as SavedAnswer) : a));
      return answerState.find((a) => a.id === id)!;
    }),
    remove: vi.fn(async (id: string) => {
      answerState = answerState.filter((a) => a.id !== id);
    }),
  } satisfies Services["answers"];

  let applicationState: Application[] = options.applications ?? [];
  const statsFor = (): ApplicationStats => {
    const by: Record<string, number> = Object.fromEntries(STATUSES.map((st) => [st, 0]));
    for (const a of applicationState) by[a.status] = (by[a.status] ?? 0) + 1;
    const submitted = (by.submitted ?? 0) + (by.interview ?? 0) + (by.offer ?? 0) + (by.rejected ?? 0);
    const responses = (by.interview ?? 0) + (by.offer ?? 0) + (by.rejected ?? 0);
    return {
      total: applicationState.length, by_status: by, active: (by.detected ?? 0) + (by.in_progress ?? 0) + (by.ready_to_submit ?? 0),
      submitted, responses, response_rate: submitted ? responses / submitted : null, this_week: applicationState.length,
      weekly: Array.from({ length: 8 }, (_, i) => ({
        week_start: new Date(Date.UTC(2026, 8, 14 + i * 7)).toISOString().slice(0, 10),
        count: i === 7 ? applicationState.length : i % 3,
      })),
    };
  };
  const applications = {
    list: vi.fn(async (filters: { status?: string; q?: string } = {}) =>
      applicationState.filter(
        (a) => (!filters.status || a.status === filters.status) && (!filters.q || `${a.company_name} ${a.job_title}`.toLowerCase().includes(filters.q.toLowerCase())),
      ),
    ),
    get: vi.fn(async (id: string) => ({ ...applicationState.find((a) => a.id === id)!, resume_file_name: "jane.pdf", answers: [] })),
    stats: vi.fn(async () => statsFor()),
    create: vi.fn(async (input: ApplicationCreate) => {
      const created = makeApplication({ id: `app${applicationState.length + 1}`, job_url: input.job_url, company_name: input.company_name ?? null, job_title: input.job_title ?? null, status: input.status ?? "in_progress", source: "manual" });
      applicationState = [created, ...applicationState];
      return created;
    }),
    update: vi.fn(async (id: string, input: ApplicationUpdate) => {
      applicationState = applicationState.map((a) => (a.id === id ? ({ ...a, ...input } as Application) : a));
      return applicationState.find((a) => a.id === id)!;
    }),
    remove: vi.fn(async (id: string) => {
      applicationState = applicationState.filter((a) => a.id !== id);
    }),
  } satisfies Services["applications"];

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <ServicesProvider services={{ session, auth, resumes, profile, extension, extensionBridge, answers, applications }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ServicesProvider>,
  );
  return { ...utils, auth, resumes, profile, extension, extensionBridge, answers, applications, session, router, setResumes: (r: Resume[]) => (resumeState = r) };
}

export function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app1", company_name: "Acme Corp", job_title: "Backend Engineer", job_url: "https://boards.greenhouse.io/acme/jobs/1",
    portal: "greenhouse", job_description: null, notes: null, status: "in_progress",
    status_history: [{ status: "detected", at: "2026-11-01T10:00:00Z", by: "extension" }], resume_id: null,
    fields_detected: 10, fields_filled: 7, source: "extension", applied_at: null,
    created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-02T10:00:00Z", ...overrides,
  };
}
