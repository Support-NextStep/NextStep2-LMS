-- Discovered while wiring the real submit-time ContentVersion writer:
-- SessionContent.explanation is a real, rendered student-facing field
-- (SessionWorkspace.tsx) that the Phase 0 schema never had a column for at
-- all — a silent data-loss gap for any session authored with explanation
-- text, closed here now that a real write path exists. Safe single-step
-- addition: NOT NULL with a default backfills every existing row to "" in
-- the same statement, no separate backfill needed.
ALTER TABLE "content_versions" ADD COLUMN "explanation" TEXT NOT NULL DEFAULT '';
