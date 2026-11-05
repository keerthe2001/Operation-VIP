// Generated types live in ./schema.ts — regenerate with `pnpm api-types` from the repo root.
import type { components } from "./schema";

export type { components, paths } from "./schema";

type Schemas = components["schemas"];

export type UserRead = Schemas["UserRead"];
export type TokenResponse = Schemas["TokenResponse"];
export type LoginRequest = Schemas["LoginRequest"];
export type RegisterRequest = Schemas["RegisterRequest"];

/** Shape of every error body returned by the API (see backend `app/core/errors.py`). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
