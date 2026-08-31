import { apiGet, apiPost } from "./apiClient";

// Course/subject/session curriculum structure.
//
// Progress (which sessions/subjects/course are completed) is NOT stored as a
// static field here — it's derived at read time from the set of completed
// session ids tracked by ProgressProvider (see progress.tsx). This file only
// owns course *content* and *ordering*; every status/percentage below is
// computed from that one set, so completing a session updates Dashboard, My
// Course, Subject, and Session consistently from one source.
//
// PHASE 0: COURSE/SUBJECTS_BASE/SUBJECT_SESSIONS below start out as exactly
// the same hardcoded values this file has always had, and
// refreshCourseCatalogFromBackend() (bottom of this file) overwrites their
// CONTENTS in place with the real backend's data once it loads — see
// NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 5/15.
// Every function below keeps its exact synchronous signature; dozens of
// components call them directly during render, and Phase 0 deliberately
// does not convert all of those call sites to async. Mutating in place
// (never reassigning these bindings) means every consumer sees the
// backend's data on its very next call/render with zero code changes.

export const STUDENT = {
  name: "Jordan Smith",
};

export const COURSE = {
  // Stable id — this is the courseId a published Content Package's
  // course.json must match for its content to reach students (see
  // sessionContent.ts -> publishedContent.ts -> contentPackages.ts). Not
  // just a display value: SessionPage.tsx passes this into
  // getSessionContent() as the lookup key. Kept as the real hardcoded
  // value (not "") per the comment above — refreshCourseCatalogFromBackend()
  // overwrites this once the backend responds, but Content Author/Reviewer/
  // Admin routes don't all trigger that refresh (only ProgressProvider does),
  // so this must be usable standalone before any backend call resolves.
  id: "full-stack-web-development",
  title: "Full-Stack Web Development",
  description:
    "Learn industry-ready skills through structured learning, hands-on practice, assessment, and real exercises.",
};

export type SubjectStatus = "completed" | "in-progress" | "available" | "locked";

export type Subject = {
  id: string;
  title: string;
  description: string;
  status: SubjectStatus;
  /** Only meaningful for in-progress subjects — 0-100. */
  progress?: number;
};

type SubjectBase = { id: string; title: string; description: string };

const SUBJECTS_BASE: SubjectBase[] = [
  {
    id: "web-foundations",
    title: "Web & Programming Foundations",
    description: "Core programming concepts and how the web works.",
  },
  {
    id: "frontend-development",
    title: "Frontend Development",
    description: "Build interactive interfaces with React.",
  },
  {
    id: "backend-api",
    title: "Backend & API Development",
    description: "Design and build APIs that power real applications.",
  },
  {
    id: "database-management",
    title: "Database & Data Management",
    description: "Model, store, and query application data.",
  },
  {
    id: "fullstack-application",
    title: "Full-Stack Application Development",
    description: "Combine frontend and backend into one working product.",
  },
  {
    id: "industry-practice",
    title: "Project & Industry Practice",
    description: "Apply your skills to a real, portfolio-ready project.",
  },
];

export type SessionStatus = "completed" | "in-progress" | "available";

export type Session = {
  id: string;
  title: string;
  description: string;
  status: SessionStatus;
};

export type SubjectDetail = {
  subtitle: string;
  progress: number;
  sessions: Session[];
};

type SessionBase = { id: string; title: string; description: string };

// Fully detailed for the subject with curated content. Other subjects get a
// simple generated session list below, since real content isn't defined yet.
const SUBJECT_SESSIONS: Record<string, { subtitle: string; sessions: SessionBase[] }> = {
  "frontend-development": {
    subtitle:
      "Build interactive web interfaces and learn how modern frontend applications are developed.",
    sessions: [
      {
        id: "react-fundamentals",
        title: "React Fundamentals",
        description:
          "Understand components, props, state, and the fundamentals of building React applications.",
      },
      {
        id: "components-and-state",
        title: "HTML Forms",
        description: "Learn how to collect user input using HTML form elements.",
      },
      {
        id: "routing-and-forms",
        title: "React Routing & Forms",
        description: "Build multi-page experiences and handle user input.",
      },
      {
        id: "api-integration",
        title: "API Integration",
        description: "Connect frontend applications with backend APIs.",
      },
      {
        id: "frontend-project",
        title: "Frontend Project",
        description: "Apply your frontend skills in a practical project.",
      },
    ],
  },
};

function buildDefaultSessions(subject: SubjectBase): { subtitle: string; sessions: SessionBase[] } {
  // Simple generated placeholder for subjects without defined session content yet.
  // Ids are namespaced per subject so progress tracking never collides across subjects.
  return {
    subtitle: subject.description,
    sessions: Array.from({ length: 4 }, (_, i) => ({
      id: `${subject.id}-session-${i + 1}`,
      title: `Session ${i + 1}`,
      description: subject.description,
    })),
  };
}

