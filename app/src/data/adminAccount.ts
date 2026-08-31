// ---------------------------------------------------------------------------
// Admin account.
//
// Phase 0: backed by real authentication against the backend (see
// NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 11) —
// previously a prototype-only mock: any email/password created a local
// account with no verification of any kind (see
// NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's cross-cutting
// finding). The session now lives entirely in httpOnly cookies the backend
// manages; this file never stores anything itself — every function here is
// a thin, role-scoped wrapper over ../data/auth.ts.
// ---------------------------------------------------------------------------
import { fetchCurrentUser, loginRequest, logoutRequest, type AuthUser } from "./auth";

export type AdminAccount = { name: string; email: string };

function toAdminAccount(user: AuthUser): AdminAccount | null {
  return user.role === "ADMIN" ? { name: user.name, email: user.email } : null;
}

/** Fresh check against the backend session on every call — null if not logged in, logged in as a different role, or the backend is unreachable. */
export async function loadAdminAccount(): Promise<AdminAccount | null> {
  const user = await fetchCurrentUser();
  return user ? toAdminAccount(user) : null;
}

/** Real credential verification. Throws (see ../data/apiClient.ts's ApiError) on invalid credentials or an unreachable backend — the login page must catch this and show a real error now that login can genuinely fail. */
export async function loginAdminAccount(email: string, password: string): Promise<AdminAccount> {
  const user = await loginRequest(email, password);
  const account = toAdminAccount(user);
  if (!account) throw new Error("This account is not an Admin account.");
  return account;
}

export async function clearAdminAccount(): Promise<void> {
  await logoutRequest();
}
