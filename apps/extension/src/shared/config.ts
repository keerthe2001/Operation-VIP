// Injected at build time (see scripts/build.mjs). No secrets ever live here.
declare const __API_URL__: string;
declare const __WEB_URL__: string;

export const API_URL: string = typeof __API_URL__ === "string" ? __API_URL__ : "http://localhost:8000";
export const WEB_URL: string = typeof __WEB_URL__ === "string" ? __WEB_URL__ : "http://localhost:5173";