function getSubjectSessions(subject: SubjectBase): { subtitle: string; sessions: SessionBase[] } {
  return SUBJECT_SESSIONS[subject.id] ?? buildDefaultSessions(subject);
}

// ---------------------------------------------------------------------------
// Content Team Session Authoring Workspace support (read-only lookups).
//
// The authoring workspace needs to let a Content Manager pick "which
// existing Course/Subject am I authoring a session for" without ever typing
// or seeing a raw id — these three read-only exports are the "existing
// curriculum structure" it picks from. They deliberately don't depend on
// completedSessionIds (progress is irrelevant to authoring) and never
// mutate anything.
// ---------------------------------------------------------------------------

export function listCourses(): { id: string; title: string; description: string }[] {
  if (!COURSE.id) return [];
  return [{ id: COURSE.id, title: COURSE.title, description: COURSE.description }];
}

export function listSubjectSummaries(): { id: string; title: string; description: string }[] {
  return SUBJECTS_BASE.map(({ id, title, description }) => ({ id, title, description }));
}

export function getSubjectSummary(subjectId: string): { id: string; title: string; description: string } | null {
  const subject = SUBJECTS_BASE.find((s) => s.id === subjectId);
  return subject ? { id: subject.id, title: subject.title, description: subject.description } : null;
}

/** Every session the real curriculum already defines for a subject (curated or generated) — the starting point for the Sessions list, before merging in anything only a content package/authored draft knows about. */
export function listSessionSummaries(subjectId: string): { id: string; title: string; description: string }[] {
  const subject = SUBJECTS_BASE.find((s) => s.id === subjectId);
  if (!subject) return [];
  return getSubjectSessions(subject).sessions;
}

/**
 * Seed progress for a first-time visitor — reproduces the baseline this
 * course was originally demoed with (Subject 01 completed, Subject 02
 * under way) instead of starting every student at a blank 0%. Derived from
 * the real session ids so it can't drift out of sync with the content above.
 */
export function getDefaultCompletedSessionIds(): string[] {
  const webFoundations = SUBJECTS_BASE.find((s) => s.id === "web-foundations");
  const frontendDevelopment = SUBJECTS_BASE.find((s) => s.id === "frontend-development");

  const completed: string[] = [];
  if (webFoundations) {
    completed.push(...getSubjectSessions(webFoundations).sessions.map((s) => s.id));
  }
  if (frontendDevelopment) {
    const firstSession = getSubjectSessions(frontendDevelopment).sessions[0];
    if (firstSession) completed.push(firstSession.id);
  }
  return completed;
}

/** Builds this subject's session list with status/progress derived from completedSessionIds. */
export function getSubjectDetail(subject: SubjectBase, completedSessionIds: ReadonlySet<string>): SubjectDetail {
  const { subtitle, sessions } = getSubjectSessions(subject);
  const firstIncompleteIndex = sessions.findIndex((s) => !completedSessionIds.has(s.id));

  const resolvedSessions: Session[] = sessions.map((s, i) => ({
    ...s,
    status: completedSessionIds.has(s.id)
      ? "completed"
      : i === firstIncompleteIndex
      ? "in-progress"
      : "available",
  }));

  const completedCount = sessions.filter((s) => completedSessionIds.has(s.id)).length;
  const progress = sessions.length === 0 ? 0 : Math.round((completedCount / sessions.length) * 100);

  return { subtitle, progress, sessions: resolvedSessions };
}

/** Builds the full subject list with status derived from completedSessionIds. */
export function getSubjects(completedSessionIds: ReadonlySet<string>): Subject[] {
  const details = SUBJECTS_BASE.map((s) => getSubjectDetail(s, completedSessionIds));
  const firstIncompleteIndex = details.findIndex((d) => d.progress < 100);

  return SUBJECTS_BASE.map((subject, i) => {
    const status: SubjectStatus =
      firstIncompleteIndex === -1 || i < firstIncompleteIndex
        ? "completed"
        : i === firstIncompleteIndex
        ? "in-progress"
        : "available";
    return {
      ...subject,
      status,
      progress: status === "in-progress" ? details[i].progress : undefined,
    };
  });
}

export function getCourseProgress(completedSessionIds: ReadonlySet<string>) {
  const subjects = getSubjects(completedSessionIds);
  const completedSubjects = subjects.filter((s) => s.status === "completed").length;
  const totalSubjects = subjects.length;
  const courseProgressPercent =
    totalSubjects === 0 ? 0 : Math.round((completedSubjects / totalSubjects) * 100);
  return { completedSubjects, totalSubjects, courseProgressPercent };
}

