import type { AuthManager } from "@/background/auth";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Authenticated fetch against the backend with one retry after a token refresh. */
export function createApi(apiUrl: string, auth: AuthManager, fetchFn: typeof fetch = (...a) => fetch(...a)) {
  return async function api(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string | null) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      try {
        return await fetchFn(`${apiUrl}${path}`, { ...init, headers });
      } catch {
        throw new ApiError("Can't reach the server.", 0, "NETWORK_ERROR");
      }
    };
    let token = await auth.getAccessToken();
    if (!token) throw new ApiError("You're signed out.", 401, "NOT_AUTHENTICATED");
    let response = await send(token);
    if (response.status === 401) {
      token = await auth.refresh();
      if (!token) throw new ApiError("Your session expired. Sign in again.", 401, "INVALID_TOKEN");
      response = await send(token);
    }
    return response;
  };
}

export type Api = ReturnType<typeof createApi>;
