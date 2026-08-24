// ---------------------------------------------------------------------------
// Content Manager account.
//
// Entirely separate from the Student and Company domains — a Content
// Manager is an internal NextStep² role, not a student or a company. Kept
// isolated the same way company.ts is isolated from student data: its own
// localStorage key, its own type, no shared state with ProgressProvider or
// the company data files.
//
// This is a prototype-only mock auth (no real backend, no password
// hashing/verification) — first login on a fresh browser just creates the
// account. Matches the existing project's established pattern for auth-less
// internal-role login where a real multi-user backend doesn't exist yet.
// ---------------------------------------------------------------------------

export type ContentManagerAccount = {
  name: string;
  email: string;
};

const ACCOUNT_KEY = "nextstep2:contentManagerAccount";

export function loadContentManagerAccount(): ContentManagerAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ContentManagerAccount;
  } catch {
    return null;
  }
}

export function saveContentManagerAccount(account: ContentManagerAccount) {
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Ignore write failures (e.g. private browsing) — the mock session just won't persist.
  }
}

export function clearContentManagerAccount() {
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

export function deriveContentManagerName(email: string): string {
  return nameFromEmail(email) || "Content Manager";
}
