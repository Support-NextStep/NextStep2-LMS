// ---------------------------------------------------------------------------
// Backend adapter for the real "Need Help?" / AI Learning Assistant — AI
// Tutor Day 3. Replaces SessionWorkspace.tsx's previous hardcoded canned
// reply as the source of the AI's response; this file has no fallback/local
// answer of its own, matching exerciseSubmissionsApi.ts's own convention —
// a failed ask() is a real error the caller must surface (see
// SessionWorkspace's sendChat), never a silently-invented reply.
//
// AUTHENTICATION: same httpOnly access_token cookie as every other real
// backend call in this app (see apiClient.ts) — nothing here reads, stores,
// or attaches the token itself. The backend derives the student's identity
// from that cookie, never from anything sent in this request; this file
// never sends a studentId.
// ---------------------------------------------------------------------------

import { apiPost } from "./apiClient";

export type TutorAnswer = { answer: string };

/** One question/action -> one answer. No conversation history is sent or persisted (see AiTutorService's own doc comment on why AI Help stays transient) — each call is independent, exactly matching the existing UI's one-question-at-a-time chat widget. */
export async function askAiTutor(sessionId: string, message: string): Promise<TutorAnswer> {
  return apiPost<TutorAnswer>(`/sessions/${sessionId}/ai-tutor/ask`, { message });
}
