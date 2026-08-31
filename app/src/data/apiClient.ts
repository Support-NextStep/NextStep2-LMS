// ---------------------------------------------------------------------------
// Thin fetch wrapper for the Phase 0 backend (NestJS + Prisma + PostgreSQL —
// see NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md).
//
// Every request is sent with credentials:"include" so the browser attaches
// the httpOnly access/refresh cookies the backend sets — this file never
// reads, stores, or otherwise touches those cookies itself; that is the
// entire point of httpOnly (see the architecture doc's Part 11).
//
// This file does NOT decide what "the backend is unreachable" means for any
// particular feature — it just reports failures as a typed ApiError. Each
// caller (auth adapters, the course catalog, published-content resolution)
// decides how to degrade, matching this codebase's existing convention of
// every localStorage read failing soft to a sensible default.
// ---------------------------------------------------------------------------

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = res.statusText || `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    } catch {
      // No JSON body to read a message from — keep the statusText fallback.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}
