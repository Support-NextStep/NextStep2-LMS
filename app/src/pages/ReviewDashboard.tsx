import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContentReviewerLayout from "../components/ContentReviewerLayout";
import { useRequireContentReviewerAccount } from "../hooks/useRequireContentReviewerAccount";
import { listReviewQueue } from "../data/contentReviewApi";
import type { BackendPackageStatus, PackageSummary } from "../data/authoredSessionApi";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const TILES: { status: BackendPackageStatus; label: string; to: string }[] = [
  { status: "READY_FOR_REVIEW", label: "Pending Review", to: "/review/pending" },
  { status: "CHANGES_REQUESTED", label: "Changes Requested", to: "/review/changes-requested" },
  { status: "APPROVED", label: "Approved", to: "/review/approved" },
  { status: "PUBLISHED", label: "Published", to: "/review/published" },
];

export default function ReviewDashboard() {
  const { account, checked } = useRequireContentReviewerAccount();
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

  const pending = packages.filter((p) => p.status === "READY_FOR_REVIEW");

  return (
    <ContentReviewerLayout reviewerName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">Dashboard</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">A quick overview of content moving through review.</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TILES.map((tile) => {
            const count = packages.filter((p) => p.status === tile.status).length;
            return (
              <Link
                key={tile.status}
                to={tile.to}
                className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-200 hover:shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">{tile.label}</p>
                <p className="mt-1 text-2xl font-bold text-navy-500">{count}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Needs Your Attention</h2>
            <Link to="/review/pending" className="text-sm font-semibold text-brand-500 hover:text-brand-600">
              View all &rarr;
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-navy-500/50">
              Nothing pending review right now.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {pending.slice(0, 5).map((pkg) => (
                <Link
                  key={pkg.id}
                  to={`/review/package/${pkg.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy-500">{pkg.fileName}</p>
                    <p className="mt-0.5 text-xs text-navy-500/45">Last updated {formatDate(pkg.updatedAt)}</p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-navy-500/60">
                    Pending Review
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentReviewerLayout>
  );
}
