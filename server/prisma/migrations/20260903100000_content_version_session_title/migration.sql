-- Day 5 follow-up (Issue 1): the author-edited Session Title/Description
-- were being captured into ContentPackage.draftContent and then silently
-- dropped at submit time — never reaching ContentVersion, so publish() had
-- no authoritative value to propagate to Session.title/description. Safe
-- single-step addition: NOT NULL with a default backfills every existing
-- row to '' in the same statement, matching the earlier explanation-column
-- migration's own pattern. No existing row's real behavior changes from
-- this migration alone — propagation only happens on the next publish().
ALTER TABLE "content_versions" ADD COLUMN "session_title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "content_versions" ADD COLUMN "session_description" TEXT NOT NULL DEFAULT '';
