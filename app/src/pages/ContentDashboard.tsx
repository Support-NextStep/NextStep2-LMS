import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import ContentManagerLayout from "../components/ContentManagerLayout";
import Button from "../components/Button";
import { loadContentManagerAccount, type ContentManagerAccount } from "../data/contentManager";
import { loadContentPackages, type ContentPackageRecord } from "../data/contentPackages";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function PackageCard({ pkg }: { pkg: ContentPackageRecord }) {
  const getStatusBadge = () => {
    switch (pkg.status) {
      case "invalid": return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-error/10 text-error">Needs Attention</span>;
      case "draft": return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-slate-100 text-navy-500/60">Draft</span>;
      case "changes_requested": return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-700">Changes Req</span>;
      case "approved": return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">Approved</span>;
      case "published": return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-brand-100 text-brand-700">Published</span>;
      default: return null;
    }
  };

  const getButtonText = () => {
    if (pkg.status === "published") return "View Published";
    if (pkg.status === "invalid") return null;
    return "Review";
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-navy-500">{pkg.fileName}</h3>
          {getStatusBadge()}
        </div>
        <p className="mt-1.5 text-sm text-navy-500/60">
          {pkg.courseCount} course{pkg.courseCount === 1 ? "" : "s"} &middot; {pkg.subjectCount} subject
          {pkg.subjectCount === 1 ? "" : "s"} &middot; {pkg.sessionCount} session{pkg.sessionCount === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-navy-500/45">
          Imported {formatDate(pkg.importedAt)} by {pkg.importedBy}
          {pkg.contentTeam ? ` &middot; ${pkg.contentTeam}` : ""}
        </p>
        {pkg.status === "invalid" && (
          <p className="mt-1.5 text-xs font-medium text-error">
            {pkg.validation.errors.length} validation error{pkg.validation.errors.length === 1 ? "" : "s"} — re-import
            a corrected package to continue.
          </p>
        )}
      </div>

      {pkg.status !== "invalid" && (
        <Link to={`/content/package/${pkg.id}`} className="shrink-0">
          <Button type="button" variant="secondary" className="!w-auto">
            {getButtonText()}
          </Button>
        </Link>
      )}
    </div>
  );
}

export default function ContentDashboard() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<ContentManagerAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [packages, setPackages] = useState<ContentPackageRecord[]>([]);

  useEffect(() => {
    const acct = loadContentManagerAccount();
    if (!acct) {
      navigate("/content/login", { replace: true });
      return;
    }
    setAccount(acct);
    setPackages(loadContentPackages());
    setChecked(true);
  }, [navigate]);

  if (!checked || !account) return null;

  const draftCount = packages.filter((p) => p.status === "draft").length;
  const changesCount = packages.filter((p) => p.status === "changes_requested").length;
  const approvedCount = packages.filter((p) => p.status === "approved").length;
  const publishedCount = packages.filter((p) => p.status === "published").length;

  return (
    <ContentManagerLayout managerName={account.name}>
      <div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy-500">Content Packages</h1>
            <p className="mt-1.5 text-sm text-navy-500/60">
              Manage and review imported content before making it available to students.
            </p>
          </div>

          <Link to="/content/import" className="shrink-0">
            <Button type="button" className="!w-auto">
              Import Package
            </Button>
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/50">Draft</p>
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

        <div className="mt-8">
          {packages.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No content packages imported yet.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">
                Click Import Package to upload your first zip file.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentManagerLayout>
  );
}
