-- AI Evaluation Reliability slice: turns ExerciseEvaluation into a small
-- PostgreSQL-backed job queue entry (retry bookkeeping only). Purely
-- additive — new nullable/defaulted columns and one new index, no existing
-- column altered, no data touched.

-- AlterTable
ALTER TABLE "exercise_evaluations" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exercise_evaluations" ADD COLUMN "next_attempt_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "exercise_evaluations_status_next_attempt_at_idx" ON "exercise_evaluations"("status", "next_attempt_at");
