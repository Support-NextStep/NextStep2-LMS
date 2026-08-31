// ---------------------------------------------------------------------------
// Exercise submission storage — LEGACY, READ-ONLY.
//
// AI Exercise Evaluation Slice 1 replaced the real submission read/write
// path with a real, backend-persisted one (see ../data/exerciseSubmissionsApi.ts,
// used by SessionPage.tsx / SessionWorkspace.tsx). Nothing writes to this
// file's localStorage key anymore — getAllSubmissions() below now only ever
// returns whatever was written before that migration (or nothing, in a
// fresh browser).
//
// The one remaining caller is AdminStudentDetail.tsx, which is itself still
// built entirely around mock.ts's single hardcoded STUDENT (see
// adminStudents.ts's own header — there is no real multi-student roster in
// this backend yet), so it has no real per-user id to query the new backend
// submissions endpoint with. Migrating that page is out of Slice 1's scope;
// this file stays only to keep it compiling until that page is migrated to
// a real multi-student backend.
// ---------------------------------------------------------------------------

export type ExerciseFile = { name: string; content: string };

export type ExerciseSubmission = {
  id: string;
  studentId: string;
  sessionId: string;
  exerciseId: string;
  language: string;
  files: ExerciseFile[];
  submittedAt: string;
  attemptNumber: number;
};

const STORAGE_KEY = "nextstep2:exerciseSubmissions";

function loadAll(): ExerciseSubmission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExerciseSubmission[]) : [];
  } catch {
    return [];
  }
}

/** Every submission across every session, most recent first — read-only aggregate for Admin's student overview. See file header: this is frozen, legacy data. */
export function getAllSubmissions(): ExerciseSubmission[] {
  return loadAll().sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}
