-- Slice 3 (Server-Side Session Activity Progress): backend-authoritative
-- evidence that a student completed Learning, Video Check, or Practice for
-- a session. Purely additive (new enum + new table only) — no existing
-- table is altered.

CREATE TYPE "activity_type" AS ENUM ('LEARNING', 'VIDEO_CHECK', 'PRACTICE');

CREATE TABLE "student_activity_progress" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "activity_type" "activity_type" NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_activity_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_activity_progress_student_id_session_id_activity_type_key" ON "student_activity_progress"("student_id", "session_id", "activity_type");

CREATE INDEX "student_activity_progress_student_id_session_id_idx" ON "student_activity_progress"("student_id", "session_id");

ALTER TABLE "student_activity_progress" ADD CONSTRAINT "student_activity_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_activity_progress" ADD CONSTRAINT "student_activity_progress_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
