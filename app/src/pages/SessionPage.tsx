import { Link, useParams } from "react-router-dom";
import StudentLayout from "../components/StudentLayout";
import SessionWorkspace, { type SubmissionSummary } from "../components/SessionWorkspace";
import { defaultFileName, type CodeFile } from "../data/practiceExecution";
import { createSubmission, getSubmissionsForSession } from "../data/exerciseSubmissions";
import { COURSE, STUDENT } from "../data/mock";
import { useCourseData } from "../data/progress";
import { getSessionContent } from "../data/sessionContent";
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
  const { getSessionContext, completeSession, recordSessionPerformance } = useCourseData();
  const context = getSessionContext(sessionId);
  const content = getSessionContent(sessionId, {
    title: context?.session.title ?? "Session",
    description: context?.session.description ?? "",
  }, COURSE.id, context?.subject.id);

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
  const firstName = STUDENT.name.split(" ")[0];

  function handleCompleteSession(activities: SessionActivitiesInput) {
    completeSession(sessionId);
    recordSessionPerformance(sessionId, subject.id, activities);
  }

  function handleSubmitExercise(files: CodeFile[], language: string): SubmissionSummary {
    const submitted =
      files.length > 0 ? files : content.exercise.starterCode ? [{ name: defaultFileName(language), content: content.exercise.starterCode }] : [];
    return createSubmission(STUDENT.name, sessionId, sessionId, language, submitted);
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
        initialSubmissions={getSubmissionsForSession(sessionId)}
        onCompleteSession={handleCompleteSession}
        onSubmitExercise={handleSubmitExercise}
        backHref={`/my-course/subject/${subject.id}`}
        backLabel="Back to Subject"
        getNextSessionHref={(nextId) => `/session/${nextId}`}
        exitHref="/my-course"
        exitLabel="Back to My Course"
      />
    </StudentLayout>
  );
}
