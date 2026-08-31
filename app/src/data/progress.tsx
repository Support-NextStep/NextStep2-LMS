import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getCourseProgress,
  getCurrentSessionContext,
  getDefaultCompletedSessionIds,
  getSessionContext,
  getSubjectDetail,
  getSubjects,
  refreshCourseCatalogFromBackend,
  type Subject,
  type SubjectDetail,
} from "./mock";
import {
  buildSessionPerformanceRecord,
  calculateCoursePerformance,
  calculateSubjectPerformance,
  type SessionActivitiesInput,
  type SessionPerformanceRecord,
} from "./performance";

const COMPLETED_SESSIONS_KEY = "nextstep2:completedSessionIds";
const PERFORMANCE_RECORDS_KEY = "nextstep2:performanceRecords";

function loadCompletedSessionIds(): Set<string> {
  if (typeof window === "undefined") return new Set(getDefaultCompletedSessionIds());
  try {
    const raw = window.localStorage.getItem(COMPLETED_SESSIONS_KEY);
    // No saved progress yet (first visit) — seed with the course's baseline
    // demo state rather than starting everyone at a blank 0%.
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set(getDefaultCompletedSessionIds());
  } catch {
    return new Set(getDefaultCompletedSessionIds());
  }
}

function saveCompletedSessionIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(COMPLETED_SESSIONS_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore write failures (e.g. private browsing) — progress just won't persist.
  }
}

function loadPerformanceRecords(): Record<string, SessionPerformanceRecord> {
  // No baseline seed here on purpose: the seeded baseline-complete sessions
  // (see getDefaultCompletedSessionIds) were never actually played through
  // the workspace, so there's no real activity data to report a score for.
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PERFORMANCE_RECORDS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SessionPerformanceRecord>) : {};
  } catch {
    return {};
  }
}

function savePerformanceRecords(records: Record<string, SessionPerformanceRecord>) {
  try {
    window.localStorage.setItem(PERFORMANCE_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Ignore write failures (e.g. private browsing) — progress just won't persist.
  }
}

type ProgressContextValue = {
  completedSessionIds: Set<string>;
  completeSession: (sessionId: string) => void;
  performanceRecords: Record<string, SessionPerformanceRecord>;
  recordSessionPerformance: (sessionId: string, subjectId: string, activities: SessionActivitiesInput) => void;
};

const ProgressContext = createContext<ProgressContextValue | undefined>(undefined);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(loadCompletedSessionIds);
  const [performanceRecords, setPerformanceRecords] =
    useState<Record<string, SessionPerformanceRecord>>(loadPerformanceRecords);
  // Only used to force one re-render once the real catalog loads (Phase 0) —
  // never read anywhere itself. mock.ts's refreshCourseCatalogFromBackend()
  // mutates COURSE/SUBJECTS_BASE/SUBJECT_SESSIONS in place, so every
  // consumer of useCourseData() picks up the change automatically the
  // moment this provider (and therefore useCourseData()'s memo, whose other
  // deps are freshly-created on every render regardless) re-renders — see
  // NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 5/15.
  const [, forceRerenderAfterCatalogLoad] = useState(0);

  useEffect(() => {
    let cancelled = false;
    refreshCourseCatalogFromBackend().then((changed) => {
      if (!cancelled && changed) forceRerenderAfterCatalogLoad((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function completeSession(sessionId: string) {
    setCompletedSessionIds((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      saveCompletedSessionIds(next);
      return next;
    });
  }

  // Keyed by sessionId, so completing (or revisiting/re-completing) the same
  // session always overwrites its one record instead of accumulating duplicates.
  function recordSessionPerformance(sessionId: string, subjectId: string, activities: SessionActivitiesInput) {
    setPerformanceRecords((prev) => {
      const next = { ...prev, [sessionId]: buildSessionPerformanceRecord(sessionId, subjectId, activities) };
      savePerformanceRecords(next);
      return next;
    });
  }

  return (
    <ProgressContext.Provider
      value={{ completedSessionIds, completeSession, performanceRecords, recordSessionPerformance }}
    >
      {children}
    </ProgressContext.Provider>
  );
}

function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within a ProgressProvider");
  return ctx;
}

/**
 * The single entry point pages use to read course/subject/session progress
 * and performance, and to mark a session complete. Wraps the pure functions
 * in mock.ts/performance.ts with the live state so every screen recomputes
 * consistently from the same source.
 */
export function useCourseData() {
  const { completedSessionIds, completeSession, performanceRecords, recordSessionPerformance } = useProgress();

  return useMemo(() => {
    const records = Object.values(performanceRecords);
    return {
      subjects: getSubjects(completedSessionIds),
      courseProgress: getCourseProgress(completedSessionIds),
      currentSession: getCurrentSessionContext(completedSessionIds),
      getSubjectDetail: (subject: Subject): SubjectDetail => getSubjectDetail(subject, completedSessionIds),
      getSessionContext: (sessionId: string) => getSessionContext(sessionId, completedSessionIds),
      completeSession,
      performanceRecords: records,
      recordSessionPerformance,
      getSubjectPerformance: (subjectId: string) => calculateSubjectPerformance(records, subjectId),
      getCoursePerformance: () => calculateCoursePerformance(records),
    };
  }, [completedSessionIds, completeSession, performanceRecords, recordSessionPerformance]);
}
