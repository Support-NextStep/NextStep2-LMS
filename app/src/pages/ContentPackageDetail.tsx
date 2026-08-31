import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import ContentReviewerLayout from "../components/ContentReviewerLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadContentAuthorAccount, type ContentAuthorAccount } from "../data/contentAuthor";
import { loadContentReviewerAccount, type ContentReviewerAccount } from "../data/contentReviewer";
import { getPackageDetail, type BackendPackageStatus, type PackageDetail } from "../data/authoredSessionApi";
import { requestChanges, approve, publish } from "../data/contentReviewApi";
import type { AuthoredSessionDraft } from "../data/authoredSession";

type Checklist = {
  course: boolean;
  structure: boolean;
  sessions: boolean;
  videos: boolean;
  practice: boolean;
  aiHelp: boolean;
  exercises: boolean;
  ready: boolean;
};

const EMPTY_CHECKLIST: Checklist = {
  course: false, structure: false, sessions: false, videos: false,
  practice: false, aiHelp: false, exercises: false, ready: false,
};

/**
 * The one screen that operates on a package's review/approve/publish
 * workflow — shared, not duplicated, between the Content Author and Content
 * Reviewer workspaces (see NEXTSTEP² role/workspace separation). Same data,
 * same component; only `role` changes what's interactive:
 *
 *   role="reviewer" (/review/package/:packageId) — the real review
 *     workstation: editable checklist/notes, Request Changes, Approve, Publish.
 *   role="author" (/content/submissions/:packageId) — read-only status: the
 *     latest checklist/notes shown but never editable, no Request Changes/
 *     Approve/Publish controls, plus a Continue Editing shortcut when the
 *     submission is still resumable (draft/changes_requested).
 *
 * The Content Author never edits the record here — the ONLY write path this
 * file exposes (requestChanges/approve/publish, from contentReviewApi.ts)
 * only runs when role is "reviewer". Whoever wrote the source content amends
 * it in the authoring workspace instead (ContentSessionAuthoring.tsx) and
 * resubmits, which creates a brand new, distinct ContentVersion server-side.
 */
