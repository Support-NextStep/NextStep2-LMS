// ---------------------------------------------------------------------------
// Hiring Requirement data model.
//
// Deliberately separate from CompanyProfile (company.ts) — a profile is
// "who is this company", a requirement is "what role are they hiring for".
// Kept as plain load/save functions over a single localStorage array,
// mirroring the portfolio.ts / company.ts precedent. Every requirement is
// scoped by companyId so one company's data can never leak into another's.
// ---------------------------------------------------------------------------

export type HiringStatus = "draft" | "published" | "closed";

export type HiringRequirement = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  employmentType: string;
  experienceLevel: string;
  location: string;
  workMode: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  salaryRange?: string;
  status: HiringStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  aiAssisted: boolean;
  /** Always 0 for now — candidate matching is not implemented yet. */
  candidatesMatched: number;
};

export type HiringRequirementDraft = Omit<
  HiringRequirement,
  "id" | "companyId" | "status" | "createdAt" | "updatedAt" | "publishedAt" | "candidatesMatched"
>;

const STORAGE_KEY = "nextstep2:hiringRequirements";

function loadAll(): HiringRequirement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HiringRequirement[]) : [];
  } catch {
    return [];
  }
}

function saveAll(list: HiringRequirement[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore write failures (e.g. private browsing) — edits just won't persist.
  }
}

export function loadRequirementsForCompany(companyId: string): HiringRequirement[] {
  return loadAll()
    .filter((r) => r.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getRequirement(id: string, companyId: string): HiringRequirement | null {
  return loadAll().find((r) => r.id === id && r.companyId === companyId) ?? null;
}

function generateId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRequirement(companyId: string, draft: HiringRequirementDraft): HiringRequirement {
  const now = new Date().toISOString();
  const requirement: HiringRequirement = {
    ...draft,
    id: generateId(),
    companyId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    candidatesMatched: 0,
  };
  const all = loadAll();
  all.push(requirement);
  saveAll(all);
  return requirement;
}

export function updateRequirement(
  id: string,
  companyId: string,
  patch: Partial<HiringRequirementDraft>
): HiringRequirement | null {
  const all = loadAll();
  const index = all.findIndex((r) => r.id === id && r.companyId === companyId);
  if (index === -1) return null;
  const updated: HiringRequirement = { ...all[index], ...patch, updatedAt: new Date().toISOString() };
  all[index] = updated;
  saveAll(all);
  return updated;
}

export function publishRequirement(id: string, companyId: string): HiringRequirement | null {
  const all = loadAll();
  const index = all.findIndex((r) => r.id === id && r.companyId === companyId);
  if (index === -1) return null;
  const now = new Date().toISOString();
  const updated: HiringRequirement = { ...all[index], status: "published", publishedAt: now, updatedAt: now };
  all[index] = updated;
  saveAll(all);
  return updated;
}

export function emptyDraft(): HiringRequirementDraft {
  return {
    title: "",
    description: "",
    employmentType: "",
    experienceLevel: "",
    location: "",
    workMode: "",
    requiredSkills: [],
    preferredSkills: [],
    responsibilities: [],
    qualifications: [],
    salaryRange: "",
    aiAssisted: false,
  };
}

// ---------------------------------------------------------------------------
// Mock AI Assist.
//
// Converts a free-text hiring description into structured draft fields using
// deterministic keyword matching — no external AI API. Output is always a
// *suggestion*: the caller must let the company review/edit before saving,
// and this function never publishes anything on its own.
// ---------------------------------------------------------------------------

const KNOWN_SKILLS = [
  "React", "JavaScript", "TypeScript", "Node.js", "Python", "Java", "SQL",
  "HTML", "CSS", "Angular", "Vue", "AWS", "Docker", "Kubernetes", "MongoDB",
  "Express", "Django", "Flutter", "Swift", "Kotlin", "PHP", "Ruby", "Go",
  "C++", "C#", "Redux", "GraphQL", "REST", "Git",
];

const BASIC_QUALIFIERS = ["basic", "some", "familiarity with", "a little"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMentionedSkills(text: string): { required: string[]; preferred: string[] } {
  const lower = text.toLowerCase();

  // Longer names first so "JavaScript" claims its span before the shorter
  // "Java" can false-positive-match inside it.
  const bySpecificity = [...KNOWN_SKILLS].sort((a, b) => b.length - a.length);
  const claimed: Array<[number, number]> = [];
  const classification = new Map<string, "required" | "preferred">();

  for (const skill of bySpecificity) {
    const pattern = new RegExp(`(?<![a-z])${escapeRegExp(skill.toLowerCase())}(?![a-z])`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower))) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = claimed.some(([s, e]) => start < e && end > s);
      if (overlaps) continue;
      claimed.push([start, end]);
      const windowStart = Math.max(0, start - 20);
      const before = lower.slice(windowStart, start);
      const isBasic = BASIC_QUALIFIERS.some((q) => before.includes(q));
      classification.set(skill, isBasic ? "preferred" : "required");
      break; // one mention per skill is enough to classify it
    }
  }

  // Report in the dictionary's natural order for stable, predictable output.
  const required = KNOWN_SKILLS.filter((s) => classification.get(s) === "required");
  const preferred = KNOWN_SKILLS.filter((s) => classification.get(s) === "preferred");
  return { required, preferred };
}

function guessExperienceLevel(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("junior") || lower.includes("fresher") || lower.includes("entry level")) return "0–2 years";
  if (lower.includes("senior")) return "5+ years";
  if (lower.includes("mid-level") || lower.includes("mid level")) return "2–5 years";
  return "Entry-level";
}

function guessWorkMode(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  return "On-site";
}

function guessLocation(text: string): string {
  const match = text.match(/(?:from|in|at)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/);
  return match ? match[1].replace(/[.,]$/, "") : "";
}

function guessLevelWord(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("junior")) return "Junior";
  if (lower.includes("senior")) return "Senior";
  if (lower.includes("mid-level") || lower.includes("mid level")) return "Mid-Level";
  return "";
}

export function mockAIAssist(text: string): HiringRequirementDraft {
  const { required, preferred } = findMentionedSkills(text);
  const experienceLevel = guessExperienceLevel(text);
  const workMode = guessWorkMode(text);
  const location = guessLocation(text);
  const levelWord = guessLevelWord(text);
  const primarySkill = required[0] ?? preferred[0] ?? "";

  const title = [levelWord, primarySkill, "Developer"].filter(Boolean).join(" ").trim() || "New Role";

  const skillsForCopy = required.length ? required.join(", ") : preferred.join(", ") || "the required stack";

  const description =
    `We're looking for a ${title.toLowerCase()} with experience in ${skillsForCopy}` +
    (location ? `, based in ${location}` : "") +
    (workMode ? ` (${workMode.toLowerCase()}).` : ".");

  const responsibilities = required.length
    ? [
        `Build and maintain features using ${required.join(", ")}`,
        "Collaborate with the product and design team",
        "Participate in code reviews and testing",
      ]
    : ["Build and maintain assigned features", "Collaborate with the product and design team"];

  const qualifications = required.length
    ? [`Working knowledge of ${required.join(", ")}`, "Strong problem-solving skills", "Good communication skills"]
    : ["Strong problem-solving skills", "Good communication skills"];

  return {
    title,
    description,
    employmentType: "Full-time",
    experienceLevel,
    location,
    workMode,
    requiredSkills: required,
    preferredSkills: preferred,
    responsibilities,
    qualifications,
    salaryRange: "",
    aiAssisted: true,
  };
}
