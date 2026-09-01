import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getCourseProgress,
  getCurrentSessionContext,
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
import { completeSessionOnBackend, fetchMyProgress } from "./sessionProgressApi";
import { fetchCurrentUser, type AuthUser } from "./auth";

// ---------------------------------------------------------------------------
// Student Session Completion Persistence slice.
//
// completedSessionIds is now backend-authoritative: it is fetched from
// GET /progress on load (see the effect below) and updated only after
// POST /sessions/:id/progress/complete succeeds — never written to or read
// from localStorage. This is what makes completion survive a refresh,
// logout/login, cleared browser storage, and a different browser/device (it
// was previously localStorage-only — see NEXTSTEP2 progress-persistence
// diagnosis). getDefaultCompletedSessionIds() (mock.ts) is deliberately no
// longer used here: showing a fabricated "you've already completed these"
// baseline would misrepresent what the backend actually knows about this
// student the moment a real source of truth exists.
//
// performanceRecords/recordSessionPerformance are UNCHANGED and remain
// localStorage-only — that's the Performance page's separate score/activity-
// breakdown display, explicitly out of scope for this slice (it never
// determines whether a session counts as complete, and doesn't store
// anything completion-security-relevant). See PERFORMANCE_RECORDS_KEY below.
//
// Real Student Identity slice: PERFORMANCE_RECORDS_KEY used to be one single,
// fixed localStorage key shared by literally anyone using the same browser —
// not scoped by student at all. Two different real accounts logging in on
// the same machine would silently read and overwrite each other's
// performance history. Now scoped by the authenticated user's real database
// id (see currentUser below) — still prototype/localStorage-only (unchanged
// scope), just no longer a cross-student collision.
// ---------------------------------------------------------------------------

function performanceRecordsKey(studentId: string): string {
  return `nextstep2:performanceRecords:${studentId}`;
}

function loadPerformanceRecords(studentId: string): Record<string, SessionPerformanceRecord> {
  // No baseline seed here on purpose: the seeded baseline-complete sessions
  // (formerly getDefaultCompletedSessionIds) were never actually played
  // through the workspace, so there's no real activity data to report a
  // score for.
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(performanceRecordsKey(studentId));
    return raw ? (JSON.parse(raw) as Record<string, SessionPerformanceRecord>) : {};
  } catch {
    return {};
  }
}

function savePerformanceRecords(studentId: string, records: Record<string, SessionPerformanceRecord>) {
  try {
    window.localStorage.setItem(performanceRecordsKey(studentId), JSON.stringify(records));
  } catch {
    // Ignore write failures (e.g. private browsing) — this is a local-only
    // display cache, not the authoritative completion record.
  }
}

type ProgressContextValue = {
  completedSessionIds: Set<string>;
  /**
   * Calls the backend and only resolves once it confirms the session is
   * recorded complete — rejects (never silently succeeds) if the backend is
   * unreachable or rejects the completion (e.g. a required Exercise
   * submission is missing). Callers must not update any "completed" UI
   * state until this resolves.
   */
  completeSession: (sessionId: string) => Promise<void>;
  performanceRecords: Record<string, SessionPerformanceRecord>;
  recordSessionPerformance: (sessionId: string, subjectId: string, activities: SessionActivitiesInput) => void;
  /**
   * Real Student Identity slice — the authenticated user, fetched once from
   * GET /auth/me (the same endpoint every other role's `useRequireXAccount`
   * hook already uses), never from mock.ts's hardcoded STUDENT constant.
   * `undefined` means "not resolved yet" (the initial render, before the
   * fetch below settles); `null` means the fetch resolved but found no
   * session. Every student page that needs to display "who is logged in"
   * (name in the header, a greeting, portfolio ownership) should read this
   * instead of importing STUDENT — see StudentLayout.tsx/Dashboard.tsx/
   * SessionPage.tsx/Portfolio.tsx for the call sites this replaced.
   */
  currentUser: AuthUser | null | undefined;
};

const ProgressContext = createContext<ProgressContextValue | undefined>(undefined);

