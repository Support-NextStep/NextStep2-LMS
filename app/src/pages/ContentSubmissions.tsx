import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import Button from "../components/Button";
import { useRequireContentAuthorAccount } from "../hooks/useRequireContentAuthorAccount";
import { listMyPackages, type BackendPackageStatus, type PackageSummary } from "../data/authoredSessionApi";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_BADGE: Record<BackendPackageStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-navy-500/60" },
  READY_FOR_REVIEW: { label: "Pending Review", className: "bg-slate-100 text-navy-500/60" },
  CHANGES_REQUESTED: { label: "Changes Requested", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Published", className: "bg-brand-100 text-brand-700" },
};

/** The authoring-workspace URL for this package's one session. */
function authorUrl(pkg: PackageSummary): string {
  return `/content/courses/${pkg.courseId}/subjects/${pkg.subjectId}/sessions/${pkg.sessionId}/author`;
}

function SubmissionCard({ pkg }: { pkg: PackageSummary }) {
  const badge = STATUS_BADGE[pkg.status];
  const resumable = pkg.status === "DRAFT" || pkg.status === "CHANGES_REQUESTED";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-navy-500">{pkg.fileName}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>{badge.label}</span>
        </div>
        <p className="mt-1 text-xs text-navy-500/45">Last updated {formatDate(pkg.updatedAt)}</p>
        {pkg.status === "CHANGES_REQUESTED" && pkg.latestReviewNotes && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Reviewer notes: {pkg.latestReviewNotes}</p>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        {resumable && (
          <Link to={authorUrl(pkg)} state={{ sessionTitle: pkg.fileName }}>
            <Button type="button" className="!w-auto px-5">
              Continue Editing
            </Button>
          </Link>
        )}
        <Link to={`/content/submissions/${pkg.id}`}>
          <Button type="button" variant="secondary" className="!w-auto px-5">
            View Submission
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function ContentSubmissions() {
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

  return (
    <ContentAuthorLayout authorName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">My Submissions</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">Every session you&apos;ve authored, and where it stands with the Approval Team.</p>

        <div className="mt-6">
          {packages.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No sessions authored yet.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">Open Courses and click Add Session to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {packages.map((pkg) => (
                <SubmissionCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentAuthorLayout>
  );
}
