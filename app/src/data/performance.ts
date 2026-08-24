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
//   - Practice   → has a real result (the mock checklist's pass/fail count)
//   - Exercise   → completion only (no checker exists for it yet)
// AI Help is intentionally absent — it is not a scored activity.
//
// Session/Subject/Course performance are pure functions over these records,
// so the eventual Performance page can call them directly without touching
// how they're stored.
// ---------------------------------------------------------------------------

export type SessionActivitiesInput = {
  learning: { completed: boolean };
  videoCheck: { completed: boolean; correct: boolean | null };
  practice: { completed: boolean; passedCount: number; totalCount: number };
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
 * result (Video Check correctness, Practice checklist pass rate). Learning
 * and Exercise are completion-only and never factor into the score. Returns
 * null if nothing scoreable was completed, rather than fabricating a number.
 */
export function calculateSessionScore(activities: SessionActivitiesInput): number | null {
  const scores: number[] = [];

  if (activities.videoCheck.completed && activities.videoCheck.correct !== null) {
    scores.push(activities.videoCheck.correct ? 100 : 0);
  }

  if (activities.practice.completed && activities.practice.totalCount > 0) {
    scores.push(Math.round((activities.practice.passedCount / activities.practice.totalCount) * 100));
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
