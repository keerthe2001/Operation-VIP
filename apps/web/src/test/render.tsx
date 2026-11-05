import type { UserRead } from "@copilot/api-types";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import { SessionStore } from "@/lib/auth/session";
import { ServicesProvider, type Services } from "@/lib/services";
import { routes } from "@/router";

export const testUser: UserRead = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "jane@example.com",
  full_name: "Jane Doe",
  created_at: "2026-01-01T00:00:00Z",
};

export function renderApp(path: string, options: { authenticated?: boolean } = {}) {
  const session = new SessionStore();
  if (options.authenticated) session.setAuthenticated("token", testUser);
  else session.clear();

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

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <ServicesProvider services={{ session, auth }}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
  return { ...utils, auth, session, router };
}
