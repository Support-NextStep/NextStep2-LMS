import { useNavigate } from "react-router-dom";
import type { HiringRequirement, HiringStatus } from "../data/hiring";
import { MOCK_CANDIDATES } from "../data/candidates";
import { rankCandidates, MATCH_THRESHOLD } from "../data/matching";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function statusLabel(status: HiringStatus): string {
  if (status === "draft") return "Draft";
  if (status === "published") return "Published";
  return "Closed";
}

export function statusBadgeClass(status: HiringStatus): string {
  if (status === "draft") return "bg-slate-100 text-navy-500/60";
  if (status === "published") return "bg-success/10 text-success";
  return "bg-error/10 text-error";
}

export default function RequirementCard({ requirement }: { requirement: HiringRequirement }) {
  const navigate = useNavigate();
  const isDraft = requirement.status === "draft";
  const isPublished = requirement.status === "published";

  // Candidate matching only exists for published requirements — never
  // compute or show a match count for drafts.
  const matchedCount = isPublished
    ? rankCandidates(requirement, MOCK_CANDIDATES).filter((m) => m.score >= MATCH_THRESHOLD).length
    : 0;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-navy-500">{requirement.title || "Untitled role"}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(requirement.status)}`}>
            {statusLabel(requirement.status)}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-navy-500/60">
          {[requirement.location, requirement.workMode].filter(Boolean).join(" · ") || "Location not set"}
        </p>
        {requirement.requiredSkills.length > 0 && (
          <p className="mt-1 text-xs text-navy-500/45">{requirement.requiredSkills.join(" · ")}</p>
        )}
        <p className="mt-1 text-xs text-navy-500/45">
          Created {formatDate(requirement.createdAt)}
          {isPublished ? ` · ${matchedCount} candidates matched (demo)` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(`/company/hiring/${requirement.id}`)}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-navy-500 hover:bg-slate-50"
        >
          View
        </button>
        <button
          type="button"
          onClick={() => navigate(`/company/hiring/${requirement.id}/edit`)}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-navy-500 hover:bg-slate-50"
        >
          Edit
        </button>
        {isDraft && (
          <button
            type="button"
            onClick={() => navigate(`/company/hiring/${requirement.id}/review`)}
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Publish
          </button>
        )}
        {isPublished && (
          <button
            type="button"
            onClick={() => navigate(`/company/hiring/${requirement.id}/matches`)}
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            View Matches
          </button>
        )}
      </div>
    </div>
  );
}
