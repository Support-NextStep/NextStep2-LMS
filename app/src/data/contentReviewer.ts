// ---------------------------------------------------------------------------
// Content Reviewer account.
//
// Phase 0: backed by real authentication against the backend (see
// NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 11) —
// previously a prototype-only mock, isolated from Content Author's own mock
// the same way it's isolated here: its own login/session boundary, now
// backed by a real, different `role` value on the same `users` table rather
// than a different localStorage key. This file never stores anything
// itself — every function here is a thin, role-scoped wrapper over
// ../data/auth.ts.
// ---------------------------------------------------------------------------
import { fetchCurrentUser, loginRequest, logoutRequest, type AuthUser } from "./auth";

export type ContentReviewerAccount = { name: string; email: string };

function toContentReviewerAccount(user: AuthUser): ContentReviewerAccount | null {
  return user.role === "CONTENT_REVIEWER" ? { name: user.name, email: user.email } : null;
}

/** Fresh check against the backend session on every call — null if not logged in, logged in as a different role, or the backend is unreachable. */
export async function loadContentReviewerAccount(): Promise<ContentReviewerAccount | null> {
  const user = await fetchCurrentUser();
  return user ? toContentReviewerAccount(user) : null;
}

/** Real credential verification. Throws on invalid credentials or an unreachable backend — the login page must catch this and show a real error now that login can genuinely fail. */
export async function loginContentReviewerAccount(email: string, password: string): Promise<ContentReviewerAccount> {
  const user = await loginRequest(email, password);
  const account = toContentReviewerAccount(user);
  if (!account) throw new Error("This account is not a Content Reviewer account.");
  return account;
}

export async function clearContentReviewerAccount(): Promise<void> {
  await logoutRequest();
}
