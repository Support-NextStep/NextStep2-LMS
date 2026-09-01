// ---------------------------------------------------------------------------
// Server-Side Session Activity Progress slice — backend-authoritative
// evidence that a student completed Learning, Video Check, or Practice for
// a session (Exercise keeps its own existing source of truth,
// ExerciseSubmission — see exerciseSubmissionsApi.ts; nothing here ever
// covers "exercise"). Same "studentId always comes from the JWT cookie,
// never the client" contract as every other data/*Api.ts file: neither call
// here ever sends a studentId or a completed flag — the server derives the
// student itself (see server/src/activity-progress/activity-progress.service.ts).
// ---------------------------------------------------------------------------

import { apiGet, apiPost } from "./apiClient";

/** The three activities this module tracks — deliberately excludes "exercise". */
export type TrackedActivityKey = "learning" | "videoCheck" | "practice";

export type ActivityProgressEntry = {
  activityType: TrackedActivityKey;
  completedAt: string;
};

/** Every activity the authenticated student has completed in this session — fetched once on session load to restore Learning/Video Check/Practice's "done" state after a refresh, logout/login, or a new browser/device. Never derived from localStorage. */
export async function fetchActivityProgress(sessionId: string): Promise<ActivityProgressEntry[]> {
  return apiGet<ActivityProgressEntry[]>(`/sessions/${sessionId}/activity-progress`);
}

/**
 * Marks one activity complete for the authenticated student in this
 * session. Idempotent — a duplicate/retried call is safe and returns the
 * original completedAt unchanged. `answeredCheckpointIds` is only read for
 * activityType="videoCheck" (the set of checkpoint ids the student
 * answered — right or wrong, a wrong answer still counts); the backend
 * rejects the call if any checkpoint the session's published content marks
 * required is missing from that set. Ignored for "learning"/"practice",
 * which have no server-checkable payload — see this module's own file
 * header for why.
 */
export async function completeActivity(
  sessionId: string,
  activityType: TrackedActivityKey,
  payload?: { answeredCheckpointIds?: string[] }
): Promise<ActivityProgressEntry> {
  return apiPost<ActivityProgressEntry>(`/sessions/${sessionId}/activity-progress/${activityType}/complete`, payload ?? {});
}
