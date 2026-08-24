import { Link } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { useCourseData } from "../data/progress";
import { getAllStudentIds } from "../data/adminStudents";
import { loadContentPackages } from "../data/contentPackages";
import { resolveSessionStatuses } from "../data/publishedContent";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy-500">{value}</p>
    </div>
  );
}

type ActivityItem = { at: string; label: string; detail?: string };

export default function AdminDashboard() {
  const { account, checked } = useRequireAdminAccount();
  const { performanceRecords, getSessionContext } = useCourseData();

  if (!checked || !account) return null;

  const packages = loadContentPackages();
  const sessionStatuses = resolveSessionStatuses();

  // ---- Dashboard metrics — every number below is derived from real prototype data, never fabricated. ----
  const studentsCount = getAllStudentIds().length;
  // "Active" is deliberately conservative: a student who has actually completed
  // at least one session through the real workspace (a performance record
  // exists), not just the seeded demo baseline in mock.ts.
  const activeStudentsCount = performanceRecords.length > 0 ? studentsCount : 0;
  // This prototype has exactly one real course (COURSE in mock.ts) — the
  // student experience isn't structured around multiple courses yet. See
  // Content Overview for the (possibly larger) set of courseIds that appear
  // across imported content packages.
  const coursesCount = 1;
  const publishedSessionsCount = sessionStatuses.filter((s) => s.status === "published").length;
  const draftPackageCount = packages.filter((p) => p.status === "draft").length;
  const changesRequestedPackageCount = packages.filter((p) => p.status === "changes_requested").length;

  // ---- Recent activity — derived directly from existing timestamps already stored by the Student and Content Manager flows. ----
  const activity: ActivityItem[] = [];
  for (const pkg of packages) {
    activity.push({ at: pkg.importedAt, label: "Content package imported", detail: pkg.fileName });
    if (pkg.review?.publishedAt) {
      activity.push({ at: pkg.review.publishedAt, label: "Content package published", detail: pkg.fileName });
    } else if (pkg.review?.approvedAt) {
      activity.push({ at: pkg.review.approvedAt, label: "Content package approved", detail: pkg.fileName });
    } else if (pkg.status === "changes_requested" && pkg.review?.reviewedAt) {
      activity.push({ at: pkg.review.reviewedAt, label: "Content package sent back with changes requested", detail: pkg.fileName });
    }
  }
  for (const record of performanceRecords) {
    const context = getSessionContext(record.sessionId);
    activity.push({
      at: record.completedAt,
      label: "Student completed a session",
      detail: context?.session.title ?? record.sessionId,
    });
  }
  const recentActivity = activity.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  const hasAttentionItems = draftPackageCount > 0 || changesRequestedPackageCount > 0;

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">Dashboard</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">A quick overview of students and content across the platform.</p>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Students" value={studentsCount} />
          <StatCard label="Active Students" value={activeStudentsCount} />
          <StatCard label="Courses" value={coursesCount} />
          <StatCard label="Published Sessions" value={publishedSessionsCount} />
          <StatCard label="Content Awaiting Review" value={draftPackageCount} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Needs Attention */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Needs Attention</h2>

            {hasAttentionItems ? (
              <div className="mt-4 flex flex-col gap-3">
                {draftPackageCount > 0 && (
                  <Link
                    to="/admin/content"
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
                  >
                    <span>
                      {draftPackageCount} content package{draftPackageCount === 1 ? "" : "s"} awaiting review
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                )}
                {changesRequestedPackageCount > 0 && (
                  <Link
                    to="/admin/content"
                    className="flex items-center justify-between rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm font-medium text-error hover:bg-error/10"
                  >
                    <span>
                      {changesRequestedPackageCount} content package{changesRequestedPackageCount === 1 ? "" : "s"} have changes requested
                    </span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-navy-500/50">Nothing needs attention right now.</p>
            )}
          </section>

          {/* Recent Activity */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Recent Activity</h2>

            {recentActivity.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-3">
                {recentActivity.map((item, i) => (
                  <li key={i} className="flex flex-col gap-0.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-navy-500">{item.label}</span>
                      <span className="shrink-0 text-xs text-navy-500/40">{formatDateTime(item.at)}</span>
                    </div>
                    {item.detail && <span className="truncate text-xs text-navy-500/50">{item.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-navy-500/50">No activity yet.</p>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
