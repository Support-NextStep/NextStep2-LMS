// ---------------------------------------------------------------------------
// Candidate Matching engine.
//
// Deterministic, explainable, rule-based scoring — NOT an LLM call. Given the
// same HiringRequirement and candidate, this always produces the same score,
// so companies can trust and audit it. See each dimension's comment for
// exactly what it measures and how it degrades gracefully when a dimension's
// data isn't available (never crashes, never fabricates a score).
//
// Architecture note (see task spec's "AI Architecture" section): this file is
// the "deterministic matching" stage. A later stage could add an AI-generated
// natural-language explanation on TOP of these numbers, but the numbers
// themselves must stay independent of any external AI API — this module has
// no network calls and never will.
// ---------------------------------------------------------------------------

import type { HiringRequirement } from "./hiring";
import type { MockCandidate, CandidateProject } from "./candidates";

export type MatchBreakdown = {
  /** Each is a 0-100 percentage WITHIN its own dimension (not weighted). */
  skillMatch: number;
  projectMatch: number;
  courseAlignment: number;
  assessmentAlignment: number;
  experienceAlignment: number;
  locationWorkMode: number;
};

export type MatchExplanation = {
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  relevantProjects: CandidateProject[];
  matchedSubjects: string[];
  highlights: string[]; // "✓ ..." lines
  gaps: string[]; // "△ ..." lines
};

export type CandidateMatch = {
  candidate: MockCandidate;
  score: number; // 0-100 overall
  breakdown: MatchBreakdown;
  explanation: MatchExplanation;
};

// Dimension weights — see task spec section 6. Sum to 100.
const WEIGHTS = {
  requiredSkills: 40,
  preferredSkills: 15,
  projects: 15,
  course: 10,
  assessment: 10,
  experience: 5,
  locationWorkMode: 5,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Maps a skill keyword to the course subject(s) most likely to teach it. */
const SKILL_TO_SUBJECT: Record<string, string[]> = {
  react: ["Frontend Development"],
  javascript: ["Frontend Development", "Web & Programming Foundations"],
  html: ["Web & Programming Foundations"],
  css: ["Web & Programming Foundations"],
  redux: ["Frontend Development"],
  vue: ["Frontend Development"],
  angular: ["Frontend Development"],
  "node.js": ["Backend & API Development"],
  express: ["Backend & API Development"],
  rest: ["Backend & API Development"],
  graphql: ["Backend & API Development"],
  sql: ["Database & Data Management"],
  postgresql: ["Database & Data Management"],
  mongodb: ["Database & Data Management"],
};

function subjectsRelevantToSkills(skills: string[]): string[] {
  const subjects = new Set<string>();
  for (const skill of skills) {
    const mapped = SKILL_TO_SUBJECT[normalize(skill)];
    mapped?.forEach((s) => subjects.add(s));
  }
  return [...subjects];
}

/** Parses experience level strings like "0–2 years" / "5+ years" into a [min, max] range. */
function parseExperienceRange(level: string): [number, number] | null {
  const cleaned = level.trim();
  if (!cleaned) return null;
  const plusMatch = cleaned.match(/(\d+)\s*\+/);
  if (plusMatch) return [Number(plusMatch[1]), Infinity];
  const rangeMatch = cleaned.match(/(\d+)\s*[–\-to]+\s*(\d+)/);
  if (rangeMatch) return [Number(rangeMatch[1]), Number(rangeMatch[2])];
  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) return [0, Number(singleMatch[1])];
  return null; // e.g. "Entry-level" — no numeric signal, handled by caller
}

function scoreRequiredSkills(requirement: HiringRequirement, candidate: MockCandidate) {
  const candidateSkills = new Set(candidate.skills.map(normalize));
  const required = requirement.requiredSkills;
  if (required.length === 0) {
    // No required skills specified on the requirement — nothing to fail against.
    return { ratio: 1, matched: [] as string[], missing: [] as string[] };
  }
  const matched = required.filter((s) => candidateSkills.has(normalize(s)));
  const missing = required.filter((s) => !candidateSkills.has(normalize(s)));
  return { ratio: matched.length / required.length, matched, missing };
}

