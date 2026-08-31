-- Content-authoring-backend phase: ContentPackage becomes the real,
-- authoritative authoring envelope (session ownership + mutable draft +
-- current-version pointer), and ContentReview becomes the append-only
-- record of every reviewer decision. Hand-authored (not `prisma migrate
-- dev`-generated) because this environment is non-interactive and, more
-- importantly, because the safe column-addition sequence below (nullable
-- -> backfill -> NOT NULL) is exactly the kind of migration Prisma's own
-- interactive flow refuses to write for you automatically when a table
-- already has rows — see the decision this migration implements.

-- AlterEnum
-- Postgres requires ADD VALUE to commit before the new value can be used in
-- a DML statement in the same session; nothing below writes a
-- 'READY_FOR_REVIEW' row, so that restriction doesn't bite here.
ALTER TYPE "package_status" ADD VALUE 'READY_FOR_REVIEW';

-- CreateEnum
CREATE TYPE "content_review_action" AS ENUM ('CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED');

-- AlterTable: content_packages — add session_id SAFELY (nullable first).
-- There is exactly one existing row today (the Phase 0 seed's
-- "HTML Forms (seed)" package) and it has exactly one ContentVersion, whose
-- session_id is what gets backfilled into it below — see the UPDATE.
ALTER TABLE "content_packages" ADD COLUMN "session_id" TEXT;
ALTER TABLE "content_packages" ADD COLUMN "draft_content" JSONB;
ALTER TABLE "content_packages" ADD COLUMN "current_content_version_id" TEXT;
ALTER TABLE "content_packages" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: every existing ContentPackage's session_id comes from its own
-- ContentVersion(s) — a package's versions always share one session_id by
-- construction, so DISTINCT ON (package_id) picks any one of them safely.
-- A package with zero ContentVersions (a draft that was never submitted)
-- would be left NULL here and would fail the NOT NULL step below on
-- purpose — no such row exists in this dataset (verified directly against
-- the running database before writing this migration), but if one ever
-- did, this migration is meant to fail loudly rather than guess.
UPDATE "content_packages" cp
SET "session_id" = sub."session_id"
FROM (
  SELECT DISTINCT ON ("package_id") "package_id", "session_id"
  FROM "content_versions"
) sub
WHERE sub."package_id" = cp."id"
  AND cp."session_id" IS NULL;

-- Now safe to enforce NOT NULL.
ALTER TABLE "content_packages" ALTER COLUMN "session_id" SET NOT NULL;

-- AddForeignKey / AddUniqueConstraint for the new content_packages columns
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "content_packages_current_content_version_id_key" ON "content_packages"("current_content_version_id");
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_current_content_version_id_fkey" FOREIGN KEY ("current_content_version_id") REFERENCES "content_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "content_packages_session_id_idx" ON "content_packages"("session_id");

-- The partial unique index guarding "at most one active package per
-- session" (DRAFT/READY_FOR_REVIEW/CHANGES_REQUESTED) is deliberately NOT
-- here — it references the enum value added above, and Postgres refuses to
-- use a freshly-added enum value inside the same transaction that added it
-- ("unsafe use of new value" / SQLSTATE 55P04). It's in the next migration
-- (20260827130001_content_packages_active_index), which runs after this
-- one's ADD VALUE has actually committed.

-- CreateTable: content_reviews (append-only — no UPDATE/DELETE is ever
-- issued against this table by the application).
CREATE TABLE "content_reviews" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "content_version_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "action" "content_review_action" NOT NULL,
    "checklist" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_reviews_package_id_idx" ON "content_reviews"("package_id");
CREATE INDEX "content_reviews_content_version_id_idx" ON "content_reviews"("content_version_id");

ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "content_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
