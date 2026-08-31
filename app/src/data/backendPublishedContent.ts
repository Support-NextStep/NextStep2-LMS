// ---------------------------------------------------------------------------
// Canonical published-content read path — Phase 0.
//
// Resolves a session's currently-published content from the real backend
// (see NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 4/5),
// which itself resolves ONLY via `publications WHERE superseded_at IS NULL`
// joined to the one content_version it points at — never package status,
// never a recency sort, never anything a client could select.
//
// getSessionContent() (sessionContent.ts) needs to stay synchronous — it's
// called directly during render (SessionPage.tsx). So this module is a
// thin cache in front of the endpoint: SessionPage.tsx triggers a fetch
// once per session id via ensureBackendPublishedContentFetched() (from a
// useEffect), and getSessionContent() reads whatever is currently cached,
// synchronously, on every call — undefined (not fetched yet) and null
// (fetched, nothing published) both fall through to this app's existing
// curated/generated fallback chain exactly the same way.
//
// This is IN ADDITION TO, not a replacement for, the existing localStorage-
// based published-content path (getPublishedSessionContent() in
// publishedContent.ts) — that function still serves whatever a Content
// Author/Reviewer publishes through the still-entirely-local authoring/
// review workflow, which Phase 0 explicitly does not touch (see the
// implementation report). Precedence, applied in getSessionContent():
// backend-published > locally-authored-and-published > curated > generated.
// ---------------------------------------------------------------------------
import { apiGet } from "./apiClient";
import type { SessionContent } from "./sessionContent";

const cache = new Map<string, SessionContent | null>();
const inFlight = new Map<string, Promise<void>>();

/** Synchronous. undefined = never fetched yet; null = fetched, nothing currently published; otherwise the resolved content. */
export function getCachedBackendPublishedContent(sessionId: string): SessionContent | null | undefined {
  return cache.get(sessionId);
}

/**
 * Triggers (at most once per session id) a fetch for that session's
 * currently-published content. Call from a `useEffect`;
 * getCachedBackendPublishedContent() picks up the result on the component's
 * next render once it resolves. Never throws — a 404 (nothing published)
 * and a network failure (backend unreachable) are both treated as "no
 * override," not an error.
 */
export function ensureBackendPublishedContentFetched(sessionId: string): Promise<void> {
  if (cache.has(sessionId)) return Promise.resolve();
  const existing = inFlight.get(sessionId);
  if (existing) return existing;

  const promise = apiGet<SessionContent>(`/sessions/${sessionId}/content`)
    .then((content) => {
      cache.set(sessionId, content);
    })
    .catch(() => {
      cache.set(sessionId, null);
    })
    .finally(() => {
      inFlight.delete(sessionId);
    });

  inFlight.set(sessionId, promise);
  return promise;
}