export default function ContentPackageDetail({ role }: { role: "author" | "reviewer" }) {
  const navigate = useNavigate();
  const { packageId = "" } = useParams<{ packageId: string }>();
  const [account, setAccount] = useState<ContentAuthorAccount | ContentReviewerAccount | null>(null);
  const [pkg, setPkg] = useState<PackageDetail | null | undefined>(undefined);
  const [checked, setChecked] = useState(false);

  // Form state
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Checklist>(EMPTY_CHECKLIST);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const acct = role === "reviewer" ? await loadContentReviewerAccount() : await loadContentAuthorAccount();
      if (cancelled) return;
      if (!acct) {
        navigate(role === "reviewer" ? "/review/login" : "/content/login", { replace: true });
        return;
      }
      setAccount(acct);

      try {
        const loaded = await getPackageDetail(packageId);
        if (cancelled) return;
        setPkg(loaded);
        // Pre-fill the form from the most recent review, if any — same
        // "resume where the last review left off" behavior the old single
        // mutable `review` object gave, now read from the append-only trail.
        const latest = loaded.contentReviews[loaded.contentReviews.length - 1];
        if (latest) {
          setNotes(latest.notes ?? "");
          if (latest.checklist) setChecklist({ ...EMPTY_CHECKLIST, ...(latest.checklist as Partial<Checklist>) });
        }
      } catch {
        if (!cancelled) setPkg(null);
      }
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId, navigate, role]);

  const backTo = role === "reviewer" ? "/review/dashboard" : "/content/submissions";
  const backLabel = role === "reviewer" ? "Back to Dashboard" : "Back to My Submissions";
  const previewBase = role === "reviewer" ? "/review/preview" : "/content/preview";

  function renderInLayout(children: ReactNode) {
    if (!account) return null;
    return role === "reviewer" ? (
      <ContentReviewerLayout reviewerName={account.name}>{children}</ContentReviewerLayout>
    ) : (
      <ContentAuthorLayout authorName={account.name}>{children}</ContentAuthorLayout>
    );
  }

  if (!checked || !account) return null;

  if (!pkg) {
    return renderInLayout(
      <div className="mx-auto max-w-2xl py-8 text-center">
        <p className="font-medium text-navy-500">Package not found.</p>
        <Button type="button" className="!w-auto mt-4" onClick={() => navigate(backTo)}>
          {backLabel}
        </Button>
      </div>
    );
  }

  const draft = pkg.draftContent as AuthoredSessionDraft | null;
  const isDraft = pkg.status === "DRAFT";
  const isReadyForReview = pkg.status === "READY_FOR_REVIEW";
  const isChangesRequested = pkg.status === "CHANGES_REQUESTED";
  const isApproved = pkg.status === "APPROVED";
  const isPublished = pkg.status === "PUBLISHED";

  const isReviewer = role === "reviewer";
  // A reviewer can only act on a package that's genuinely been submitted —
  // DRAFT means the author is still actively editing and hasn't submitted
  // it at all, so there's nothing for a reviewer to review yet. This is the
  // real distinction the old model couldn't make (DRAFT used to mean both
  // "still editing" and "submitted, awaiting review" at once).
  const canEditReview = isReviewer && isReadyForReview;

  const handleCheck = (key: keyof Checklist) => {
    if (!canEditReview) return;
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  async function refresh() {
    const loaded = await getPackageDetail(packageId);
    setPkg(loaded);
  }

  const handleRequestChanges = async () => {
    if (!notes.trim()) {
      alert("Please provide review notes explaining what needs to be changed.");
      return;
    }
    await requestChanges(packageId, checklist, notes);
    await refresh();
  };

  const handleApprove = async () => {
    if (!allChecked) return;
    if (window.confirm("Approve this content package?\n\nApproved content is not visible to students until it is published.")) {
      await approve(packageId, checklist);
      await refresh();
    }
  };

  const handlePublish = async () => {
    if (window.confirm("Publish this course?\n\nThis will make the approved content available to students.")) {
      await publish(packageId);
      await refresh();
    }
  };

  // Only meaningful for the Content Author — a package always belongs to
  // exactly one session (see authoredSession.ts).
  const editUrl =
    !isReviewer && (isDraft || isChangesRequested)
      ? `/content/courses/${pkg.courseId}/subjects/${pkg.subjectId}/sessions/${pkg.sessionId}/author`
      : null;

  const publishedReview = pkg.contentReviews.find((r) => r.action === "PUBLISHED");

  const STATUS_BADGE: Record<BackendPackageStatus, { label: string; className: string }> = {
    DRAFT: { label: isReviewer ? "Draft" : "Draft — not yet submitted", className: "bg-slate-100 text-navy-500/60" },
    READY_FOR_REVIEW: { label: "Pending Review", className: "bg-slate-100 text-navy-500/60" },
    CHANGES_REQUESTED: { label: "Changes Requested", className: "bg-amber-100 text-amber-700" },
    APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
    PUBLISHED: { label: "Published", className: "bg-brand-100 text-brand-700" },
  };
  const badge = STATUS_BADGE[pkg.status];

  return renderInLayout(
    <div>
      <BackLink to={backTo} label={backLabel} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-500">{pkg.fileName}</h1>
          <p className="mt-1 text-sm text-navy-500/60">
            {draft?.subjectTitle ?? pkg.subjectId} &middot; {draft?.courseTitle ?? pkg.courseId}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* A package always covers exactly one session — see authoredSession.ts. */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-navy-500">{draft?.sessionTitle ?? pkg.fileName}</h2>
            <p className="mt-1 text-sm text-navy-500/60">{draft?.sessionDescription ?? ""}</p>

            <div className="mt-5">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-500">{draft?.sessionTitle ?? pkg.fileName}</p>
                  <p className="truncate text-xs text-navy-500/50">{draft?.sessionDescription ?? ""}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="!w-auto shrink-0 px-4 py-1.5 text-sm"
                  onClick={() => navigate(`${previewBase}/${pkg.id}/${pkg.courseId}/${pkg.subjectId}/${pkg.sessionId}`)}
                >
                  Preview
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40 mb-4">
              {isReviewer ? "Content Review" : "Submission Status"}
            </h3>

            <div className="flex flex-col gap-3">
              {[
                { key: "course", label: "Course information reviewed" },
                { key: "structure", label: "Subject structure reviewed" },
                { key: "sessions", label: "Session content reviewed" },
                { key: "videos", label: "Videos reviewed" },
                { key: "practice", label: "Practice activities reviewed" },
                { key: "aiHelp", label: "AI Help reviewed" },
                { key: "exercises", label: "Exercises reviewed" },
                { key: "ready", label: "Content is ready for students" },
              ].map((item) => (
                <label key={item.key} className={`flex items-start gap-3 ${canEditReview ? "cursor-pointer" : ""}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-500 disabled:opacity-50"
                    checked={checklist[item.key as keyof Checklist]}
                    onChange={() => handleCheck(item.key as keyof Checklist)}
                    disabled={!canEditReview}
                  />
                  <span className="text-sm text-navy-500">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-navy-500 mb-2">
                {isReviewer ? "Review notes:" : "Reviewer notes:"}
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-navy-500/60"
                rows={4}
                placeholder={isReviewer ? "Provide feedback here if changes are needed..." : "No notes from the Approval Team yet."}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEditReview}
              />
            </div>

            {isReviewer ? (
              <>
                {isReadyForReview && (
                  <div className="mt-6 flex flex-col gap-3">
                    <Button type="button" variant="secondary" onClick={handleRequestChanges}>
                      Request Changes
                    </Button>
                    <Button type="button" onClick={handleApprove} disabled={!allChecked} className={!allChecked ? "opacity-50" : ""}>
                      Approve Content
                    </Button>
                  </div>
                )}
                {isDraft && (
                  <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 border border-slate-200">
                    <p className="text-sm font-medium text-navy-500">Not yet submitted</p>
                    <p className="mt-1 text-xs text-navy-500/60">The Content Author hasn&apos;t submitted this for review yet.</p>
                  </div>
                )}
                {isChangesRequested && (
                  <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 border border-amber-100">
                    <p className="text-sm font-medium text-amber-800">Changes requested</p>
                    <p className="mt-1 text-xs text-amber-700/80">Waiting on the Content Author to resubmit.</p>
                  </div>
                )}
                {isApproved && (
                  <div className="mt-6 flex flex-col gap-3">
                    <div className="rounded-lg bg-emerald-50 px-4 py-3 border border-emerald-100">
                      <p className="text-sm font-medium text-emerald-800">✓ Content approved</p>
                      <p className="mt-1 text-xs text-emerald-700/80">Ready to publish. Students cannot see this content yet.</p>
                    </div>
                    <Button type="button" onClick={handlePublish}>
                      Publish
                    </Button>
                  </div>
                )}
                {isPublished && (
                  <div className="mt-6">
                    <div className="rounded-lg bg-brand-50 px-4 py-3 border border-brand-100">
                      <p className="text-sm font-medium text-brand-800">✓ Published</p>
                      <p className="mt-1 text-xs text-brand-700/80">
                        This content is now available to students.
                        <br />
                        Published at: {publishedReview ? new Date(publishedReview.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Content Author has no Approve/Publish/Request Changes controls — those only exist in the Approval Team's workspace. */}
                {isDraft && (
                  <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 border border-slate-200">
                    <p className="text-sm font-medium text-navy-500">Draft — not yet submitted</p>
                    <p className="mt-1 text-xs text-navy-500/60">Continue editing and click Submit for Review when ready.</p>
                  </div>
                )}
                {isReadyForReview && (
                  <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 border border-slate-200">
                    <p className="text-sm font-medium text-navy-500">Submitted — awaiting review</p>
                    <p className="mt-1 text-xs text-navy-500/60">The Approval Team hasn&apos;t reviewed this submission yet.</p>
                  </div>
                )}
                {isChangesRequested && (
                  <div className="mt-6 flex flex-col gap-3">
                    <div className="rounded-lg bg-amber-50 px-4 py-3 border border-amber-100">
                      <p className="text-sm font-medium text-amber-800">Changes requested</p>
                      <p className="mt-1 text-xs text-amber-700/80">See the reviewer notes above, then continue editing and resubmit.</p>
                    </div>
                    {editUrl && (
                      <Link to={editUrl} state={{ sessionTitle: pkg.fileName }}>
                        <Button type="button">Continue Editing</Button>
                      </Link>
                    )}
                  </div>
                )}
                {isApproved && (
                  <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 border border-emerald-100">
                    <p className="text-sm font-medium text-emerald-800">✓ Approved</p>
                    <p className="mt-1 text-xs text-emerald-700/80">Awaiting publish by the Approval Team. Students cannot see this content yet.</p>
                  </div>
                )}
                {isPublished && (
                  <div className="mt-6 rounded-lg bg-brand-50 px-4 py-3 border border-brand-100">
                    <p className="text-sm font-medium text-brand-800">✓ Published</p>
                    <p className="mt-1 text-xs text-brand-700/80">
                      This content is now available to students.
                      <br />
                      Published at: {publishedReview ? new Date(publishedReview.createdAt).toLocaleString() : "—"}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
