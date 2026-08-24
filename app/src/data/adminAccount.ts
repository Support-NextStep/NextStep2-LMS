// ---------------------------------------------------------------------------
// Admin account.
//
// Entirely separate from the Student, Company, and Content Manager domains —
// isolated the same way contentManager.ts is isolated: its own localStorage
// key, its own type, no shared state with ProgressProvider or any other
// role's account storage.
//
// This is a prototype-only mock auth (no real backend, no password
// hashing/verification) — first login on a fresh browser just creates the
// account. Matches the existing project's established pattern for auth-less
// internal-role login (see contentManager.ts).
// ---------------------------------------------------------------------------

export type AdminAccount = {
  name: string;
  email: string;
};

const ACCOUNT_KEY = "nextstep2:adminAccount";

export function loadAdminAccount(): AdminAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminAccount;
  } catch {
    return null;
  }
}

export function saveAdminAccount(account: AdminAccount) {
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Ignore write failures (e.g. private browsing) — the mock session just won't persist.
  }
}

export function clearAdminAccount() {
  try {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Ignore.
  }
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function deriveAdminName(email: string): string {
  return nameFromEmail(email) || "Admin";
}