export function ProgressProvider({ children }: { children: ReactNode }) {
  // Starts empty — filled in from the backend below, never assumed. A
  // logged-out/unauthenticated render (there isn't really one on student
  // routes, but defensively) simply shows 0% until the fetch resolves.
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(new Set());
  const [performanceRecords, setPerformanceRecords] = useState<Record<string, SessionPerformanceRecord>>({});
  // undefined = not resolved yet, null = resolved but logged out. Never
  // defaults to a fabricated identity (no "Jordan Smith" fallback) — see the
  // ProgressContextValue doc comment above.
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(undefined);
  // Only used to force one re-render once the real catalog loads (Phase 0) —
  // never read anywhere itself. mock.ts's refreshCourseCatalogFromBackend()
  // mutates COURSE/SUBJECTS_BASE/SUBJECT_SESSIONS in place, so every
  // consumer of useCourseData() picks up the change automatically the
  // moment this provider (and therefore useCourseData()'s memo, whose other
  // deps are freshly-created on every render regardless) re-renders — see
  // NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 5/15.
  const [, forceRerenderAfterCatalogLoad] = useState(0);

  // Real Student Identity slice: the same GET /auth/me every other role
  // already calls via its own useRequireXAccount hook. Runs once on mount,
  // same "cancelled" guard convention as every other fetch in this provider.
  // Once this resolves with a real id, the effect below loads THIS
  // student's own performance records (never before, so a fast render can
  // never briefly show a previous account's cached scores on a shared
  // machine).
  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser().then((user) => {
      if (!cancelled) setCurrentUser(user);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentUser) setPerformanceRecords(loadPerformanceRecords(currentUser.id));
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    refreshCourseCatalogFromBackend().then((changed) => {
      if (!cancelled && changed) forceRerenderAfterCatalogLoad((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The real, backend-authoritative fetch of this student's completed
  // sessions — replaces the old synchronous localStorage read. Runs once on
  // mount (i.e. once per login/app load), which is exactly what makes
  // completion show up correctly after a refresh, a logout/login, cleared
  // localStorage, or opening the same account in a different browser: none
  // of those change what this fetch returns.
  useEffect(() => {
    let cancelled = false;
    fetchMyProgress()
      .then((rows) => {
        if (!cancelled) setCompletedSessionIds(new Set(rows.map((r) => r.sessionId)));
      })
      .catch(() => {
        // Fail soft to "nothing known yet" — same convention as every other
        // backend read in this app (e.g. refreshCourseCatalogFromBackend).
        // The student can still use the app; progress display just won't be
        // accurate until this succeeds (a reload retries it).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Calls the backend and waits for a real success response before this
  // student's local completedSessionIds ever gains the session id — a
  // failed/rejected request throws here and is never reflected as
  // completed. See SessionWorkspace.tsx's handleCompleteSession for how the
  // UI surfaces a rejection instead of falsely showing "complete."
  async function completeSession(sessionId: string): Promise<void> {
    await completeSessionOnBackend(sessionId);
    setCompletedSessionIds((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
  }

  // Keyed by sessionId, so completing (or revisiting/re-completing) the same
  // session always overwrites its one record instead of accumulating
  // duplicates. Unchanged by this slice — still localStorage-only score
  // display, called only after completeSession() above has already
  // succeeded (see SessionPage.tsx).
  function recordSessionPerformance(sessionId: string, subjectId: string, activities: SessionActivitiesInput) {
    if (!currentUser) return; // no authenticated student to scope this save to yet — see loadPerformanceRecords/savePerformanceRecords above.
    const studentId = currentUser.id;
    setPerformanceRecords((prev) => {
      const next = { ...prev, [sessionId]: buildSessionPerformanceRecord(sessionId, subjectId, activities) };
      savePerformanceRecords(studentId, next);
      return next;
    });
  }

  return (
    <ProgressContext.Provider
      value={{ completedSessionIds, completeSession, performanceRecords, recordSessionPerformance, currentUser }}
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
 * consistently from the same source. Course/subject aggregate progress
 * (getSubjects/getCourseProgress below) remains client-side math over the
 * raw completed-session-id list — no course-progress engine exists
 * server-side, and none is introduced by this slice.
 */
export function useCourseData() {
  const { completedSessionIds, completeSession, performanceRecords, recordSessionPerformance, currentUser } =
    useProgress();

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
      // The real authenticated student (see ProgressContextValue's doc
      // comment) — undefined while GET /auth/me is still in flight, null if
      // genuinely logged out. Never mock.ts's hardcoded STUDENT.
      currentUser,
    };
  }, [completedSessionIds, completeSession, performanceRecords, recordSessionPerformance, currentUser]);
}
