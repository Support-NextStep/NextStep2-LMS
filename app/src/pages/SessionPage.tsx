import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StudentLayout from "../components/StudentLayout";
import SessionWorkspace, { type SubmissionSummary } from "../components/SessionWorkspace";
import { defaultFileName, type CodeFile } from "../data/practiceExecution";
import { fetchEvaluationForSubmission, fetchSubmissionsForSession, submitExercise } from "../data/exerciseSubmissionsApi";
import { completeActivity, fetchActivityProgress, type TrackedActivityKey } from "../data/activityProgressApi";
import { COURSE } from "../data/mock";
import { useCourseData } from "../data/progress";
import { getSessionContent } from "../data/sessionContent";
import { ensureBackendPublishedContentFetched } from "../data/backendPublishedContent";
import type { SessionActivitiesInput } from "../data/performance";

/**
 * The real Student Session route. This file only resolves *where the
 * content and side effects come from* for a real student — the actual
 * Learn/Video Check/Practice/AI Help/Exercise UI lives in
 * SessionWorkspace.tsx, shared with the Content Manager's Draft Preview
 * (ContentPreviewSession.tsx). Nothing about the rendered UI is duplicated
 * between the two.
 */
export default function SessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();

  // Phase 0: triggers the canonical backend published-content resolution
  // for this session id (see ../data/backendPublishedContent.ts) and
  // re-renders once it resolves so getSessionContent() below picks up the
  // now-cached result. getSessionContent() itself stays fully synchronous;
  // before this resolves (or if the backend is unreachable) it just falls
  // through to the existing local-package/curated/generated fallback chain,
  // exactly as it always has.
  const [, forceRerenderAfterContentFetch] = useState(0);
  useEffect(() => {
    let cancelled = false;
    ensureBackendPublishedContentFetched(sessionId).then(() => {
      if (!cancelled) forceRerenderAfterContentFetch((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // AI Exercise Evaluation Slice 1: this student's real, backend-persisted
  // submission history for this session (see ../data/exerciseSubmissionsApi.ts)
  // — replaces the old synchronous localStorage read. Reset to [] immediately
  // on session change so a slow fetch never leaks the previous session's
  // submissions into this one; SessionWorkspace re-syncs its own local
  // `submissions` state whenever this array's reference changes.
  const [initialSubmissions, setInitialSubmissions] = useState<SubmissionSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    setInitialSubmissions([]);
    fetchSubmissionsForSession(sessionId)
      .then((subs) => {
        if (!cancelled) setInitialSubmissions(subs);
      })
      .catch(() => {
        // Fail soft to "no history shown yet" — the student can still
        // submit; a transient failure to *list* past attempts shouldn't
        // block the workspace from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Server-Side Session Activity Progress slice: this student's real,
  // backend-persisted Learning/Video Check/Practice completion for this
  // session (see ../data/activityProgressApi.ts) — same "reset to [] on
  // session change, fail soft on error" pattern as initialSubmissions above.
  // SessionWorkspace re-syncs its own local `persistedActivities` state
  // whenever this array's reference changes.
  const [initialActivityProgress, setInitialActivityProgress] = useState<TrackedActivityKey[]>([]);
  useEffect(() => {
    let cancelled = false;
    setInitialActivityProgress([]);
    fetchActivityProgress(sessionId)
      .then((rows) => {
        if (!cancelled) setInitialActivityProgress(rows.map((r) => r.activityType));
      })
      .catch(() => {
        // Fail soft — the student can still complete activities in this
        // visit; a transient failure to *list* prior completions shouldn't
        // block the workspace from rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const { getSessionContext, completeSession, recordSessionPerformance, currentUser } = useCourseData();
  const context = getSessionContext(sessionId);
  const content = getSessionContent(sessionId, {
    title: context?.session.title ?? "Session",
    description: context?.session.description ?? "",
  });

  if (!context) {
    return (
      <StudentLayout>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 py-16 text-center">
          <h1 className="text-xl font-semibold text-navy-500">Session not found</h1>
          <Link to="/my-course" className="text-sm font-semibold text-brand-500 hover:text-brand-600">
            Back to My Course
          </Link>
        </div>
      </StudentLayout>
    );
  }

  const { subject, session, sessionNumber, totalSessions, progress, nextSession } = context;
  // Real Student Identity slice — the authenticated user's real first name
  // (GET /auth/me), never mock.ts's hardcoded STUDENT. Blank while loading
  // or logged out; SessionWorkspace's "Nice progress, {greetingName}!" reads
  // fine either way (see its own completion-screen copy).
  const firstName = currentUser?.name.split(" ")[0] ?? "";

  // completeSession() now calls the real backend and only resolves once the
  // completion is durably recorded server-side — awaited here so a
  // rejection (network failure, or the backend's own validation) propagates
  // up to SessionWorkspace's handleCompleteSession instead of silently
  // succeeding. recordSessionPerformance (the separate, still-local score
  // display) only runs once that backend completion is confirmed, so it
  // never shows a "completed" performance record for a session the backend
  // didn't actually accept.
  async function handleCompleteSession(activities: SessionActivitiesInput) {
    await completeSession(sessionId);
    recordSessionPerformance(sessionId, subject.id, activities);
  }

  // The backend derives studentId (from the JWT) and validates
  // activityType/session — this only ever sends what's actually needed
  // (nothing, or the answered checkpoint ids for videoCheck). See
  // ../data/activityProgressApi.ts and SessionWorkspace's own doc comment
  // on why a failure here is swallowed rather than shown to the student.
  async function handleCompleteActivity(activityType: TrackedActivityKey, payload?: { answeredCheckpointIds?: string[] }) {
    await completeActivity(sessionId, activityType, payload);
  }

  // The backend derives studentId (from the authenticated session), the
  // published ContentVersion to pin against, and the attempt number — this
  // only ever sends the code itself. See ../data/exerciseSubmissionsApi.ts.
  async function handleSubmitExercise(files: CodeFile[], language: string): Promise<SubmissionSummary> {
    const submitted =
      files.length > 0 ? files : content.exercise.starterCode ? [{ name: defaultFileName(language), content: content.exercise.starterCode }] : [];
    return submitExercise(sessionId, submitted);
  }

  return (
    <StudentLayout>
      <SessionWorkspace
        mode="student"
        sessionId={sessionId}
        content={content}
        courseTitle={COURSE.title}
        subjectTitle={subject.title}
        sessionTitle={session.title}
        sessionDescription={session.description}
        sessionNumber={sessionNumber}
        totalSessions={totalSessions}
        progress={progress}
        nextSessionId={nextSession?.id}
        greetingName={firstName}
        initialSubmissions={initialSubmissions}
        initialActivityProgress={initialActivityProgress}
        onCompleteSession={handleCompleteSession}
        onCompleteActivity={handleCompleteActivity}
        onSubmitExercise={handleSubmitExercise}
        onFetchEvaluation={(submissionId) => fetchEvaluationForSubmission(sessionId, submissionId)}
        backHref={`/my-course/subject/${subject.id}`}
        backLabel="Back to Subject"
        getNextSessionHref={(nextId) => `/session/${nextId}`}
        exitHref="/my-course"
        exitLabel="Back to My Course"
      />
    </StudentLayout>
  );
}
