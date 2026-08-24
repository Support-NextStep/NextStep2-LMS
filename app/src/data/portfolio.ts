// ---------------------------------------------------------------------------
// Portfolio data model.
//
// Portfolio is a separate concept from Performance: Performance measures how
// a student did while learning (see performance.ts); Portfolio is what the
// student chooses to showcase professionally. This file owns that shape and
// its persistence only — it does not read or duplicate any performance data.
//
// Only ONE page (Portfolio.tsx) consumes this, so it's kept as plain
// load/save functions + local component state, rather than a second global
// Context provider alongside ProgressProvider.
// ---------------------------------------------------------------------------

export type PortfolioProfile = {
  name: string;
  headline: string;
  bio: string;
};

export type PortfolioSkillGroup = {
  category: string;
  skills: string[];
};

export type PortfolioProject = {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  projectUrl: string;
  githubUrl: string;
};

export type PortfolioLinks = {
  email: string;
  linkedin: string;
  github: string;
};

export type PortfolioData = {
  profile: PortfolioProfile;
  skills: PortfolioSkillGroup[];
  projects: PortfolioProject[];
  links: PortfolioLinks;
};

const STORAGE_KEY = "nextstep2:portfolio";

/**
 * A brand-new student's portfolio — intentionally empty everywhere except a
 * name, since that already exists as the student's identity elsewhere in the
 * app. No fabricated headline, skills, projects, or achievements.
 */
export function getDefaultPortfolio(studentName: string): PortfolioData {
  return {
    profile: { name: studentName, headline: "", bio: "" },
    skills: [],
    projects: [],
    links: { email: "", linkedin: "", github: "" },
  };
}

export function loadPortfolio(studentName: string): PortfolioData {
  if (typeof window === "undefined") return getDefaultPortfolio(studentName);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultPortfolio(studentName);
    const parsed = JSON.parse(raw) as PortfolioData;
    // Guard against a shape from an older/partial save.
    return {
      profile: { ...getDefaultPortfolio(studentName).profile, ...parsed.profile },
      skills: parsed.skills ?? [],
      projects: parsed.projects ?? [],
      links: { ...getDefaultPortfolio(studentName).links, ...parsed.links },
    };
  } catch {
    return getDefaultPortfolio(studentName);
  }
}

export function savePortfolio(data: PortfolioData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore write failures (e.g. private browsing) — edits just won't persist.
  }
}

export function createEmptyProject(): PortfolioProject {
  return {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    description: "",
    technologies: [],
    projectUrl: "",
    githubUrl: "",
  };
}
