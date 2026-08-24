// ---------------------------------------------------------------------------
// Company data model.
//
// Entirely separate from the student domain (progress.tsx / portfolio.ts /
// performance.ts). A company account and its profile are their own concepts
// and must never be merged into student state or the ProgressProvider.
//
// Only a handful of Company Flow pages consume this, so — mirroring the
// portfolio.ts precedent — this is kept as plain load/save functions +
// local component state, not a second global Context provider.
// ---------------------------------------------------------------------------

export type VerificationStatus = "unverified" | "verified";

export type CompanyAccount = {
  id: string;
  companyName: string;
  workEmail: string;
  contactPerson: string;
  phone: string;
  website?: string;
  verificationStatus: VerificationStatus;
};

export function generateCompanyId(): string {
  return `company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type CompanyProfile = {
  companyName: string;
  logo: string; // data URL or empty string — no upload backend in this prototype
  description: string;
  industry: string;
  website: string;
  location: string;
  contactPerson: string;
  contactEmail: string;
  phone: string;
};

const ACCOUNT_KEY = "nextstep2:companyAccount";
const PROFILE_KEY = "nextstep2:companyProfile";

export function loadCompanyAccount(): CompanyAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanyAccount;
    // Backfill an id for accounts created before ids existed (Slice 1 sessions).
    if (!parsed.id) {
      parsed.id = generateCompanyId();
      saveCompanyAccount(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCompanyAccount(account: CompanyAccount) {
  try {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    // Ignore write failures (e.g. private browsing) — the mock session just won't persist.
  }
}

export function markCompanyVerified() {
  const account = loadCompanyAccount();
  if (!account) return;
  saveCompanyAccount({ ...account, verificationStatus: "verified" });
}

export function loadCompanyProfile(): CompanyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CompanyProfile;
  } catch {
    return null;
  }
}

export function saveCompanyProfile(profile: CompanyProfile) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore write failures.
  }
}
