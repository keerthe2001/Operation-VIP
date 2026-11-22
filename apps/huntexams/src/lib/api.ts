// Thin fetch wrapper. Cookies carry the session (HttpOnly), and every write sends the
// X-HX-Client header the API requires as CSRF protection.

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "error", public field?: string) {
    super(message);
  }
}

const TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
})();

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        "X-HX-Client": "web",
        "X-Timezone": TZ,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach HuntExams. Check your connection and try again.", "network");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const d = (data as { detail?: { message?: string; code?: string; field?: string } | string } | null)?.detail;
    if (typeof d === "object" && d) throw new ApiError(res.status, d.message ?? "Something went wrong.", d.code, d.field);
    throw new ApiError(res.status, res.status >= 500 ? "Something went wrong on our side. Try again." : "Request failed.");
  }
  return data as T;
}
