-- AI Exercise Evaluation Slice 2.0: database foundation only. Purely
-- additive (new enum + new table) — no existing table is altered, so no
-- nullable-then-backfill-then-NOT-NULL dance is needed here, and all
-- existing data is untouched.

-- CreateEnum
CREATE TYPE "evaluation_status" AS ENUM ('PENDING', 'EVALUATING', 'EVALUATED', 'FAILED');

-- CreateTable
CREATE TABLE "exercise_evaluations" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "status" "evaluation_status" NOT NULL DEFAULT 'PENDING',
    "overall_score" INTEGER,
    "criteria_results" JSONB,
    "strengths" TEXT[],
    "improvements" TEXT[],
    "feedback" TEXT,
    "failure_reason" TEXT,
    "provider_name" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluated_at" TIMESTAMP(3),

    CONSTRAINT "exercise_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exercise_evaluations_submission_id_key" ON "exercise_evaluations"("submission_id");

CREATE INDEX "exercise_evaluations_status_idx" ON "exercise_evaluations"("status");

ALTER TABLE "exercise_evaluations" ADD CONSTRAINT "exercise_evaluations_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "exercise_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
