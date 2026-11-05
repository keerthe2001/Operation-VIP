import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { AppShell } from "@/components/AppShell";
import { GuestOnly, RequireAuth } from "@/features/auth/guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HomePage } from "@/features/home/HomePage";

// Larger pages load on demand so the first screen stays small.
const lazyPage = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => async () => ({
  Component: (await load())[name],
});

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/profile", lazy: lazyPage(() => import("@/features/profile/ProfilePage"), "ProfilePage") },
          { path: "/resumes", lazy: lazyPage(() => import("@/features/resumes/ResumesPage"), "ResumesPage") },
          { path: "/answers", lazy: lazyPage(() => import("@/features/answers/AnswersPage"), "AnswersPage") },
          { path: "/applications", lazy: lazyPage(() => import("@/features/applications/ApplicationsPage"), "ApplicationsPage") },
          {
            path: "/extension/connect",
            lazy: lazyPage(() => import("@/features/extension/ConnectExtensionPage"), "ConnectExtensionPage"),
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export const createRouter = () => createBrowserRouter(routes);
