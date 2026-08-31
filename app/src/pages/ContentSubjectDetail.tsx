import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { useRequireContentAuthorAccount } from "../hooks/useRequireContentAuthorAccount";
import { listCourses, listSessionSummaries, getSubjectSummary } from "../data/mock";
import { apiCreateSession } from "../data/mock";
import { listMyPackages, type BackendPackageStatus, type PackageSummary } from "../data/authoredSessionApi";

type SessionRow = {
  id: string;
  title: string;
  description: string;
  status: PackageSummary | null;
};

const STATUS_BADGE: Record<BackendPackageStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-navy-500/60" },
  READY_FOR_REVIEW: { label: "Pending Review", className: "bg-slate-100 text-navy-500/60" },
  CHANGES_REQUESTED: { label: "Changes Requested", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Published", className: "bg-brand-100 text-brand-700" },
};

export default function ContentSubjectDetail() {
  const navigate = useNavigate();
  const { courseId = "", subjectId = "" } = useParams<{ courseId: string; subjectId: string }>();
  const { account, checked } = useRequireContentAuthorAccount();
  const [addingSession, setAddingSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionDesc, setNewSessionDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myPackages, setMyPackages] = useState<PackageSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyPackages();
        if (!cancelled) setMyPackages(mine);
      } catch {
        if (!cancelled) setMyPackages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  if (!checked || !account || myPackages === null) return null;

  const course = listCourses().find((c) => c.id === courseId);
  const subject = getSubjectSummary(subjectId);

  if (!course || !subject) {
    return (
      <ContentAuthorLayout authorName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">Subject not found.</p>
          <BackLink to={`/content/courses/${courseId}`} label="Back to Course" />
        </div>
      </ContentAuthorLayout>
    );
  }

  // Only this author's own packages — a session already claimed by another
  // author's in-progress package would still be correctly rejected server-
  // side (the partial unique index enforces at most one active package per
  // session, regardless of author); this view just doesn't cross-reference
  // other authors' work.
  const statusesForSubject = myPackages.filter((p) => p.subjectId === subjectId);
  const statusBySessionId = new Map(statusesForSubject.map((s) => [s.sessionId, s]));

  const knownSessions = listSessionSummaries(subjectId);
  const rows: SessionRow[] = knownSessions.map((s) => ({ id: s.id, title: s.title, description: s.description, status: statusBySessionId.get(s.id) ?? null }));

  // Sessions that only exist because a package/authored draft already targets them (not part of the curated/generated mock list at all).
  for (const status of statusesForSubject) {
    if (!rows.some((r) => r.id === status.sessionId)) {
      rows.push({ id: status.sessionId, title: status.fileName, description: "", status });
    }
  }

  function goAuthor(row: SessionRow) {
    navigate(`/content/courses/${courseId}/subjects/${subjectId}/sessions/${row.id}/author`, {
      state: { sessionTitle: row.title, sessionDescription: row.description },
    });
  }

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault();
    const title = newSessionTitle.trim();
    const desc = newSessionDesc.trim();
    if (!title || !desc) return;
    setIsSubmitting(true);
    try {
      const session = await apiCreateSession(subjectId, title, desc);
      navigate(`/content/courses/${courseId}/subjects/${subjectId}/sessions/${session.id}/author`, {
        state: { sessionTitle: title, sessionDescription: desc },
      });
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  }

  return (
    <ContentAuthorLayout authorName={account.name}>
      <div>
        <BackLink to={`/content/courses/${courseId}`} label="Back to Subjects" />
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy-500">{subject.title}</h1>
            <p className="mt-1.5 text-sm text-navy-500/60">{course.title}</p>
          </div>
          <Button type="button" className="!w-auto px-6" onClick={() => setAddingSession((v) => !v)}>
            Add Session
          </Button>
        </div>

        {addingSession && (
          <form onSubmit={handleAddSession} className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-navy-500">Add a New Session</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-500">Session Title</span>
              <input
                type="text"
                autoFocus
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
                placeholder="e.g. Async / Await"
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-500">Session Description</span>
              <textarea
                rows={2}
                value={newSessionDesc}
                onChange={(e) => setNewSessionDesc(e.target.value)}
                placeholder="Brief description..."
                disabled={isSubmitting}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
              />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" className="!w-auto px-6" onClick={() => setAddingSession(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" className="!w-auto px-6" disabled={isSubmitting || !newSessionTitle.trim() || !newSessionDesc.trim()}>
                Start Authoring
              </Button>
            </div>
          </form>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No sessions yet.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">Click Add Session to author the first one.</p>
            </div>
          ) : (
            rows.map((row) => {
              const badge = row.status ? STATUS_BADGE[row.status.status] : null;
              const isAuthorable = !row.status || row.status.status === "DRAFT" || row.status.status === "CHANGES_REQUESTED";
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-navy-500">{row.title}</p>
                      {badge ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-navy-500/50">
                          Not Started
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-navy-500/60">{row.description}</p>
                  </div>

                  {isAuthorable ? (
                    <Button type="button" variant="secondary" className="!w-auto shrink-0 px-5" onClick={() => goAuthor(row)}>
                      {row.status ? "Continue Editing" : "Start Authoring"}
                    </Button>
                  ) : (
                    <div className="flex shrink-0 gap-2">
                      {/* Content Team can see this submission's status, but Approve/Publish/Request
                          Changes only exist in the Approval Team's workspace (/review/*) — see
                          ContentPackageDetail.tsx's role prop. */}
                      <Button
                        type="button"
                        variant="secondary"
                        className="!w-auto px-5"
                        onClick={() => navigate(`/content/submissions/${row.status!.id}`)}
                      >
                        View Submission
                      </Button>
                      {/* Approved/published content stays live as-is — revising it opens a
                          brand-new draft (a new version) rather than editing the live record
                          in place, per NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md §11. Reusing
                          goAuthor() here is safe: loadDraftForSession() only ever resumes a
                          draft/changes_requested record, so this always starts fresh. */}
                      <Button type="button" variant="secondary" className="!w-auto px-5" onClick={() => goAuthor(row)}>
                        Author New Version
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </ContentAuthorLayout>
  );
}
