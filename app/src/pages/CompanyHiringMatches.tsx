import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadCompanyAccount, type CompanyAccount } from "../data/company";
import { getRequirement, type HiringRequirement } from "../data/hiring";
import { MOCK_CANDIDATES } from "../data/candidates";
import { rankCandidates, MATCH_THRESHOLD, type CandidateMatch } from "../data/matching";

const RECOMMENDED_THRESHOLD = 75;

type ScoreFilter = "all" | "80" | "90";
type SortMode = "score" | "recent" | "projects";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CandidateCard({ match, requirementId }: { match: CandidateMatch; requirementId: string }) {
  const navigate = useNavigate();
  const { candidate, score, explanation } = match;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-500 text-sm font-semibold text-white">
          {initials(candidate.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy-500">{candidate.name}</p>
          <p className="text-sm text-navy-500/60">{candidate.headline}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-brand-600">{score}%</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-navy-500/40">Match</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {candidate.skills.slice(0, 5).map((skill) => (
          <span key={skill} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600">
            {skill}
          </span>
        ))}
      </div>

      <p className="text-xs text-navy-500/50">
        {candidate.projects.length} Project{candidate.projects.length === 1 ? "" : "s"} · {candidate.courseName}
      </p>

      {explanation.highlights.length > 0 && (
        <p className="text-xs leading-relaxed text-navy-500/60">
          {explanation.highlights.slice(0, 2).join(" · ")}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        className="!w-auto"
        onClick={() => navigate(`/company/hiring/${requirementId}/candidates/${candidate.id}`)}
      >
        View Profile
      </Button>
    </div>
  );
}

export default function CompanyHiringMatches() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [requirement, setRequirement] = useState<HiringRequirement | null>(null);
  const [checked, setChecked] = useState(false);

  const [tab, setTab] = useState<"recommended" | "all">("recommended");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [skillFilter, setSkillFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [workModeFilter, setWorkModeFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score");

  useEffect(() => {
    const acct = loadCompanyAccount();
    if (!acct || acct.verificationStatus !== "verified") {
      navigate("/company/signup", { replace: true });
      return;
    }
    setAccount(acct);
    if (id) {
      const req = getRequirement(id, acct.id);
      // Candidate matching only exists for published requirements.
      if (req && req.status === "draft") {
        navigate(`/company/hiring/${id}/edit`, { replace: true });
        return;
      }
      setRequirement(req);
    }
    setChecked(true);
  }, [id, navigate]);

  const ranked = useMemo(() => {
    if (!requirement) return [];
    return rankCandidates(requirement, MOCK_CANDIDATES);
  }, [requirement]);

  const matchedCount = ranked.filter((m) => m.score >= MATCH_THRESHOLD).length;

  const locations = useMemo(() => [...new Set(MOCK_CANDIDATES.map((c) => c.location))], []);
  const skillOptions = useMemo(() => {
    if (!requirement) return [];
    return [...new Set([...requirement.requiredSkills, ...requirement.preferredSkills])];
  }, [requirement]);

  const filtered = useMemo(() => {
    let list = ranked;
    if (tab === "recommended") list = list.filter((m) => m.score >= RECOMMENDED_THRESHOLD);
    if (scoreFilter === "80") list = list.filter((m) => m.score >= 80);
    if (scoreFilter === "90") list = list.filter((m) => m.score >= 90);
    if (skillFilter !== "all") {
      list = list.filter((m) => m.candidate.skills.some((s) => s.toLowerCase() === skillFilter.toLowerCase()));
    }
    if (locationFilter !== "all") list = list.filter((m) => m.candidate.location === locationFilter);
    if (workModeFilter !== "all") list = list.filter((m) => m.candidate.workMode === workModeFilter);

    const sorted = [...list];
    if (sortMode === "score") sorted.sort((a, b) => b.score - a.score);
    else if (sortMode === "recent")
      sorted.sort((a, b) => b.candidate.lastActivityAt.localeCompare(a.candidate.lastActivityAt));
    else if (sortMode === "projects") sorted.sort((a, b) => b.candidate.projects.length - a.candidate.projects.length);
    return sorted;
  }, [ranked, tab, scoreFilter, skillFilter, locationFilter, workModeFilter, sortMode]);

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

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={account.companyName} />

      <main className="mx-auto max-w-[1200px] px-6 py-10 sm:px-10">
        <BackLink to="/company/hiring" label="Back to Hiring Requirements" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">{account.companyName}</p>
            <h1 className="mt-0.5 text-2xl font-semibold text-navy-500">{requirement.title || "Untitled role"}</h1>
            <span className="mt-1.5 inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-success">
              Published
            </span>
          </div>
          <p className="text-sm text-navy-500/60">
            {matchedCount} candidate{matchedCount === 1 ? "" : "s"} matched
          </p>
        </div>

        <p className="mt-4 rounded-lg bg-brand-50 px-3.5 py-2.5 text-xs font-medium text-brand-700">
          AI-assisted match — based on available student data. This ranking is a discovery aid; the hiring decision
          is yours.
        </p>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("recommended")}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === "recommended" ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-navy-500"
            }`}
          >
            Recommended
          </button>
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === "all" ? "bg-brand-500 text-white" : "border border-slate-200 bg-white text-navy-500"
            }`}
          >
            All Candidates
          </button>
        </div>

        {/* Filters + sort */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value as ScoreFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 outline-none focus:border-brand-500"
          >
            <option value="all">All Match Scores</option>
            <option value="80">80%+ Match</option>
            <option value="90">90%+ Match</option>
          </select>

          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 outline-none focus:border-brand-500"
          >
            <option value="all">All Skills</option>
            {skillOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 outline-none focus:border-brand-500"
          >
            <option value="all">All Locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <select
            value={workModeFilter}
            onChange={(e) => setWorkModeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 outline-none focus:border-brand-500"
          >
            <option value="all">All Work Modes</option>
            <option value="On-site">On-site</option>
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 outline-none focus:border-brand-500"
          >
            <option value="score">Sort: Match Score</option>
            <option value="recent">Sort: Recently Completed</option>
            <option value="projects">Sort: Relevant Projects</option>
          </select>
        </div>

        {/* Candidate grid */}
        {filtered.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-medium text-navy-500">No strong matches yet.</p>
            <p className="text-sm text-navy-500/60">
              Try adjusting the requirement or reviewing your required skills.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filtered.map((match) => (
              <CandidateCard key={match.candidate.id} match={match} requirementId={requirement.id} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
