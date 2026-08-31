// ---------------------------------------------------------------------------
// Shared real-authentication client — Phase 0.
//
// Replaces the old per-role "localStorage key present = logged in" mock
// pattern (adminAccount.ts / contentAuthor.ts / contentReviewer.ts previously
// each reimplemented this identically). The actual session now lives
// entirely in httpOnly cookies the backend sets on /auth/login|register and
// clears on /auth/logout — nothing in this file, or anywhere in the
// frontend, ever reads or writes a token or account object directly.
// See NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 11.
// ---------------------------------------------------------------------------
import { apiGet, apiPost } from "./apiClient";

export type BackendRole = "STUDENT" | "ADMIN" | "CONTENT_AUTHOR" | "CONTENT_REVIEWER";

export type AuthUser = { id: string; email: string; name: string; role: BackendRole };

/** Throws (ApiError) on invalid credentials or an unreachable backend — every caller must catch this and show a real error, since login can now genuinely fail. */
export function loginRequest(email: string, password: string): Promise<AuthUser> {
  return apiPost<AuthUser>("/auth/login", { email, password });
}

/** Student self-registration only — the backend never accepts a role from this call (see server/src/auth/auth.service.ts). Also establishes a session, exactly like login. */
export function registerRequest(email: string, password: string, name: string): Promise<AuthUser> {
  return apiPost<AuthUser>("/auth/register", { email, password, name });
}

/** Best-effort — clearing the server-side refresh token is a courtesy; if the backend is unreachable the caller should still treat the user as logged out locally (the cookies will simply expire). */
export async function logoutRequest(): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } catch {
    // Intentionally swallowed — see the doc comment above.
  }
}

/** The current session's user, or null if not logged in / the backend is unreachable. Never throws — every `useRequireXAccount` hook depends on this failing soft to "not logged in" rather than crashing a render. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiGet<AuthUser | null>("/auth/me");
  } catch {
    return null;
  }
}

/**
 * Student login specifically. Unlike Admin/Content Author/Content Reviewer,
 * Student has no dedicated `data/studentAccount.ts` adapter/route-guard
 * pair — Phase 0 deliberately does not add a new access gate to the
 * previously entirely-ungated Student routes (see Login.tsx's own comment),
 * so there is nothing else that would need one. This one function is enough
 * to make the login page itself real, and to reject a non-student account
 * typing its credentials into the student login form.
 */
export async function loginStudentAccount(email: string, password: string): Promise<AuthUser> {
  const user = await loginRequest(email, password);
  if (user.role !== "STUDENT") throw new Error("This account is not a Student account.");
  return user;
}
