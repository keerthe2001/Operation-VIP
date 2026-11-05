import type { UserRead } from "@copilot/api-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import { SessionStore } from "@/lib/auth/session";
import { SKILL_CATEGORIES } from "@/lib/profile/form";
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

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <ServicesProvider services={{ session, auth, resumes, profile }}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ServicesProvider>,
  );
  return { ...utils, auth, resumes, profile, session, router, setResumes: (r: Resume[]) => (resumeState = r) };
}
