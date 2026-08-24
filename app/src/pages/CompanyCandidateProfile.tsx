import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadCompanyAccount, type CompanyAccount } from "../data/company";
import { getRequirement, type HiringRequirement } from "../data/hiring";
import { MOCK_CANDIDATES, type MockCandidate } from "../data/candidates";
import { matchCandidate, type MatchBreakdown } from "../data/matching";
import { downloadMockResume } from "../data/resume";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-navy-500">{label}</span>
        <span className="font-semibold text-navy-500">{value}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 py-6 last:border-b-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/50">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function CompanyCandidateProfile() {
  const navigate = useNavigate();
  const { id, candidateId } = useParams<{ id: string; candidateId: string }>();
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

  const candidate: MockCandidate | undefined = MOCK_CANDIDATES.find((c) => c.id === candidateId);

  if (!requirement || !candidate) {
    return (
      <div className="min-h-screen bg-[#f4f7fc]">
        <CompanyHeader companyName={account.companyName} />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="font-medium text-navy-500">Candidate not found.</p>
          <Button type="button" className="!w-auto mt-4" onClick={() => navigate(`/company/hiring/${id}/matches`)}>
            Back to Matches
          </Button>
        </main>
      </div>
    );
  }

  const match = matchCandidate(requirement, candidate);
  const breakdownRows: { label: string; key: keyof MatchBreakdown }[] = [
    { label: "Skill Match", key: "skillMatch" },
    { label: "Project Match", key: "projectMatch" },
    { label: "Course Alignment", key: "courseAlignment" },
    { label: "Assessment Alignment", key: "assessmentAlignment" },
    { label: "Experience Alignment", key: "experienceAlignment" },
    { label: "Location / Work Mode", key: "locationWorkMode" },
  ];

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={account.companyName} />

      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <BackLink to={`/company/hiring/${requirement.id}/matches`} label="Back to Matches" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy-500 text-lg font-semibold text-white">
              {initials(candidate.name)}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-navy-500">{candidate.name}</h1>
              <p className="text-sm text-navy-500/60">{candidate.headline}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/portfolio/view" target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary" className="!w-auto">
                View Portfolio
              </Button>
            </a>
            <Button type="button" className="!w-auto" onClick={() => downloadMockResume(candidate)}>
              Download Resume
            </Button>
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-navy-500/60">
          This profile shows information the candidate has made available for employer discovery. It is read-only.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 sm:px-8">
          <Section title="About">
            <p className="text-sm leading-relaxed text-navy-500/70">{candidate.about}</p>
          </Section>

          <Section title="Skills">
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((s) => (
                <span key={s} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-600">
                  {s}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Projects">
            <div className="flex flex-col gap-4">
              {candidate.projects.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-100 p-4">
                  <p className="font-semibold text-navy-500">{p.title}</p>
                  <p className="mt-1 text-sm text-navy-500/70">{p.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.technologies.map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-navy-500/60">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Learning">
            <p className="text-sm font-medium text-navy-500">
              {candidate.courseName} {candidate.courseComplete ? "— Completed" : "— In Progress"}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {candidate.completedSubjects.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm text-navy-500/70">
                  <span className="text-success">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </Section>

          {candidate.achievements.length > 0 && (
            <Section title="Achievements">
              <ul className="flex flex-col gap-1.5">
                {candidate.achievements.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-navy-500/70">
                    <span className="text-brand-500">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="AI Match Analysis">
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-brand-600">{match.score}%</p>
              <p className="text-sm font-medium text-navy-500/60">Match</p>
            </div>
            <p className="mt-1 text-xs text-navy-500/50">
              AI-assisted match, based on available student data — not a hiring recommendation.
            </p>

            <div className="mt-5 flex flex-col gap-4">
              {breakdownRows.map((row) => (
                <BreakdownRow key={row.key} label={row.label} value={match.breakdown[row.key]} />
              ))}
            </div>

            <p className="mt-6 text-sm font-semibold text-navy-500">Why this matched</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {match.explanation.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-navy-500/70">
                  <span className="text-success">✓</span>
                  {h}
                </li>
              ))}
            </ul>

            {match.explanation.gaps.length > 0 && (
              <>
                <p className="mt-4 text-sm font-semibold text-navy-500">Potential gaps</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {match.explanation.gaps.map((g) => (
                    <li key={g} className="flex items-start gap-2 text-sm text-navy-500/60">
                      <span className="text-warning">△</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        </div>
      </main>
    </div>
  );
}
