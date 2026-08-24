import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import Button from "../components/Button";
import { loadCompanyAccount, loadCompanyProfile, type CompanyAccount, type CompanyProfile } from "../data/company";
import { loadRequirementsForCompany } from "../data/hiring";
import RequirementCard from "../components/RequirementCard";

export default function CompanyDashboard() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const acct = loadCompanyAccount();
    if (!acct || acct.verificationStatus !== "verified") {
      navigate("/company/signup", { replace: true });
      return;
    }
    setAccount(acct);
    setProfile(loadCompanyProfile());
    setChecked(true);
  }, [navigate]);

  if (!checked || !account) return null;

  const requirements = loadRequirementsForCompany(account.id);
  const draftCount = requirements.filter((r) => r.status === "draft").length;
  const publishedCount = requirements.filter((r) => r.status === "published").length;
  const displayName = profile?.companyName ?? account.companyName;

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={displayName} />

      <main className="mx-auto max-w-[1200px] px-6 py-10 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-navy-500">Welcome back, {displayName}</h1>
            <p className="mt-1 text-sm text-navy-500/60">Manage your hiring requirements and track your pipeline.</p>
          </div>
          <Button type="button" className="!w-auto" onClick={() => navigate("/company/hiring/new")}>
            + Create Hiring Requirement
          </Button>
        </div>

        {/* Overview cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-sm font-medium text-navy-500/60">Draft Requirements</p>
            <p className="mt-2 text-3xl font-semibold text-navy-500">{draftCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-sm font-medium text-navy-500/60">Published Requirements</p>
            <p className="mt-2 text-3xl font-semibold text-navy-500">{publishedCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-sm font-medium text-navy-500/60">Total Candidates Matched</p>
            <p className="mt-2 text-3xl font-semibold text-navy-500/30">0</p>
            <p className="mt-0.5 text-xs text-navy-500/40">Coming soon</p>
          </div>
        </div>

        {/* Requirements list */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-navy-500">Your Hiring Requirements</h2>

          {requirements.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <p className="font-medium text-navy-500">No hiring requirements yet.</p>
              <p className="text-sm text-navy-500/60">Create your first requirement to start finding candidates.</p>
              <Button type="button" className="!w-auto mt-4" onClick={() => navigate("/company/hiring/new")}>
                + Create Hiring Requirement
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {requirements.map((req) => (
                <RequirementCard key={req.id} requirement={req} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