function scorePreferredSkills(requirement: HiringRequirement, candidate: MockCandidate) {
  const candidateSkills = new Set(candidate.skills.map(normalize));
  const preferred = requirement.preferredSkills;
  if (preferred.length === 0) {
    // Nothing preferred was asked for — don't penalize for missing what wasn't requested.
    return { ratio: 1, matched: [] as string[] };
  }
  const matched = preferred.filter((s) => candidateSkills.has(normalize(s)));
  return { ratio: matched.length / preferred.length, matched };
}

function scoreProjects(requirement: HiringRequirement, candidate: MockCandidate) {
  const relevantSkillSet = new Set(
    [...requirement.requiredSkills, ...requirement.preferredSkills].map(normalize)
  );
  const relevant = candidate.projects.filter((p) =>
    p.technologies.some((t) => relevantSkillSet.has(normalize(t)))
  );
  if (relevantSkillSet.size === 0) {
    // Requirement lists no skills to match projects against — judge by having
    // any projects at all, since that still signals hands-on practice.
    const ratio = Math.min(candidate.projects.length / 2, 1);
    return { ratio, relevant: candidate.projects.slice(0, 2) };
  }
  // 2+ relevant projects is treated as a full-strength signal.
  const ratio = Math.min(relevant.length / 2, 1);
  return { ratio, relevant };
}

function scoreCourseAlignment(requirement: HiringRequirement, candidate: MockCandidate) {
  const relevantSubjects = subjectsRelevantToSkills([
    ...requirement.requiredSkills,
    ...requirement.preferredSkills,
  ]);
  if (relevantSubjects.length === 0) {
    // No subject mapping available for this requirement's skills — fall back
    // to overall course completion as the best available signal.
    return { ratio: candidate.courseComplete ? 1 : candidate.completedSubjects.length > 0 ? 0.5 : 0, matched: candidate.completedSubjects };
  }
  const completed = new Set(candidate.completedSubjects);
  const matched = relevantSubjects.filter((s) => completed.has(s));
  return { ratio: matched.length / relevantSubjects.length, matched };
}

function scoreAssessment(candidate: MockCandidate) {
  const avg = candidate.performance.averageScore;
  if (avg === null) {
    // No scoreable activity yet — neutral baseline rather than penalizing to zero.
    return { ratio: 0.5, hasData: false };
  }
  return { ratio: avg / 100, hasData: true };
}

function scoreExperience(requirement: HiringRequirement, candidate: MockCandidate) {
  const range = parseExperienceRange(requirement.experienceLevel);
  if (!range) {
    // Requirement didn't specify a parsable experience range — don't penalize.
    return { ratio: 1, withinRange: true };
  }
  const [min, max] = range;
  if (candidate.experienceYears >= min && candidate.experienceYears <= max) {
    return { ratio: 1, withinRange: true };
  }
  // Graceful falloff: 1 year outside the range still scores reasonably.
  const distance = candidate.experienceYears < min ? min - candidate.experienceYears : candidate.experienceYears - max;
  return { ratio: Math.max(0, 1 - distance * 0.3), withinRange: false };
}

function scoreLocationWorkMode(requirement: HiringRequirement, candidate: MockCandidate) {
  const locationSpecified = requirement.location.trim().length > 0;
  const workModeSpecified = requirement.workMode.trim().length > 0;

  const locationMatches =
    !locationSpecified ||
    requirement.workMode === "Remote" ||
    normalize(requirement.location) === normalize(candidate.location);
  const workModeMatches =
    !workModeSpecified || requirement.workMode === candidate.workMode || candidate.workMode === "Hybrid";

  const parts = [locationSpecified ? locationMatches : true, workModeSpecified ? workModeMatches : true];
  const ratio = parts.filter(Boolean).length / parts.length;
  return { ratio, locationMatches, workModeMatches };
}

