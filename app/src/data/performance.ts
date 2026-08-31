// ---------------------------------------------------------------------------
// Performance foundation.
//
// This file turns what already happens in the Session Workspace into a
// trustworthy performance record — nothing here invents new activities or
// scoring rules. It only distinguishes two things that already exist in the
// Session flow but were being blended together:
//
//   COMPLETION — did the student finish the required activity?
//   PERFORMANCE — how well did they do, where a measurable result exists?
//
// Of the four tracked session activities:
//   - Learning   → completion only (watching a video has no "score")
//   - Video Check → has a real result (the student's answer is right or wrong)
//   - Practice   → completion only. Self-Check (the only thing that ever
//                  produced a pass/fail count) was retired from the active
//                  product contract — see
//                  NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's
//                  cleanup pass — so Practice can never contribute a score.
//   - Exercise   → completion only (no checker exists for it yet)
// AI Help is intentionally absent — it is not a scored activity.
//
// This is also the SINGLE source of truth for session scoring — both the
// on-screen Complete-screen percentage (SessionWorkspace.tsx) and the
// persisted SessionPerformanceRecord call calculateSessionScore() below with
// the same activities object, so the two numbers can never disagree.
//
// Session/Subject/Course performance are pure functions over these records,
// so the eventual Performance page can call them directly without touching
// how they're stored.
// ---------------------------------------------------------------------------

export type SessionActivitiesInput = {
  learning: { completed: boolean };
  videoCheck: { completed: boolean; correct: boolean | null };
  practice: { completed: boolean };
  exercise: { completed: boolean };
};

export type SessionPerformanceRecord = {
  sessionId: string;
  subjectId: string;
  completedAt: string;
  activities: SessionActivitiesInput;
  /** 0-100, or null when no activity in this session produced a measurable result. */
  score: number | null;
};

export type SubjectPerformance = {
  subjectId: string;
  sessionsCompleted: number;
  /** How many of those sessions actually contributed a score. */
  scoredSessionCount: number;
  /** 0-100, or null when nothing scoreable has been completed yet. */
  averageScore: number | null;
};

export type CoursePerformance = {
  sessionsCompleted: number;
  scoredSessionCount: number;
  averageScore: number | null;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Session performance score — derived ONLY from activities that have a real
 * result. Today that's Video Check correctness alone: Learning and Exercise
 * are completion-only, and Practice no longer produces any result at all
 * (Self-Check was retired — see the file header). Returns null if nothing
 * scoreable was completed, rather than fabricating a number. Kept as an
 * averaged `scores[]` (not a single `if`) so a future scoreable activity is
 * an additive change here, not a reshape.
 */
export function calculateSessionScore(activities: SessionActivitiesInput): number | null {
  const scores: number[] = [];

  if (activities.videoCheck.completed && activities.videoCheck.correct !== null) {
    scores.push(activities.videoCheck.correct ? 100 : 0);
  }

  return average(scores);
}

export function buildSessionPerformanceRecord(
  sessionId: string,
  subjectId: string,
  activities: SessionActivitiesInput
): SessionPerformanceRecord {
  return {
    sessionId,
    subjectId,
    completedAt: new Date().toISOString(),
    activities,
    score: calculateSessionScore(activities),
  };
}

/** Aggregates whatever session performance records exist for one subject. */
export function calculateSubjectPerformance(
  records: SessionPerformanceRecord[],
  subjectId: string
): SubjectPerformance {
  const subjectRecords = records.filter((r) => r.subjectId === subjectId);
  const scores = subjectRecords.map((r) => r.score).filter((s): s is number => s !== null);

  return {
    subjectId,
    sessionsCompleted: subjectRecords.length,
    scoredSessionCount: scores.length,
    averageScore: average(scores),
  };
}

/** Aggregates every session performance record across the whole course. */
export function calculateCoursePerformance(records: SessionPerformanceRecord[]): CoursePerformance {
  const scores = records.map((r) => r.score).filter((s): s is number => s !== null);

  return {
    sessionsCompleted: records.length,
    scoredSessionCount: scores.length,
    averageScore: average(scores),
  };
}
