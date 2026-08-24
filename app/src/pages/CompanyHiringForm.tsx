import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import FormField from "../components/FormField";
import Button from "../components/Button";
import {
  loadCompanyAccount,
  loadCompanyProfile,
  type CompanyAccount,
} from "../data/company";
import {
  createRequirement,
  emptyDraft,
  getRequirement,
  mockAIAssist,
  updateRequirement,
  type HiringRequirementDraft,
} from "../data/hiring";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Internship", "Contract"];
const WORK_MODES = ["On-site", "Remote", "Hybrid"];

function toLines(value: string[]): string {
  return value.join("\n");
}
function fromLines(value: string): string[] {
  return value
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}
function toCsv(value: string[]): string {
  return value.join(", ");
}
function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function CompanyHiringForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [draft, setDraft] = useState<HiringRequirementDraft>(emptyDraft());
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState<"draft" | "review" | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiApplied, setAiApplied] = useState(false);

  useEffect(() => {
    const acct = loadCompanyAccount();
    if (!acct || acct.verificationStatus !== "verified") {
      navigate("/company/signup", { replace: true });
      return;
    }
    setAccount(acct);

    if (id) {
      const existing = getRequirement(id, acct.id);
      if (!existing) {
        setNotFound(true);
        setChecked(true);
        return;
      }
      setDraft(existing);
      setAiApplied(existing.aiAssisted);
    } else {
      const profile = loadCompanyProfile();
      // Nothing profile-specific is required on the requirement, but this
      // keeps the door open for defaults later without coupling the models.
      void profile;
    }
    setChecked(true);
  }, [id, navigate]);

  function handleAiAssist() {
    if (!aiText.trim()) return;
    const suggestion = mockAIAssist(aiText);
    setDraft((d) => ({ ...d, ...suggestion }));
    setAiApplied(true);
  }

  function validate(): boolean {
    if (!draft.title.trim()) {
      setTitleError("Job title is required.");
      return false;
    }
    setTitleError(undefined);
    return true;
  }

  function persist(): string | null {
    if (!account) return null;
    if (isEdit && id) {
      const updated = updateRequirement(id, account.id, draft);
      return updated?.id ?? null;
    }
    const created = createRequirement(account.id, draft);
    return created.id;
  }

  function handleSaveDraft() {
    if (!validate()) return;
    setSaving("draft");
    setTimeout(() => {
      const savedId = persist();
      setSaving(null);
      if (savedId) navigate("/company/dashboard");
    }, 500);
  }

  function handleContinueToReview() {
    if (!validate()) return;
    setSaving("review");
    setTimeout(() => {
      const savedId = persist();
      setSaving(null);
      if (savedId) navigate(`/company/hiring/${savedId}/review`);
    }, 500);
  }

  if (!checked || !account) return null;

  if (notFound) {
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

      <main className="mx-auto max-w-[1150px] px-6 py-10 sm:px-10">
        <BackLink
          to={isEdit ? `/company/hiring/${id}` : "/company/hiring"}
          label={isEdit ? "Back to Requirement" : "Back to Hiring Requirements"}
        />

        <h1 className="mt-4 text-2xl font-semibold text-navy-500">
          {isEdit ? "Edit Hiring Requirement" : "Create a Hiring Requirement"}
        </h1>
        <p className="mt-1.5 text-sm text-navy-500/60">
          Tell us what you're looking for. You can refine everything before publishing.
        </p>

        {/* AI Assist */}
        <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50/50 p-5">
          {!aiOpen ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-navy-500">Not sure how to structure your requirement?</p>
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3.5 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50"
              >
                ✨ Help me create this requirement
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-navy-500">AI Assist</p>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={2}
                placeholder="e.g. We need a junior React developer with JavaScript and basic Node.js knowledge. The person should be able to work from Coimbatore."
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
              <div className="flex items-center gap-2">
                <Button type="button" className="!w-auto" onClick={handleAiAssist}>
                  Generate suggestions
                </Button>
                <button
                  type="button"
                  onClick={() => setAiOpen(false)}
                  className="text-sm font-medium text-navy-500/60 hover:text-navy-500"
                >
                  Cancel
                </button>
              </div>
              {aiApplied && (
                <p className="rounded-lg bg-brand-100/60 px-3 py-2 text-xs font-medium text-brand-700">
                  AI-generated suggestions — review before publishing.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          {/* Basic Information */}
          <section className="flex flex-col gap-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/50">Basic Information</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                label="Job Title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Junior React Developer"
                error={titleError}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-navy-500">Employment Type</label>
                <select
                  value={draft.employmentType}
                  onChange={(e) => setDraft((d) => ({ ...d, employmentType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-navy-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                >
                  <option value="">Select type</option>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                label="Experience Level"
                value={draft.experienceLevel}
                onChange={(e) => setDraft((d) => ({ ...d, experienceLevel: e.target.value }))}
                placeholder="e.g. 0–2 years"
              />
              <FormField
                label="Location"
                value={draft.location}
                onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                placeholder="e.g. Coimbatore"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-navy-500">Work Mode</label>
                <select
                  value={draft.workMode}
                  onChange={(e) => setDraft((d) => ({ ...d, workMode: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-navy-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                >
                  <option value="">Select mode</option>
                  {WORK_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                label="Salary Range"
                value={draft.salaryRange ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, salaryRange: e.target.value }))}
                placeholder="e.g. ₹4–6 LPA (optional)"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-navy-500">Job Description</label>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={4}
                placeholder="Describe the role and what the team does."
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
          </section>

          {/* Skills */}
          <section className="flex flex-col gap-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/50">Skills</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                label="Required Skills"
                value={toCsv(draft.requiredSkills)}
                onChange={(e) => setDraft((d) => ({ ...d, requiredSkills: fromCsv(e.target.value) }))}
                placeholder="React, JavaScript"
                hint="Comma-separated"
              />
              <FormField
                label="Preferred Skills"
                value={toCsv(draft.preferredSkills)}
                onChange={(e) => setDraft((d) => ({ ...d, preferredSkills: fromCsv(e.target.value) }))}
                placeholder="Node.js"
                hint="Comma-separated"
              />
            </div>
          </section>

          {/* Role Details */}
          <section className="flex flex-col gap-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/50">Role Details</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-navy-500">Responsibilities</label>
                <textarea
                  value={toLines(draft.responsibilities)}
                  onChange={(e) => setDraft((d) => ({ ...d, responsibilities: fromLines(e.target.value) }))}
                  rows={4}
                  placeholder="One responsibility per line"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-navy-500">Qualifications</label>
                <textarea
                  value={toLines(draft.qualifications)}
                  onChange={(e) => setDraft((d) => ({ ...d, qualifications: fromLines(e.target.value) }))}
                  rows={4}
                  placeholder="One qualification per line"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="!w-auto"
              loading={saving === "draft"}
              onClick={handleSaveDraft}
            >
              Save Draft
            </Button>
            <Button type="button" className="!w-auto" loading={saving === "review"} onClick={handleContinueToReview}>
              Continue to Review
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
