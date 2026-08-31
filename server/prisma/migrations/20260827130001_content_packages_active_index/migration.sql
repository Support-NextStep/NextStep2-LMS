-- Split out of 20260827130000_content_authoring_backend solely because
-- Postgres refuses to use a freshly-added enum value (READY_FOR_REVIEW)
-- inside the same transaction that added it. This migration runs after
-- that ADD VALUE has committed, so referencing it here is safe.
--
-- Mirrors the existing "one live Publication per session" constraint —
-- prevents two authors/tabs from creating two concurrently in-progress
-- packages (DRAFT/READY_FOR_REVIEW/CHANGES_REQUESTED) for the same session.
-- A session may still accumulate multiple APPROVED/PUBLISHED packages over
-- time (each an "Author New Version" cycle) — this only constrains
-- *active, unfinished* authoring for one session to a single package.
CREATE UNIQUE INDEX "content_packages_one_active_per_session" ON "content_packages"("session_id")
  WHERE "status" IN ('DRAFT', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED');
