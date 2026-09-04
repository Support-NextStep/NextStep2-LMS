import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { listReviewQueue } from "../data/contentReviewApi";
import { listCourses } from "../data/mock";
import { fetchAdminDashboardCounts, type AdminDashboardCounts } from "../data/adminApi";
import type { PackageSummary } from "../data/authoredSessionApi";

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
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [studentCounts, setStudentCounts] = useState<AdminDashboardCounts | null>(null);
  const [coursesCount, setCoursesCount] = useState<number | null>(null);

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
    (async () => {
      try {
        const counts = await fetchAdminDashboardCounts();
        if (!cancelled) setStudentCounts(counts);
      } catch {
        if (!cancelled) setStudentCounts({ studentsCount: 0, activeStudentsCount: 0 });
      }
    })();
    (async () => {
      try {
        const courses = await listCourses();
        if (!cancelled) setCoursesCount(courses.length);
      } catch {
        if (!cancelled) setCoursesCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !account || packages === null || studentCounts === null || coursesCount === null) return null;

  // ---- Dashboard metrics — every number below is real, backend-derived
  // data (GET /admin/dashboard, GET /courses, GET /review/packages), never
  // fabricated. See AdminService.getStudentCounts() for exactly what
  // "active" means here: a student with at least one real, backend-recorded
  // row of activity anywhere (session progress, activity progress, or an
  // exercise submission) — the most conservative, honest definition the
  // current schema supports (there is no account status/recency concept to
  // draw on instead). ----
  const { studentsCount, activeStudentsCount } = studentCounts;
  const publishedSessionsCount = packages.filter((p) => p.status === "PUBLISHED").length;
  const draftPackageCount = packages.filter((p) => p.status === "READY_FOR_REVIEW").length;
  const changesRequestedPackageCount = packages.filter((p) => p.status === "CHANGES_REQUESTED").length;

  // ---- Recent activity — derived from each package's own last-updated
  // timestamp. Doesn't distinguish "submitted" vs "approved" vs "published"
  // as separate historical events the way the old single mutable `review`
  // object's distinct approvedAt/publishedAt/reviewedAt fields could — the
  // full per-event trail now lives in ContentReview, viewable per package on
  // its own detail page; this dashboard's feed uses one row per package,
  // labeled by its current status. ----
  const activity: ActivityItem[] = [];
  const ACTIVITY_LABEL: Record<PackageSummary["status"], string> = {
    DRAFT: "Content package drafted",
    READY_FOR_REVIEW: "Content package submitted for review",
    CHANGES_REQUESTED: "Content package sent back with changes requested",
    APPROVED: "Content package approved",
    PUBLISHED: "Content package published",
  };
  for (const pkg of packages) {
    activity.push({ at: pkg.updatedAt, label: ACTIVITY_LABEL[pkg.status], detail: pkg.fileName });
  }
  // A real cross-student "student completed a session" feed would need a
  // new aggregate activity-log endpoint (query every student's
  // StudentSessionProgress, ordered by completedAt) — out of today's
  // explicit scope (Build ONLY: roster / detail / submission+evaluation
  // visibility / dashboard student+course metrics). The previous version of
  // this loop read the CURRENTLY LOGGED IN admin's own localStorage
  // performanceRecords, which is never any real student's data — removed
  // rather than left in place fabricating activity that never happened.
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
