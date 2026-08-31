import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContentReviewerLayout from "../components/ContentReviewerLayout";
import Button from "../components/Button";
import { useRequireContentReviewerAccount } from "../hooks/useRequireContentReviewerAccount";
import { listReviewQueue } from "../data/contentReviewApi";
import type { BackendPackageStatus, PackageSummary } from "../data/authoredSessionApi";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const EMPTY_COPY: Record<BackendPackageStatus, string> = {
  DRAFT: "Nothing here.",
  READY_FOR_REVIEW: "Nothing is waiting for review right now.",
  CHANGES_REQUESTED: "No submissions currently have changes requested.",
  APPROVED: "Nothing is approved and waiting to publish.",
  PUBLISHED: "Nothing has been published yet.",
};

/**
 * One reusable list, mounted four times (Pending Review / Changes Requested
 * / Approved / Published) — see ContentReviewerLayout.tsx's nav. Every row
 * reads from the same backend package data ContentDashboard.tsx's Content
 * Author view reads; this is purely a different status filter + a link into
 * the shared review workstation (/review/package/:id).
 */
export default function ReviewQueue({ status, title }: { status: BackendPackageStatus; title: string }) {
  const { account, checked } = useRequireContentReviewerAccount();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listReviewQueue(status);
        if (!cancelled) setPackages(list);
      } catch {
        if (!cancelled) setPackages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!checked || !account || packages === null) return null;

  return (
    <ContentReviewerLayout reviewerName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">{title}</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">{packages.length} submission{packages.length === 1 ? "" : "s"}.</p>

        <div className="mt-6">
          {packages.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="text-sm text-navy-500/50">{EMPTY_COPY[status]}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-500">{pkg.fileName}</p>
                    <p className="mt-1 text-xs text-navy-500/45">Last updated {formatDate(pkg.updatedAt)}</p>
                  </div>
                  <Link to={`/review/package/${pkg.id}`} className="shrink-0">
                    <Button type="button" variant="secondary" className="!w-auto px-5">
                      Review
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentReviewerLayout>
  );
}
