import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadCompanyAccount, type CompanyAccount } from "../data/company";
import { getRequirement, type HiringRequirement } from "../data/hiring";
import { statusBadgeClass, statusLabel } from "../components/RequirementCard";

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CompanyHiringView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [requirement, setRequirement] = useState<HiringRequirement | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const acct = loadCompanyAccount();
    if (!acct || acct.verificationStatus !== "verified") {
      navigate("/company/signup", { replace: true });
      return;
    }
    setAccount(acct);
    if (id) setRequirement(getRequirement(id, acct.id));
    setChecked(true);
  }, [id, navigate]);

  if (!checked || !account) return null;

  if (!requirement) {
    return (
      <div className="min-h-screen bg-[#f4f7fc]">
        <CompanyHeader companyName={account.companyName} />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="font-medium text-navy-500">Requirement not found.</p>
          <Button type="button" className="!w-auto mt-4" onClick={() => navigate("/company/hiring")}>
            Back to Hiring Requirements
          </Button>
        </main>
      </div>
    );
  }

  const isDraft = requirement.status === "draft";

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={account.companyName} />

      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <BackLink to="/company/hiring" label="Back to Hiring Requirements" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-navy-500">{requirement.title || "Untitled role"}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(requirement.status)}`}>
                {statusLabel(requirement.status)}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-navy-500/60">
              {[requirement.location, requirement.workMode].filter(Boolean).join(" · ") || "Location not set"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="!w-auto"
              onClick={() => navigate(`/company/hiring/${requirement.id}/edit`)}
            >
              Edit
            </Button>
            {isDraft && (
              <Button
                type="button"
                className="!w-auto"
                onClick={() => navigate(`/company/hiring/${requirement.id}/review`)}
              >
                Publish
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-sm leading-relaxed text-navy-500/70">
            {requirement.description || "No description provided."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-navy-500/45">Employment Type</p>
              <p className="mt-0.5 font-medium text-navy-500">{requirement.employmentType || "—"}</p>
            </div>
            <div>
              <p className="text-navy-500/45">Experience</p>
              <p className="mt-0.5 font-medium text-navy-500">{requirement.experienceLevel || "—"}</p>
            </div>
            <div>
              <p className="text-navy-500/45">Created</p>
              <p className="mt-0.5 font-medium text-navy-500">{formatDate(requirement.createdAt)}</p>
            </div>
            <div>
              <p className="text-navy-500/45">Published</p>
              <p className="mt-0.5 font-medium text-navy-500">{formatDate(requirement.publishedAt)}</p>
            </div>
          </div>

          {(requirement.requiredSkills.length > 0 || requirement.preferredSkills.length > 0) && (
            <div className="mt-6 flex flex-col gap-3">
              {requirement.requiredSkills.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-navy-500">Required Skills</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {requirement.requiredSkills.map((s) => (
                      <span key={s} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {requirement.preferredSkills.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-navy-500">Preferred Skills</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {requirement.preferredSkills.map((s) => (
                      <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-navy-500/70">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/50">Candidates</h2>
          {isDraft ? (
            <p className="mt-3 text-sm text-navy-500/60">
              Candidate matching will appear here once your requirement is published.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-navy-500/60">
                See NextStep² students whose skills, projects, and learning progress align with this requirement.
              </p>
              <Button
                type="button"
                className="!w-auto"
                onClick={() => navigate(`/company/hiring/${requirement.id}/matches`)}
              >
                View Matches
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
