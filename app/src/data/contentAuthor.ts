// ---------------------------------------------------------------------------
// Content Author account.
//
// Phase 0: backed by real authentication against the backend (see
// NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 11) —
// previously a prototype-only mock (see git history / the frontend/backend
// data contract audit). The session now lives entirely in httpOnly cookies
// the backend manages; this file never stores anything itself — every
// function here is a thin, role-scoped wrapper over ../data/auth.ts.
//
// There is still no endpoint anywhere that lets a client create a Content
// Author account — that role is provisioned out-of-band (server/prisma/seed.ts)
// for Phase 0, exactly matching the security rule "never trust a
// client-supplied role."
// ---------------------------------------------------------------------------
import { fetchCurrentUser, loginRequest, logoutRequest, type AuthUser } from "./auth";

export type ContentAuthorAccount = { name: string; email: string };

function toContentAuthorAccount(user: AuthUser): ContentAuthorAccount | null {
  return user.role === "CONTENT_AUTHOR" ? { name: user.name, email: user.email } : null;
}

/** Fresh check against the backend session on every call — null if not logged in, logged in as a different role, or the backend is unreachable. */
export async function loadContentAuthorAccount(): Promise<ContentAuthorAccount | null> {
  const user = await fetchCurrentUser();
  return user ? toContentAuthorAccount(user) : null;
}

/** Real credential verification. Throws on invalid credentials or an unreachable backend — the login page must catch this and show a real error now that login can genuinely fail. */
export async function loginContentAuthorAccount(email: string, password: string): Promise<ContentAuthorAccount> {
  const user = await loginRequest(email, password);
  const account = toContentAuthorAccount(user);
  if (!account) throw new Error("This account is not a Content Author account.");
  return account;
}

export async function clearContentAuthorAccount(): Promise<void> {
  await logoutRequest();
}
