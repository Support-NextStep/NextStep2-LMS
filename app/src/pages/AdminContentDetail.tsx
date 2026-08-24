import { useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackLink from "../components/BackLink";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { resolveSessionStatuses, type SessionStatusInfo } from "../data/publishedContent";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<SessionStatusInfo["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-navy-500/60" },
  changes_requested: { label: "Changes Requested", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  published: { label: "Published", className: "bg-brand-100 text-brand-700" },
};

function StatusBadge({ status }: { status: SessionStatusInfo["status"] }) {
  const badge = STATUS_BADGE[status];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>
      {badge.label}
    </span>
  );
}

const STATUS_TIMESTAMP_LABEL: Record<SessionStatusInfo["status"], string> = {
  draft: "Imported",
  changes_requested: "Reviewed",
  approved: "Approved",
  published: "Published",
};

export default function AdminContentDetail() {
  const { account, checked } = useRequireAdminAccount();
  const { courseId = "" } = useParams<{ courseId: string }>();

  if (!checked || !account) return null;

  const allSessions = resolveSessionStatuses();
  const courseSessions = allSessions.filter((s) => s.courseId === courseId);

  if (courseSessions.length === 0) {
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

  const courseTitle = courseSessions[0].courseTitle;

  const subjectMap = new Map<string, { subjectId: string; subjectTitle: string; subjectOrder: number; sessions: SessionStatusInfo[] }>();
  for (const s of courseSessions) {
    const existing = subjectMap.get(s.subjectId);
    if (existing) {
      existing.sessions.push(s);
    } else {
      subjectMap.set(s.subjectId, { subjectId: s.subjectId, subjectTitle: s.subjectTitle, subjectOrder: s.subjectOrder, sessions: [s] });
    }
  }
  const subjects = [...subjectMap.values()].sort((a, b) => a.subjectOrder - b.subjectOrder);
  for (const subject of subjects) {
    subject.sessions.sort((a, b) => a.sessionOrder - b.sessionOrder);
  }

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <BackLink to="/admin/content" label="Back to Content" />

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-500">{courseTitle}</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"} &middot; {courseSessions.length} session
          {courseSessions.length === 1 ? "" : "s"} &middot; read-only
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
                      <span className="text-xs text-navy-500/40">
                        {STATUS_TIMESTAMP_LABEL[session.status]} {formatDate(session.statusAt)}
                      </span>
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
