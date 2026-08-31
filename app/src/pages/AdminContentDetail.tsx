import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackLink from "../components/BackLink";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { listReviewQueue } from "../data/contentReviewApi";
import { listCourses, listSubjectSummaries, listSessionSummaries } from "../data/mock";
import type { BackendPackageStatus, PackageSummary } from "../data/authoredSessionApi";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<BackendPackageStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-navy-500/60" },
  READY_FOR_REVIEW: { label: "Pending Review", className: "bg-slate-100 text-navy-500/60" },
  CHANGES_REQUESTED: { label: "Changes Requested", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Published", className: "bg-brand-100 text-brand-700" },
};

function StatusBadge({ status }: { status: BackendPackageStatus }) {
  const badge = STATUS_BADGE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>
      {badge.label}
    </span>
  );
}

type SessionRow = { sessionId: string; sessionTitle: string; sessionDescription: string; status: BackendPackageStatus; statusAt: string };
type SubjectGroup = { subjectId: string; subjectTitle: string; sessions: SessionRow[] };

export default function AdminContentDetail() {
  const { account, checked } = useRequireAdminAccount();
  const { courseId = "" } = useParams<{ courseId: string }>();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listReviewQueue("ALL");
        if (!cancelled) setPackages(all);
      } catch {
        if (!cancelled) setPackages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !account || packages === null) return null;

  const courseTitle = listCourses().find((c) => c.id === courseId)?.title ?? courseId;
  const coursePackages = packages.filter((p) => p.courseId === courseId);

  if (coursePackages.length === 0) {
    return (
      <AdminLayout adminName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">This course has no content on record.</p>
          <div className="mt-4 flex justify-center">
            <BackLink to="/admin/content" label="Back to Content" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  const subjectMap = new Map<string, SubjectGroup>();
  for (const p of coursePackages) {
    const knownSession = listSessionSummaries(p.subjectId).find((s) => s.id === p.sessionId);
    const row: SessionRow = {
      sessionId: p.sessionId,
      sessionTitle: knownSession?.title ?? p.fileName,
      sessionDescription: knownSession?.description ?? "",
      status: p.status,
      statusAt: p.updatedAt,
    };
    const existing = subjectMap.get(p.subjectId);
    if (existing) {
      existing.sessions.push(row);
    } else {
      const subjectTitle = listSubjectSummaries().find((s) => s.id === p.subjectId)?.title ?? p.subjectId;
      subjectMap.set(p.subjectId, { subjectId: p.subjectId, subjectTitle, sessions: [row] });
    }
  }
  const subjects = [...subjectMap.values()].sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle));
  for (const subject of subjects) {
    subject.sessions.sort((a, b) => a.sessionTitle.localeCompare(b.sessionTitle));
  }
  const totalSessions = coursePackages.length;

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <BackLink to="/admin/content" label="Back to Content" />

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-500">{courseTitle}</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"} &middot; {totalSessions} session
          {totalSessions === 1 ? "" : "s"} &middot; read-only
        </p>

        <div className="mt-8 flex flex-col gap-6">
          {subjects.map((subject) => (
            <div key={subject.subjectId} className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">{subject.subjectTitle}</p>

              <div className="mt-4 flex flex-col gap-2">
                {subject.sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-500">{session.sessionTitle}</p>
                      <p className="truncate text-xs text-navy-500/50">{session.sessionDescription}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-navy-500/40">Last updated {formatDate(session.statusAt)}</span>
                      <StatusBadge status={session.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
