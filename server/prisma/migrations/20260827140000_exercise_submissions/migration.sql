-- Slice 1 of AI Exercise Evaluation: real, backend-persisted Exercise
-- submissions. Purely additive (new table only) — no existing table is
-- altered, so no nullable-then-backfill-then-NOT-NULL dance is needed here.

CREATE TABLE "exercise_submissions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "content_version_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exercise_submissions_student_id_session_id_attempt_number_key" ON "exercise_submissions"("student_id", "session_id", "attempt_number");

CREATE INDEX "exercise_submissions_student_id_session_id_idx" ON "exercise_submissions"("student_id", "session_id");

CREATE INDEX "exercise_submissions_content_version_id_idx" ON "exercise_submissions"("content_version_id");

ALTER TABLE "exercise_submissions" ADD CONSTRAINT "exercise_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_submissions" ADD CONSTRAINT "exercise_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_submissions" ADD CONSTRAINT "exercise_submissions_content_version_id_fkey" FOREIGN KEY ("content_version_id") REFERENCES "content_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
