// ---------------------------------------------------------------------------
// Exercise submission storage.
//
// Deliberately isolated from progress.tsx (completedSessionIds), performance.ts
// (SessionPerformanceRecord), and portfolio.ts — a submission is "what code
// did the student turn in", not completion status or a score. No evaluator
// exists yet, so nothing here computes correctness or a score; that's a
// later slice (see the file header note in matching's sibling docs for the
// intended future pipeline: Submission -> Automated Evaluation -> Score).
//
// Persisted via localStorage under its own key, following the same
// load/save-function convention as portfolio.ts/company.ts/hiring.ts. When a
// real backend exists, only this file's load/save functions need to change.
//
// studentId: this prototype has no multi-student auth system (see
// candidates.ts for the same caveat elsewhere) — STUDENT.name from mock.ts
// is used as a placeholder identity until real auth exists.
// ---------------------------------------------------------------------------

export type ExerciseFile = { name: string; content: string };

export type ExerciseSubmission = {
  id: string;
  studentId: string;
  sessionId: string;
  /** One exercise per session today, so this mirrors sessionId — kept as its
   *  own field so a session with multiple exercises can be supported later
   *  without changing this shape. */
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

function saveAll(list: ExerciseSubmission[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore write failures (e.g. private browsing) — the submission just won't persist.
  }
}

/** All submissions for one session's exercise, oldest attempt first. */
export function getSubmissionsForSession(sessionId: string): ExerciseSubmission[] {
  return loadAll()
    .filter((s) => s.sessionId === sessionId)
    .sort((a, b) => a.attemptNumber - b.attemptNumber);
}

function generateId(): string {
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Records a new attempt. Never overwrites a previous submission — each call
 * appends a new record with the next attempt number for this session.
 */
export function createSubmission(
  studentId: string,
  sessionId: string,
  exerciseId: string,
  language: string,
  files: ExerciseFile[]
): ExerciseSubmission {
  const existing = getSubmissionsForSession(sessionId);
  const attemptNumber = existing.length + 1;

  const submission: ExerciseSubmission = {
    id: generateId(),
    studentId,
    sessionId,
    exerciseId,
    language,
    files,
    submittedAt: new Date().toISOString(),
    attemptNumber,
  };

  const all = loadAll();
  all.push(submission);
  saveAll(all);
  return submission;
}
