import { createBrowserRouter, Navigate, type RouteObject } from "react-router";

import { AppShell } from "@/components/AppShell";
import { GuestOnly, RequireAuth } from "@/features/auth/guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { HomePage } from "@/features/home/HomePage";

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
    children: [{ element: <AppShell />, children: [{ path: "/", element: <HomePage /> }] }],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export const createRouter = () => createBrowserRouter(routes);
