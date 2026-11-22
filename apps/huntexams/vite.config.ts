/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5174,
    // Same-origin API in development so the HttpOnly session cookie just works.
    proxy: { "/api": { target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8010" } },
  },
  preview: {
    port: 4174,
    proxy: { "/api": { target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8010" } },
  },
  test: { environment: "jsdom", globals: true },
});
