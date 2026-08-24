import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentManagerLayout from "../components/ContentManagerLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import SessionWorkspace, { type SubmissionSummary } from "../components/SessionWorkspace";
import { loadContentManagerAccount, type ContentManagerAccount } from "../data/contentManager";
import {
  findSessionInPackage,
  getContentPackage,
  toPreviewSessionContent,
  type PreviewLocation,
} from "../data/contentPackages";
import type { CodeFile } from "../data/practiceExecution";

/**
 * Content Manager Preview — renders the REAL Student Session Workspace UI
 * (SessionWorkspace.tsx, shared verbatim with SessionPage.tsx), sourced from
 * a Draft package instead of sessionContent.ts. Nothing here writes to
 * student progress, performance, or exercise submissions — see the no-op /
 * in-memory callbacks below.
 */
export default function ContentPreviewSession() {
  const navigate = useNavigate();
  const { packageId = "", courseId = "", subjectId = "", sessionId = "" } = useParams<{
    packageId: string;
    courseId: string;
    subjectId: string;
    sessionId: string;
  }>();

  const [account, setAccount] = useState<ContentManagerAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [location, setLocation] = useState<PreviewLocation | null | undefined>(undefined);

  const attemptCounter = useRef(0);

  useEffect(() => {
    const acct = loadContentManagerAccount();
    if (!acct) {
      navigate("/content/login", { replace: true });
      return;
    }
    setAccount(acct);

    const pkg = getContentPackage(packageId);
    // A draft is the only status that can ever be previewed — an invalid
    // package has no usable content attached (see contentPackages.ts).
    if (!pkg || pkg.status !== "draft") {
      setLocation(null);
    } else {
      setLocation(findSessionInPackage(pkg, courseId, subjectId, sessionId));
    }
    attemptCounter.current = 0;
    setChecked(true);
  }, [packageId, courseId, subjectId, sessionId, navigate]);

  if (!checked || !account) return null;

  if (!location || !location.session.content) {
    return (
      <ContentManagerLayout managerName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">This session can&apos;t be previewed.</p>
          <p className="mt-1.5 text-sm text-navy-500/60">
            The package may be invalid, or this course/subject/session no longer exists in it.
          </p>
          <Button type="button" className="!w-auto mt-4" onClick={() => navigate("/content/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </ContentManagerLayout>
    );
  }

  const { course, subject, session, sessionNumber, totalSessions, nextSessionId } = location;
  const draftContent = session.content;
  if (!draftContent) return null; // already guarded above; narrows the type for TS below
  const content = toPreviewSessionContent(draftContent);

  // Preview is read-only with respect to student records — these callbacks
  // never touch progress.tsx, performance.ts, or exerciseSubmissions.ts.
  function handleCompleteSession() {
    // Intentionally a no-op: SessionWorkspace still shows the completion
    // screen locally (so the Content Manager can verify it), but nothing is
    // persisted anywhere.
  }

  function handleSubmitExercise(files: CodeFile[], language: string): SubmissionSummary {
    void files;
    void language;
    attemptCounter.current += 1;
    return {
      id: `preview-${Date.now()}-${attemptCounter.current}`,
      attemptNumber: attemptCounter.current,
      submittedAt: new Date().toISOString(),
    };
  }

  return (
    <ContentManagerLayout managerName={account.name}>
      {/* Full-bleed sticky banner: cancels the shell's own top/side padding so it sits flush under the topbar. */}
      <div className="sticky top-16 z-20 -mx-4 -mt-8 border-b border-error/20 bg-error/10 px-4 py-2.5 text-center sm:-mx-8 sm:-mt-10 sm:px-8">
        <p className="text-sm font-semibold text-error">CONTENT PREVIEW &middot; DRAFT &mdash; NOT PUBLISHED</p>
      </div>

      {/* No max-width here — matches the real Student Session route (SessionPage.tsx), which never constrains SessionWorkspace's width either. */}
      <div className="mt-8 sm:mt-10">
        <BackLink to={`/content/package/${packageId}`} label="Back to Sessions" />

        <div className="mt-4">
          <SessionWorkspace
            mode="preview"
            sessionId={session.id}
            content={content}
            video={draftContent.video}
            courseTitle={course.title}
            subjectTitle={subject.title}
            sessionTitle={session.title}
            sessionDescription={session.description}
            sessionNumber={sessionNumber}
            totalSessions={totalSessions}
            progress={0}
            nextSessionId={nextSessionId}
            greetingName={account.name.split(" ")[0] ?? "there"}
            initialSubmissions={[]}
            onCompleteSession={handleCompleteSession}
            onSubmitExercise={handleSubmitExercise}
            backHref={`/content/package/${packageId}`}
            backLabel="Back to Sessions"
            getNextSessionHref={(nextId) => `/content/preview/${packageId}/${courseId}/${subjectId}/${nextId}`}
            exitHref={`/content/package/${packageId}`}
            exitLabel="Back to Sessions"
          />
        </div>
      </div>
    </ContentManagerLayout>
  );
}
