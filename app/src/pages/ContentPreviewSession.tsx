import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import ContentReviewerLayout from "../components/ContentReviewerLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import SessionWorkspace, { type SubmissionSummary } from "../components/SessionWorkspace";
import { loadContentAuthorAccount, type ContentAuthorAccount } from "../data/contentAuthor";
import { loadContentReviewerAccount, type ContentReviewerAccount } from "../data/contentReviewer";
import { getPackageDetail, type PackageDetail } from "../data/authoredSessionApi";
import { buildContentSessionContent, type AuthoredSessionDraft } from "../data/authoredSession";
import { toPreviewSessionContent } from "../data/contentPackages";
import type { CodeFile } from "../data/practiceExecution";

/**
 * "Preview as a student would see it" — shared, not duplicated, between the
 * Content Author workspace (/content/preview/...) and the Content Reviewer
 * workspace (/review/preview/...). Renders the REAL Student Session
 * Workspace UI (SessionWorkspace.tsx, shared verbatim with SessionPage.tsx),
 * sourced from a package record instead of sessionContent.ts. Nothing here
 * writes to student progress, performance, or exercise submissions — see the
 * no-op / in-memory callbacks below.
 */
export default function ContentPreviewSession({ role }: { role: "author" | "reviewer" }) {
  const navigate = useNavigate();
  const { packageId = "", courseId = "", subjectId = "" } = useParams<{
    packageId: string;
    courseId: string;
    subjectId: string;
    sessionId: string;
  }>();

  const [account, setAccount] = useState<ContentAuthorAccount | ContentReviewerAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [pkg, setPkg] = useState<PackageDetail | null | undefined>(undefined);

  const attemptCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // loadContentAuthorAccount()/loadContentReviewerAccount() are now real
    // backend calls (Phase 0) — see ../data/contentAuthor.ts / contentReviewer.ts.
    (async () => {
      const acct = role === "reviewer" ? await loadContentReviewerAccount() : await loadContentAuthorAccount();
      if (cancelled) return;
      if (!acct) {
        navigate(role === "reviewer" ? "/review/login" : "/content/login", { replace: true });
        return;
      }
      setAccount(acct);

      // Both the Content Author (their own in-progress draft) and the
      // Content Reviewer (content at any stage of review) need this: a
      // Content Reviewer specifically must be able to preview submitted
      // content exactly as a student would see it, not only while it's
      // still awaiting review — so no status here is treated specially,
      // matching the old "any status with usable content" behavior.
      try {
        const detail = await getPackageDetail(packageId);
        if (!cancelled) setPkg(detail);
      } catch {
        if (!cancelled) setPkg(null);
      }
      attemptCounter.current = 0;
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId, navigate, role]);

  const backTo = role === "reviewer" ? `/review/package/${packageId}` : `/content/submissions/${packageId}`;
  const backLabel = "Back to Sessions";

  function renderInLayout(children: ReactNode) {
    if (!account) return null;
    return role === "reviewer" ? (
      <ContentReviewerLayout reviewerName={account.name}>{children}</ContentReviewerLayout>
    ) : (
      <ContentAuthorLayout authorName={account.name}>{children}</ContentAuthorLayout>
    );
  }

  if (!checked || !account) return null;

  const draft = pkg?.draftContent as AuthoredSessionDraft | null | undefined;
  // A freshly-created package's draftContent starts as a genuinely empty
  // `{}` (see PackagesService.createPackage()) — before the author has ever
  // clicked Save Draft, there's nothing real to preview yet. `draft.learning`
  // is only ever absent in exactly that case (every real save writes the
  // whole draft object at once — see saveDraft() in authoredSessionApi.ts),
  // so its presence is what actually distinguishes "nothing authored yet"
  // from a normal, previewable draft.
  const hasContent = Boolean(draft?.learning);

  if (!pkg || !draft || !hasContent) {
    return renderInLayout(
      <div className="mx-auto max-w-2xl py-8 text-center">
        <p className="font-medium text-navy-500">This session can&apos;t be previewed.</p>
        <p className="mt-1.5 text-sm text-navy-500/60">The package may no longer exist, or has no authored content yet.</p>
        <Button type="button" className="!w-auto mt-4" onClick={() => navigate(backTo)}>
          {backLabel}
        </Button>
      </div>
    );
  }

  // An authored package always has exactly one course/subject/session (see
  // authoredSession.ts) — there is never a "next session" or a real
  // multi-session count to reflect here, matching what this page always
  // effectively showed even before this backend migration.
  const courseTitle = draft.courseTitle;
  const subjectTitle = draft.subjectTitle;
  const sessionTitle = draft.sessionTitle;
  const sessionDescription = draft.sessionDescription;
  const sessionNumber = 1;
  const totalSessions = 1;
  const nextSessionId: string | undefined = undefined;
  const content = toPreviewSessionContent(buildContentSessionContent(draft));

  // Preview is read-only with respect to student records — these callbacks
  // never touch progress.tsx, performance.ts, or exerciseSubmissions.ts.
  function handleCompleteSession() {
    // Intentionally a no-op: SessionWorkspace still shows the completion
    // screen locally (so the reviewer/author can verify it), but nothing is
    // persisted anywhere.
  }

  async function handleSubmitExercise(files: CodeFile[], language: string): Promise<SubmissionSummary> {
    void files;
    void language;
    attemptCounter.current += 1;
    return {
      id: `preview-${Date.now()}-${attemptCounter.current}`,
      attemptNumber: attemptCounter.current,
      submittedAt: new Date().toISOString(),
    };
  }

  return renderInLayout(
    <>
      {/* Full-bleed sticky banner: cancels the shell's own top/side padding so it sits flush under the topbar. */}
      <div className="sticky top-16 z-20 -mx-4 -mt-8 border-b border-error/20 bg-error/10 px-4 py-2.5 text-center sm:-mx-8 sm:-mt-10 sm:px-8">
        <p className="text-sm font-semibold text-error">CONTENT PREVIEW &middot; NOT LIVE TO STUDENTS</p>
      </div>

      {/* No max-width here — matches the real Student Session route (SessionPage.tsx), which never constrains SessionWorkspace's width either. */}
      <div className="mt-8 sm:mt-10">
        <BackLink to={backTo} label={backLabel} />

        <div className="mt-4">
          <SessionWorkspace
            mode="preview"
            sessionId={draft.sessionId}
            content={content}
            courseTitle={courseTitle}
            subjectTitle={subjectTitle}
            sessionTitle={sessionTitle}
            sessionDescription={sessionDescription}
            sessionNumber={sessionNumber}
            totalSessions={totalSessions}
            progress={0}
            nextSessionId={nextSessionId}
            greetingName={account.name.split(" ")[0] ?? "there"}
            initialSubmissions={[]}
            onCompleteSession={handleCompleteSession}
            onSubmitExercise={handleSubmitExercise}
            backHref={backTo}
            backLabel={backLabel}
            getNextSessionHref={(nextId) => `${role === "reviewer" ? "/review/preview" : "/content/preview"}/${packageId}/${courseId}/${subjectId}/${nextId}`}
            exitHref={backTo}
            exitLabel={backLabel}
          />
        </div>
      </div>
    </>
  );
}
