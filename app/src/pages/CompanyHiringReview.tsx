import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadCompanyAccount, type CompanyAccount } from "../data/company";
import { getRequirement, publishRequirement, type HiringRequirement } from "../data/hiring";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-6 last:border-b-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/50">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-navy-500/40">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600">
          {item}
        </span>
      ))}
    </div>
  );
}

export default function CompanyHiringReview() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [requirement, setRequirement] = useState<HiringRequirement | null>(null);
  const [checked, setChecked] = useState(false);
  const [publishing, setPublishing] = useState(false);

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

  function handlePublish() {
    if (!account || !id) return;
    setPublishing(true);
    setTimeout(() => {
      const updated = publishRequirement(id, account.id);
      setPublishing(false);
      if (updated) navigate(`/company/hiring/${updated.id}`);
    }, 500);
  }

  if (!checked || !account) return null;

  if (!requirement) {
    return (
      <div className="min-h-screen bg-[#f4f7fc]">
        <CompanyHeader companyName={account.companyName} />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="font-medium text-navy-500">Requirement not found.</p>
          <Button type="button" className="!w-auto mt-4" onClick={() => navigate("/company/dashboard")}>
            Back to Dashboard
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={account.companyName} />

      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <BackLink to={`/company/hiring/${requirement.id}/edit`} label="Back to Edit Requirement" />

        <h1 className="mt-4 text-2xl font-semibold text-navy-500">Review Requirement</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">Review your requirement carefully before publishing.</p>

        {requirement.aiAssisted && (
          <p className="mt-4 rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-700">
            AI-generated suggestions — review before publishing.
          </p>
        )}

        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 sm:px-8">
          <Section title="Role Overview">
            <h3 className="text-lg font-semibold text-navy-500">{requirement.title || "Untitled role"}</h3>
            <p className="mt-2 text-sm leading-relaxed text-navy-500/70">
              {requirement.description || "No description provided."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-navy-500/60">
              {requirement.employmentType && <span>{requirement.employmentType}</span>}
              {requirement.experienceLevel && <span>· {requirement.experienceLevel}</span>}
              {requirement.salaryRange && <span>· {requirement.salaryRange}</span>}
            </div>
          </Section>

          <Section title="Work Details">
            <p className="text-sm text-navy-500/70">
              {[requirement.location, requirement.workMode].filter(Boolean).join(" · ") || "Not specified"}
            </p>
          </Section>

          <Section title="Required Skills">
            <TagList items={requirement.requiredSkills} empty="No required skills listed." />
          </Section>

          <Section title="Preferred Skills">
            <TagList items={requirement.preferredSkills} empty="No preferred skills listed." />
          </Section>

          <Section title="Responsibilities">
            {requirement.responsibilities.length ? (
              <ul className="flex flex-col gap-1.5 text-sm text-navy-500/70">
                {requirement.responsibilities.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="text-brand-500">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-navy-500/40">No responsibilities listed.</p>
            )}
          </Section>

          <Section title="Qualifications">
            {requirement.qualifications.length ? (
              <ul className="flex flex-col gap-1.5 text-sm text-navy-500/70">
                {requirement.qualifications.map((q) => (
                  <li key={q} className="flex gap-2">
                    <span className="text-brand-500">•</span>
                    {q}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-navy-500/40">No qualifications listed.</p>
            )}
          </Section>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            className="!w-auto"
            onClick={() => navigate(`/company/hiring/${requirement.id}/edit`)}
          >
            Back to Edit
          </Button>
          <Button
            type="button"
            className="!w-auto"
            loading={publishing}
            disabled={requirement.status === "published"}
            onClick={handlePublish}
          >
            {requirement.status === "published" ? "Already Published" : "Publish Requirement"}
          </Button>
        </div>
      </main>
    </div>
  );
}
