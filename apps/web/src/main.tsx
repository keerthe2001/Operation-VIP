import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { createServices, ServicesProvider } from "@/lib/services";
import { createRouter } from "@/router";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", media.matches);
applyTheme();
media.addEventListener("change", applyTheme);

const services = createServices();
void services.auth.restore();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={createRouter()} />
      </QueryClientProvider>
    </ServicesProvider>
  </StrictMode>,
);
