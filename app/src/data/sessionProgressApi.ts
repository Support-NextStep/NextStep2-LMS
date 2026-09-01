// ---------------------------------------------------------------------------
// Student Session Completion Persistence slice — the backend-authoritative
// replacement for progress.tsx's previous localStorage-only
// completedSessionIds. Same "studentId/role always come from the JWT cookie,
// never the client" contract as exerciseSubmissionsApi.ts: neither call here
// ever sends a studentId, a completed flag, or a score — the server derives
// everything itself (see server/src/progress/progress.service.ts).
// ---------------------------------------------------------------------------

import { apiGet, apiPost } from "./apiClient";

export type SessionProgressEntry = {
  sessionId: string;
  completedAt: string;
};

/** Every session the authenticated student has completed — the frontend rebuilds its whole completed-sessions set from this on load, refresh, logout/login, or a new browser/device. Never derived from localStorage. */
export async function fetchMyProgress(): Promise<SessionProgressEntry[]> {
  return apiGet<SessionProgressEntry[]>("/progress");
}

/**
 * Marks one session complete for the authenticated student. Idempotent — a
 * duplicate/retried call is safe and returns the original completedAt
 * unchanged. Can reject (e.g. the session requires an Exercise submission
 * the student hasn't made) — callers must not treat a rejected request as a
 * completion.
 */
export async function completeSessionOnBackend(sessionId: string): Promise<SessionProgressEntry> {
  return apiPost<SessionProgressEntry>(`/sessions/${sessionId}/progress/complete`);
}
