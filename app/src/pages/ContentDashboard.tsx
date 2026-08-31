import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import Button from "../components/Button";
import { useRequireContentAuthorAccount } from "../hooks/useRequireContentAuthorAccount";
import { listMyPackages, type BackendPackageStatus, type PackageSummary } from "../data/authoredSessionApi";
import { listCourses } from "../data/mock";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_BADGE: Partial<Record<BackendPackageStatus, { label: string; className: string }>> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-navy-500/60" },
  READY_FOR_REVIEW: { label: "Pending Review", className: "bg-slate-100 text-navy-500/60" },
  CHANGES_REQUESTED: { label: "Changes Requested", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Published", className: "bg-brand-100 text-brand-700" },
};

function RecentSubmissionRow({ pkg }: { pkg: PackageSummary }) {
  const badge = STATUS_BADGE[pkg.status];
  return (
    <Link
      to={`/content/submissions/${pkg.id}`}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-navy-500">{pkg.fileName}</p>
        <p className="mt-0.5 text-xs text-navy-500/45">Last updated {formatDate(pkg.updatedAt)}</p>
      </div>
      {badge && (
        <span className={`w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>
          {badge.label}
        </span>
      )}
    </Link>
  );
}

export default function ContentDashboard() {
  const { account, checked } = useRequireContentAuthorAccount();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyPackages();
        if (!cancelled) setPackages(mine);
      } catch {
        if (!cancelled) setPackages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !account || packages === null) return null;

  const draftCount = packages.filter((p) => p.status === "READY_FOR_REVIEW").length;
  const changesCount = packages.filter((p) => p.status === "CHANGES_REQUESTED").length;
  const approvedCount = packages.filter((p) => p.status === "APPROVED").length;
  const publishedCount = packages.filter((p) => p.status === "PUBLISHED").length;
  const recent = packages.slice(0, 5);
  const course = listCourses()[0];

  return (
    <ContentAuthorLayout authorName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">Dashboard</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">A quick overview of your submissions — author new sessions from Courses.</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">Pending Review</p>
            <p className="mt-1 text-2xl font-bold text-navy-500">{draftCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">Changes Req</p>
            <p className="mt-1 text-2xl font-bold text-navy-500">{changesCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">Approved</p>
            <p className="mt-1 text-2xl font-bold text-navy-500">{approvedCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">Published</p>
            <p className="mt-1 text-2xl font-bold text-navy-500">{publishedCount}</p>
          </div>
        </div>

        {course && (
          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-navy-500">Start authoring</p>
              <p className="mt-1 text-sm text-navy-500/60">Browse {course.title}&apos;s courses, subjects, and sessions to author a new one.</p>
            </div>
            <Link to="/content/courses">
              <Button type="button" className="!w-auto shrink-0 px-6">
                Browse Courses
              </Button>
            </Link>
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Recent Submissions</h2>
            <Link to="/content/submissions" className="text-sm font-semibold text-brand-500 hover:text-brand-600">
              View all &rarr;
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No sessions authored yet.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">Open Courses above and click Add Session to get started.</p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {recent.map((pkg) => (
                <RecentSubmissionRow key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentAuthorLayout>
  );
}
