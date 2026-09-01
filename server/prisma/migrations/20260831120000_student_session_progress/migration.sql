-- Student Session Completion Persistence slice: the first backend-owned
-- record of "this student completed this session," replacing the
-- frontend's previous localStorage-only completedSessionIds. Purely
-- additive (new table only) — no existing table is altered.

CREATE TABLE "student_session_progress" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_session_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_session_progress_student_id_session_id_key" ON "student_session_progress"("student_id", "session_id");

CREATE INDEX "student_session_progress_student_id_idx" ON "student_session_progress"("student_id");

ALTER TABLE "student_session_progress" ADD CONSTRAINT "student_session_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_session_progress" ADD CONSTRAINT "student_session_progress_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