export function matchCandidate(requirement: HiringRequirement, candidate: MockCandidate): CandidateMatch {
  const required = scoreRequiredSkills(requirement, candidate);
  const preferred = scorePreferredSkills(requirement, candidate);
  const projects = scoreProjects(requirement, candidate);
  const course = scoreCourseAlignment(requirement, candidate);
  const assessment = scoreAssessment(candidate);
  const experience = scoreExperience(requirement, candidate);
  const locationWorkMode = scoreLocationWorkMode(requirement, candidate);

  const weightedTotal =
    required.ratio * WEIGHTS.requiredSkills +
    preferred.ratio * WEIGHTS.preferredSkills +
    projects.ratio * WEIGHTS.projects +
    course.ratio * WEIGHTS.course +
    assessment.ratio * WEIGHTS.assessment +
    experience.ratio * WEIGHTS.experience +
    locationWorkMode.ratio * WEIGHTS.locationWorkMode;

  const score = Math.round(Math.max(0, Math.min(100, weightedTotal)));

  const breakdown: MatchBreakdown = {
    skillMatch: Math.round(((required.ratio * WEIGHTS.requiredSkills + preferred.ratio * WEIGHTS.preferredSkills) / (WEIGHTS.requiredSkills + WEIGHTS.preferredSkills)) * 100),
    projectMatch: Math.round(projects.ratio * 100),
    courseAlignment: Math.round(course.ratio * 100),
    assessmentAlignment: Math.round(assessment.ratio * 100),
    experienceAlignment: Math.round(experience.ratio * 100),
    locationWorkMode: Math.round(locationWorkMode.ratio * 100),
  };

  const highlights: string[] = [];
  const gaps: string[] = [];

  required.matched.forEach((s) => highlights.push(`${s} — required skill`));
  required.missing.forEach((s) => gaps.push(`Missing required skill: ${s}`));
  preferred.matched.forEach((s) => highlights.push(`${s} — preferred skill`));

  if (projects.relevant.length > 0) {
    highlights.push(
      `Built ${projects.relevant.length} relevant project${projects.relevant.length === 1 ? "" : "s"}`
    );
  } else {
    gaps.push("No directly relevant projects found");
  }

  if (course.matched.length > 0) {
    highlights.push(`Completed ${course.matched.join(", ")}`);
  }

  if (assessment.hasData) {
    if (assessment.ratio >= 0.8) highlights.push("Strong assessment performance");
    else if (assessment.ratio >= 0.6) highlights.push("Solid assessment performance");
    else gaps.push("Assessment performance below average");
  } else {
    gaps.push("No assessment data recorded yet");
  }

  if (!experience.withinRange) {
    gaps.push(
      candidate.experienceYears === 0
        ? "No professional experience recorded"
        : "Experience level differs from what was requested"
    );
  }

  if (locationWorkMode.locationMatches && locationWorkMode.workModeMatches) {
    highlights.push("Matches location and work mode preferences");
  } else if (!locationWorkMode.locationMatches) {
    gaps.push("Located outside the requirement's specified location");
  } else if (!locationWorkMode.workModeMatches) {
    gaps.push("Work mode preference differs from the requirement");
  }

  return {
    candidate,
    score,
    breakdown,
    explanation: {
      matchedRequiredSkills: required.matched,
      missingRequiredSkills: required.missing,
      matchedPreferredSkills: preferred.matched,
      relevantProjects: projects.relevant,
      matchedSubjects: course.matched,
      highlights,
      gaps,
    },
  };
}

/** Ranks every mock candidate against one requirement, highest match first. */
export function rankCandidates(requirement: HiringRequirement, candidates: MockCandidate[]): CandidateMatch[] {
  return candidates
    .map((c) => matchCandidate(requirement, c))
    .sort((a, b) => b.score - a.score);
}

/** Threshold used consistently wherever a "matched candidates" count is shown. */
export const MATCH_THRESHOLD = 50;
