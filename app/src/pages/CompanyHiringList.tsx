import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import RequirementCard from "../components/RequirementCard";
import { loadCompanyAccount, type CompanyAccount } from "../data/company";
import { loadRequirementsForCompany } from "../data/hiring";

export default function CompanyHiringList() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const acct = loadCompanyAccount();
    if (!acct || acct.verificationStatus !== "verified") {
      navigate("/company/signup", { replace: true });
      return;
    }
    setAccount(acct);
    setChecked(true);
  }, [navigate]);

  if (!checked || !account) return null;

  const requirements = loadRequirementsForCompany(account.id);

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={account.companyName} />

      <main className="mx-auto max-w-[1200px] px-6 py-10 sm:px-10">
        <BackLink to="/company/dashboard" label="Back to Dashboard" />

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-navy-500">Hiring Requirements</h1>
            <p className="mt-1 text-sm text-navy-500/60">Manage every role you're hiring for.</p>
          </div>
          <Button type="button" className="!w-auto" onClick={() => navigate("/company/hiring/new")}>
            + Create Hiring Requirement
          </Button>
        </div>

        {requirements.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-medium text-navy-500">No hiring requirements yet.</p>
            <p className="text-sm text-navy-500/60">Create your first requirement to start finding candidates.</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {requirements.map((req) => (
              <RequirementCard key={req.id} requirement={req} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
