// ---------------------------------------------------------------------------
// Backend adapter for real Student Exercise submissions — AI Exercise
// Evaluation Slice 1. Replaces exerciseSubmissions.ts's localStorage
// persistence as the source of truth for SessionPage.tsx / SessionWorkspace.
//
// The client sends only `files` — studentId (JWT), sessionId (route),
// contentVersionId (the session's currently-published ContentVersion), and
// attemptNumber (server-computed) are never accepted from here; see
// server/src/submissions/. This file has no fallback/local persistence of
// its own: a failed submit is a real error the caller must surface, not a
// silently-degraded local write (unlike this codebase's read-only fail-soft
// convention — a submission that only "succeeded" in the browser would be a
// permanently invisible loss to the backend evaluator this is built for).
//
// AUTHENTICATION: this app has exactly one authenticated-request mechanism
// (see ../data/apiClient.ts / ../data/auth.ts) — an httpOnly `access_token`
// cookie the backend sets on login and reads on every guarded route
// (server/src/common/guards/jwt-auth.guard.ts). apiGet()/apiPost() below
// send it automatically via `credentials: "include"`; nothing in this file
// (or anywhere in the frontend) ever reads, stores, or attaches the token
// itself — it is httpOnly specifically so client-side JS *cannot* read it.
// There is deliberately no "Authorization: Bearer <token>" header anywhere
// in this codebase: the backend guard only ever checks the cookie, so a
// hand-built header would either be silently ignored (harmless but useless)
// or would require exposing the JWT to readable storage first — which is
// exactly the client-readable/writable session model Phase 0 moved away
// from (see the guard's own doc comment). If a submission 401s with
// "No access token," the fix is never to add a header here — it means the
// browser has no live session at all (never logged in this tab, logged out,
// or the 15-minute access token already expired with nothing having
// refreshed it) — the same as any other authenticated call in this app.
// ---------------------------------------------------------------------------

import { apiGet, apiPost } from "./apiClient";
import type { CodeFile } from "./practiceExecution";

/**
 * `evaluation` is additive (AI Evaluation Reliability slice) — the backend
 * now always includes it, since evaluation runs in a background worker
 * rather than synchronously during submit(): a submission starts out
 * PENDING and moves through EVALUATING to EVALUATED/FAILED independently of
 * the HTTP response that created it. Optional here (not yet rendered
 * anywhere — no UI change in this slice) so this type stays accurate
 * without forcing every existing caller to handle it.
 */
export type SubmissionSummary = {
  id: string;
  attemptNumber: number;
  submittedAt: string;
  evaluation?: { status: "PENDING" | "EVALUATING" | "EVALUATED" | "FAILED"; overallScore: number | null } | null;
};

export async function submitExercise(sessionId: string, files: CodeFile[]): Promise<SubmissionSummary> {
  return apiPost<SubmissionSummary>(`/sessions/${sessionId}/exercise/submissions`, { files });
}

export async function fetchSubmissionsForSession(sessionId: string): Promise<SubmissionSummary[]> {
  return apiGet<SubmissionSummary[]>(`/sessions/${sessionId}/exercise/submissions`);
}