export type SessionContext = {
  subject: Subject;
  session: Session;
  sessionNumber: number;
  totalSessions: number;
  progress: number;
  nextSession?: Session;
};

/** Locates a session (and its subject) anywhere in the course by session id. */
export function getSessionContext(
  sessionId: string,
  completedSessionIds: ReadonlySet<string>
): SessionContext | undefined {
  const subjects = getSubjects(completedSessionIds);
  for (const subject of subjects) {
    const detail = getSubjectDetail(subject, completedSessionIds);
    const index = detail.sessions.findIndex((s) => s.id === sessionId);
    if (index >= 0) {
      return {
        subject,
        session: detail.sessions[index],
        sessionNumber: index + 1,
        totalSessions: detail.sessions.length,
        progress: detail.progress,
        nextSession: detail.sessions[index + 1],
      };
    }
  }
  return undefined;
}

/** The session the student should resume next: the current session of the current subject. */
export function getCurrentSessionContext(completedSessionIds: ReadonlySet<string>): SessionContext | undefined {
  const subjects = getSubjects(completedSessionIds);
  const currentSubject = subjects.find((s) => s.status === "in-progress");
  if (!currentSubject) return undefined;

  const detail = getSubjectDetail(currentSubject, completedSessionIds);
  const index = detail.sessions.findIndex((s) => s.status === "in-progress");
  if (index === -1) return undefined;

  return {
    subject: currentSubject,
    session: detail.sessions[index],
    sessionNumber: index + 1,
    totalSessions: detail.sessions.length,
    progress: detail.progress,
    nextSession: detail.sessions[index + 1],
  };
}

// ---------------------------------------------------------------------------
// Phase 0 backend connection.
// ---------------------------------------------------------------------------

let catalogLoaded = false;

/**
 * Fetches the real course/subject/session structure and overwrites
 * COURSE/SUBJECTS_BASE/SUBJECT_SESSIONS' CONTENTS in place (never reassigns
 * their bindings — see the file header). Called once, from
 * ProgressProvider's mount (progress.tsx), which also forces one re-render
 * afterward so every already-mounted page picks up the change.
 *
 * Fails soft: any error (network, malformed response, backend not running)
 * leaves the existing hardcoded values in place untouched, so the app
 * behaves exactly as it always has whenever the backend isn't reachable —
 * this is deliberately not a hard dependency the Student/Content Author/
 * Admin apps ever crash without.
 */
export async function refreshCourseCatalogFromBackend(): Promise<boolean> {
  if (catalogLoaded) return true;
  try {
    const courses = await apiGet<{ id: string; title: string; description: string }[]>("/courses");
    const course = courses[0];
    if (!course) {
      COURSE.id = "";
      COURSE.title = "";
      COURSE.description = "";
      SUBJECTS_BASE.length = 0;
      for (const key of Object.keys(SUBJECT_SESSIONS)) delete SUBJECT_SESSIONS[key];
      return true;
    }

    const subjects = await apiGet<SubjectBase[]>(`/courses/${course.id}/subjects`);

    const sessionsBySubjectId: Record<string, SessionBase[]> = {};
    for (const subject of subjects) {
      sessionsBySubjectId[subject.id] = await apiGet<SessionBase[]>(`/subjects/${subject.id}/sessions`);
    }

    Object.assign(COURSE, course);

    SUBJECTS_BASE.length = 0;
    SUBJECTS_BASE.push(...subjects);

    for (const key of Object.keys(SUBJECT_SESSIONS)) delete SUBJECT_SESSIONS[key];
    for (const subject of subjects) {
      const sessions = sessionsBySubjectId[subject.id];
      if (sessions.length > 0) {
        SUBJECT_SESSIONS[subject.id] = { subtitle: subject.description, sessions };
      }
    }

    return true;
  } catch {
    return false;
  } finally {
    catalogLoaded = true;
  }
}

export async function apiCreateCourse(title: string, description: string) {
  const res = await apiPost<{ id: string; title: string; description: string }>("/courses", { title, description });
  catalogLoaded = false;
  await refreshCourseCatalogFromBackend();
  return res;
}

export async function apiCreateSubject(courseId: string, title: string, description: string) {
  const res = await apiPost<SubjectBase>(`/courses/${courseId}/subjects`, { title, description });
  catalogLoaded = false;
  await refreshCourseCatalogFromBackend();
  return res;
}

export async function apiCreateSession(subjectId: string, title: string, description: string) {
  const res = await apiPost<SessionBase>(`/subjects/${subjectId}/sessions`, { title, description });
  catalogLoaded = false;
  await refreshCourseCatalogFromBackend();
  return res;
}
