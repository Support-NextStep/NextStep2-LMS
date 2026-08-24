// ---------------------------------------------------------------------------
// Content Package model, ZIP import, and validation.
//
// This is the runtime counterpart to NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md
// — the shapes below are a direct implementation of that document's §7
// (Session Content Contract), §13 (Content Package Structure), and §15
// (Required/Optional/Conditional fields). Read that document before changing
// anything here; this file should never silently drift from it.
//
// SCOPE OF THIS SLICE (Content Manager Slice 1):
//   Import a .zip content package -> parse -> validate -> store as a DRAFT
//   ContentPackageRecord. That's it. No Review/Approve/Publish exists yet,
//   so nothing here ever touches sessionContent.ts or any student-facing
//   data — imported content lives entirely in its own storage key, inert,
//   until a future slice builds Publish.
//
// ISOLATION: persisted under its own localStorage key, `nextstep2:contentPackages`,
// completely separate from student progress/performance/portfolio/exercise
// submissions and from company data. Nothing here is ever written into
// sessionContent.ts's SESSION_CONTENT map.
//
// SELF-CHECK MODEL: the authoring contract's Self-Check is checklist LABELS
// only (what the Content Team writes) — never a `passed: true/false` value,
// which is student runtime state, not something a Content Team authors. The
// live Student Practice flow (sessionContent.ts) still uses its own
// hand-authored `{ label, passed }[]` shape and is completely untouched by
// this file; when a future Publish slice promotes imported content into
// that live shape, the safe transformation is simply
// `checklist.map(label => ({ label, passed: true }))` — a placeholder
// default, not a claim about any student's actual performance. That
// transformation is not needed yet, since nothing here writes to
// sessionContent.ts in this slice — noted here only so the two models don't
// silently diverge later.
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import type { SessionContent } from "./sessionContent";

// ---- Authoring contract shapes (mirrors the .md document's §7) -----------

export type ActivityKey = "learning" | "videoCheck" | "practice" | "exercise";
const VALID_ACTIVITIES: ActivityKey[] = ["learning", "videoCheck", "practice", "exercise"];

export type ContentCourse = {
  id: string;
  title: string;
  description: string;
};

export type ContentSubject = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  subtitle?: string;
  order: number;
};

export type ContentSessionMeta = {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  order: number;
};

export type ContentSessionContent = {
  objective: string;
  concepts: string[];
  keyConcepts: string[];
  examples: string[];
  estimatedDuration?: string;
  video?: {
    youtubeUrl: string;
    title: string;
    durationSeconds?: number;
  };
  videoCheckpoint?: {
    question: string;
    options: string[];
    correctIndex: number;
  };
  practice: {
    task: string;
    starterCode?: string;
    /** Checklist LABELS only — see file header. Never a passed/failed value. */
    checklist: string[];
    language: string;
  };
  aiHelp: {
    quickPrompts: string[];
    replies: Record<string, string>;
    defaultReply: string;
  };
  exercise: {
    objective: string;
    requirements: string[];
    starterCode?: string;
    language: string;
  };
  requiredActivities: ActivityKey[];
  projectConnection?: string;
};

export type ContentSession = ContentSessionMeta & { content: ContentSessionContent | null };
export type ContentSubjectFull = ContentSubject & { sessions: ContentSession[] };
export type ContentCourseFull = ContentCourse & { subjects: ContentSubjectFull[] };

export type PackageManifest = {
  packageVersion?: string;
};

export type ContentTeamMetadata = {
  contentTeam?: string;
  notes?: string;
};

// ---- Validation ------------------------------------------------------------

export type ValidationIssue = { path: string; message: string };
export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

const YOUTUBE_URL_PATTERN =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)[\w-]+|youtu\.be\/[\w-]+)/i;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validates a parsed (but not yet trusted) content package against the
 * authoring contract. Never throws — collects every issue found so the
 * Content Manager sees the full picture in one pass, not one error at a time.
 */
export function validatePackage(pkg: {
  manifest: PackageManifest | null;
  manifestParseError: boolean;
  courses: ContentCourseFull[];
}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // ---- PACKAGE ----
  if (pkg.manifestParseError) {
    errors.push({ path: "package-manifest.json", message: "package-manifest.json exists but could not be parsed as JSON." });
  } else if (!pkg.manifest) {
    errors.push({ path: "package-manifest.json", message: "package-manifest.json is missing." });
  }
  if (pkg.courses.length === 0) {
    errors.push({ path: "courses/", message: "Package contains no courses." });
  }

  const seenSubjectIds = new Set<string>();
  const seenSessionIds = new Set<string>();
  const courseIds = new Set(pkg.courses.map((c) => c.id).filter(Boolean));

  for (const course of pkg.courses) {
    const coursePath = `courses/${course.id || "(unknown)"}`;

    // ---- COURSE ----
    if (!isNonEmptyString(course.id)) errors.push({ path: `${coursePath}/course.json`, message: "Course id is required." });
    if (!isNonEmptyString(course.title)) errors.push({ path: `${coursePath}/course.json`, message: "Course title is required." });
    if (!isNonEmptyString(course.description)) errors.push({ path: `${coursePath}/course.json`, message: "Course description is required." });
    if (course.subjects.length === 0) {
      errors.push({ path: `${coursePath}/subjects/`, message: "Course must contain at least one subject." });
    }

    for (const subject of course.subjects) {
      const subjectPath = `${coursePath}/subjects/${subject.id || "(unknown)"}`;

      // ---- SUBJECT ----
      if (!isNonEmptyString(subject.id)) {
        errors.push({ path: `${subjectPath}/subject.json`, message: "Subject id is required." });
      } else if (seenSubjectIds.has(subject.id)) {
        errors.push({ path: `${subjectPath}/subject.json`, message: `Duplicate subject id "${subject.id}" — subject ids must not collide.` });
      } else {
        seenSubjectIds.add(subject.id);
      }
      if (!isNonEmptyString(subject.courseId)) {
        errors.push({ path: `${subjectPath}/subject.json`, message: "Subject courseId is required." });
      } else if (!courseIds.has(subject.courseId)) {
        errors.push({ path: `${subjectPath}/subject.json`, message: `Subject courseId "${subject.courseId}" does not match any course in this package.` });
      }
      if (!isNonEmptyString(subject.title)) errors.push({ path: `${subjectPath}/subject.json`, message: "Subject title is required." });
      if (typeof subject.order !== "number" || Number.isNaN(subject.order)) {
        errors.push({ path: `${subjectPath}/subject.json`, message: "Subject order must be a valid number." });
      }
      if (subject.sessions.length === 0) {
        errors.push({ path: `${subjectPath}/sessions/`, message: "Subject must contain at least one session." });
      }

      for (const session of subject.sessions) {
        const sessionPath = `${subjectPath}/sessions/${session.id || "(unknown)"}`;

        // ---- SESSION ----
        if (!isNonEmptyString(session.id)) {
          errors.push({ path: `${sessionPath}/session.json`, message: "Session id is required." });
        } else if (seenSessionIds.has(session.id)) {
          errors.push({ path: `${sessionPath}/session.json`, message: `Duplicate session id "${session.id}" — session ids must be stable and unique.` });
        } else {
          seenSessionIds.add(session.id);
        }
        if (!isNonEmptyString(session.subjectId)) {
          errors.push({ path: `${sessionPath}/session.json`, message: "Session subjectId is required." });
        } else if (session.subjectId !== subject.id) {
          errors.push({ path: `${sessionPath}/session.json`, message: `Session subjectId "${session.subjectId}" does not match its containing subject "${subject.id}".` });
        }
        if (!isNonEmptyString(session.title)) errors.push({ path: `${sessionPath}/session.json`, message: "Session title is required." });
        if (!isNonEmptyString(session.description)) errors.push({ path: `${sessionPath}/session.json`, message: "Session description is required." });
        if (typeof session.order !== "number" || Number.isNaN(session.order)) {
          errors.push({ path: `${sessionPath}/session.json`, message: "Session order must be a valid number." });
        }

        // ---- SESSION CONTENT ----
        const contentPath = `${sessionPath}/content.json`;
        const content = session.content;
        if (!content) {
          errors.push({ path: contentPath, message: "content.json is missing or could not be parsed." });
          continue;
        }

        // Required Activities
        const required = Array.isArray(content.requiredActivities) ? content.requiredActivities : [];
        const invalidActivities = required.filter((a) => !VALID_ACTIVITIES.includes(a));
        if (invalidActivities.length > 0) {
          errors.push({ path: contentPath, message: `requiredActivities contains unsupported value(s): ${invalidActivities.join(", ")}` });
        }

        // Learning
        if (!isNonEmptyString(content.objective)) errors.push({ path: contentPath, message: "Learning objective is required." });

        // Video — RECOMMENDED, not mandatory (finalized product decision).
        if (!content.video) {
          warnings.push({ path: contentPath, message: "No video provided. Video is recommended but not required." });
        } else {
          if (!isNonEmptyString(content.video.youtubeUrl)) {
            errors.push({ path: contentPath, message: "Video is present but youtubeUrl is missing." });
          } else if (!YOUTUBE_URL_PATTERN.test(content.video.youtubeUrl.trim())) {
            errors.push({ path: contentPath, message: `Video youtubeUrl does not look like a supported YouTube URL: "${content.video.youtubeUrl}"` });
          }
          if (!isNonEmptyString(content.video.title)) errors.push({ path: contentPath, message: "Video is present but title is missing." });
        }

        // Video Check — only required when this session actually includes it.
        if (required.includes("videoCheck")) {
          const vc = content.videoCheckpoint;
          if (!vc) {
            errors.push({ path: contentPath, message: "requiredActivities includes videoCheck but no videoCheckpoint was provided." });
          } else {
            if (!isNonEmptyString(vc.question)) errors.push({ path: contentPath, message: "Video Check question is required." });
            if (!Array.isArray(vc.options) || vc.options.length < 2) {
              errors.push({ path: contentPath, message: "Video Check must have at least 2 options." });
            } else if (
              typeof vc.correctIndex !== "number" ||
              vc.correctIndex < 0 ||
              vc.correctIndex >= vc.options.length
            ) {
              errors.push({ path: contentPath, message: "Video Check correctIndex must point to one of the provided options." });
            }
          }
        }

        // Practice
        if (!content.practice) {
          errors.push({ path: contentPath, message: "Practice block is required." });
        } else {
          if (!isNonEmptyString(content.practice.task)) errors.push({ path: contentPath, message: "Practice task is required." });
          if (!isNonEmptyString(content.practice.language)) errors.push({ path: contentPath, message: "Practice language is required." });
          if (content.practice.checklist && !Array.isArray(content.practice.checklist)) {
            errors.push({ path: contentPath, message: "Practice checklist must be a list of label strings." });
          } else if (
            Array.isArray(content.practice.checklist) &&
            content.practice.checklist.some((item) => typeof item !== "string")
          ) {
            errors.push({
              path: contentPath,
              message: "Practice checklist items must be plain label strings — not objects with a passed/failed state (that's student runtime data, not authored content).",
            });
          }
        }

        // AI Help
        if (!content.aiHelp) {
          errors.push({ path: contentPath, message: "AI Help block is required." });
        } else {
          if (!isNonEmptyString(content.aiHelp.defaultReply)) {
            errors.push({ path: contentPath, message: "AI Help defaultReply is required." });
          }
          const prompts = Array.isArray(content.aiHelp.quickPrompts) ? content.aiHelp.quickPrompts : [];
          const replies = content.aiHelp.replies ?? {};
          for (const prompt of prompts) {
            if (!isNonEmptyString(replies[prompt])) {
              errors.push({ path: contentPath, message: `AI Help quick prompt "${prompt}" has no matching reply.` });
            }
          }
        }

        // Exercise
        if (!content.exercise) {
          errors.push({ path: contentPath, message: "Exercise block is required." });
        } else {
          if (!isNonEmptyString(content.exercise.objective)) errors.push({ path: contentPath, message: "Exercise objective is required." });
          if (!isNonEmptyString(content.exercise.language)) errors.push({ path: contentPath, message: "Exercise language is required." });
          // starterCode intentionally optional — an exercise may start blank.
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---- ZIP import --------------------------------------------------------

export type ParsedPackage = {
  manifest: PackageManifest | null;
  manifestParseError: boolean;
  contentTeam?: string;
  courses: ContentCourseFull[];
};

async function readJson<T>(zip: JSZip, path: string): Promise<{ value: T | null; found: boolean; parseError: boolean }> {
  const entry = zip.file(path);
  if (!entry) return { value: null, found: false, parseError: false };
  try {
    const text = await entry.async("text");
    return { value: JSON.parse(text) as T, found: true, parseError: false };
  } catch {
    return { value: null, found: true, parseError: true };
  }
}

/**
 * Parses a .zip content package into the shape validatePackage() expects.
 * Tolerant of the package root being nested one folder deep inside the zip
 * (e.g. "content-package/courses/..." vs "courses/...") — locates
 * package-manifest.json first and treats its directory as the package root.
 * Never throws: malformed/missing files become validation errors, not crashes.
 */
export async function parseContentPackageZip(file: File): Promise<ParsedPackage> {
  const zip = await JSZip.loadAsync(file);

  const manifestEntry = Object.keys(zip.files).find((name) => name.endsWith("package-manifest.json") && !zip.files[name].dir);
  const root = manifestEntry ? manifestEntry.slice(0, manifestEntry.length - "package-manifest.json".length) : "";

  const manifestResult = manifestEntry
    ? await readJson<PackageManifest>(zip, manifestEntry)
    : { value: null, found: false, parseError: false };

  const contentTeamResult = await readJson<ContentTeamMetadata>(zip, `${root}metadata/content-team.json`);

  const courses: ContentCourseFull[] = [];
  const courseDirPattern = new RegExp(`^${escapeRegExp(root)}courses/([^/]+)/course\\.json$`);

  const courseEntries = Object.keys(zip.files).filter((name) => courseDirPattern.test(name));

  for (const courseFilePath of courseEntries) {
    const match = courseFilePath.match(courseDirPattern);
    const courseId = match?.[1] ?? "";
    const courseResult = await readJson<ContentCourse>(zip, courseFilePath);
    const course: ContentCourse = courseResult.value ?? { id: courseId, title: "", description: "" };

    const subjects: ContentSubjectFull[] = [];
    const subjectDirPattern = new RegExp(`^${escapeRegExp(root)}courses/${escapeRegExp(courseId)}/subjects/([^/]+)/subject\\.json$`);
    const subjectEntries = Object.keys(zip.files).filter((name) => subjectDirPattern.test(name));

    for (const subjectFilePath of subjectEntries) {
      const subjectMatch = subjectFilePath.match(subjectDirPattern);
      const subjectId = subjectMatch?.[1] ?? "";
      const subjectResult = await readJson<ContentSubject>(zip, subjectFilePath);
      const subject: ContentSubject = subjectResult.value ?? {
        id: subjectId,
        courseId,
        title: "",
        description: "",
        order: NaN,
      };

      const sessions: ContentSession[] = [];
      const sessionDirPattern = new RegExp(
        `^${escapeRegExp(root)}courses/${escapeRegExp(courseId)}/subjects/${escapeRegExp(subjectId)}/sessions/([^/]+)/session\\.json$`
      );
      const sessionEntries = Object.keys(zip.files).filter((name) => sessionDirPattern.test(name));

      for (const sessionFilePath of sessionEntries) {
        const sessionMatch = sessionFilePath.match(sessionDirPattern);
        const sessionId = sessionMatch?.[1] ?? "";
        const sessionResult = await readJson<ContentSessionMeta>(zip, sessionFilePath);
        const sessionMeta: ContentSessionMeta = sessionResult.value ?? {
          id: sessionId,
          subjectId,
          title: "",
          description: "",
          order: NaN,
        };

        const contentPath = `${root}courses/${courseId}/subjects/${subjectId}/sessions/${sessionId}/content.json`;
        const contentResult = await readJson<ContentSessionContent>(zip, contentPath);

        sessions.push({ ...sessionMeta, content: contentResult.value });
      }

      subjects.push({ ...subject, sessions });
    }

    courses.push({ ...course, subjects });
  }

  return {
    manifest: manifestResult.value,
    manifestParseError: manifestResult.parseError,
    contentTeam: contentTeamResult.value?.contentTeam,
    courses,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Persistence ---------------------------------------------------------

export type ContentPackageStatus = "draft" | "invalid" | "changes_requested" | "approved" | "published";

export type ContentPackageRecord = {
  id: string;
  fileName: string;
  packageVersion?: string;
  contentTeam?: string;
  importedAt: string;
  importedBy: string;
  status: ContentPackageStatus;
  courseCount: number;
  subjectCount: number;
  sessionCount: number;
  validation: ValidationResult;
  review?: {
    checklist: { course: boolean; structure: boolean; sessions: boolean; videos: boolean; practice: boolean; aiHelp: boolean; exercises: boolean; ready: boolean; };
    notes: string;
    reviewedAt?: string;
    approvedAt?: string;
    publishedAt?: string;
  };
  /** Only present for a valid (status: "draft") package — an invalid import is never usable data. */
  courses?: ContentCourseFull[];
};

const STORAGE_KEY = "nextstep2:contentPackages";

function loadAll(): ContentPackageRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ContentPackageRecord[]) : [];
  } catch {
    return [];
  }
}

function saveAll(records: ContentPackageRecord[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore write failures (e.g. private browsing) — the import just won't persist.
  }
}

export function loadContentPackages(): ContentPackageRecord[] {
  return loadAll().sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export function getContentPackage(id: string): ContentPackageRecord | null {
  return loadAll().find((p) => p.id === id) ?? null;
}

function generateId(): string {
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveImportedPackage(
  fileName: string,
  importedBy: string,
  parsed: ParsedPackage,
  validation: ValidationResult
): ContentPackageRecord {
  const subjectCount = parsed.courses.reduce((sum, c) => sum + c.subjects.length, 0);
  const sessionCount = parsed.courses.reduce(
    (sum, c) => sum + c.subjects.reduce((s, subj) => s + subj.sessions.length, 0),
    0
  );

  const record: ContentPackageRecord = {
    id: generateId(),
    fileName,
    packageVersion: parsed.manifest?.packageVersion,
    contentTeam: parsed.contentTeam,
    importedAt: new Date().toISOString(),
    importedBy,
    status: validation.valid ? "draft" : "invalid",
    courseCount: parsed.courses.length,
    subjectCount,
    sessionCount,
    validation,
    courses: validation.valid ? parsed.courses : undefined,
  };

  const all = loadAll();
  all.push(record);
  saveAll(all);
  return record;
}

// ---- Preview support (Content Manager Slice 2) --------------------------
//
// These helpers exist ONLY to feed a draft session into the shared
// SessionWorkspace component for the Content Manager's Preview. They never
// touch sessionContent.ts, never write anywhere, and are not reachable from
// any student route.

export type PreviewLocation = {
  course: ContentCourseFull;
  subject: ContentSubjectFull;
  session: ContentSession;
  sessionNumber: number;
  totalSessions: number;
  nextSessionId?: string;
};

/** Locates a course/subject/session inside a draft package by their stable ids — never by array position. */
export function findSessionInPackage(
  pkg: ContentPackageRecord,
  courseId: string,
  subjectId: string,
  sessionId: string
): PreviewLocation | null {
  const course = pkg.courses?.find((c) => c.id === courseId);
  if (!course) return null;
  const subject = course.subjects.find((s) => s.id === subjectId);
  if (!subject) return null;

  const orderedSessions = [...subject.sessions].sort((a, b) => a.order - b.order);
  const index = orderedSessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return null;

  return {
    course,
    subject,
    session: orderedSessions[index],
    sessionNumber: index + 1,
    totalSessions: orderedSessions.length,
    nextSessionId: orderedSessions[index + 1]?.id,
  };
}

/**
 * Adapts a draft session's authored content into the shape the real
 * SessionWorkspace component expects (SessionContent from sessionContent.ts).
 * The only real transformation is Self-Check: authored content is checklist
 * LABELS only (see file header) — `passed: true` is a neutral rendering
 * placeholder here, not a claim about anyone's actual work, and this
 * conversion never writes back into sessionContent.ts.
 */
export function toPreviewSessionContent(draft: ContentSessionContent): SessionContent {
  return {
    objective: draft.objective,
    concepts: draft.concepts,
    keyConcepts: draft.keyConcepts,
    examples: draft.examples,
    videoCheckpoint: draft.videoCheckpoint ?? { question: "", options: [], correctIndex: -1 },
    practice: {
      task: draft.practice.task,
      starterCode: draft.practice.starterCode ?? "",
      checklist: draft.practice.checklist.map((label) => ({ label, passed: true })),
      language: draft.practice.language,
    },
    aiHelp: draft.aiHelp,
    exercise: {
      objective: draft.exercise.objective,
      requirements: draft.exercise.requirements,
      starterCode: draft.exercise.starterCode,
      language: draft.exercise.language,
    },
    requiredActivities: draft.requiredActivities,
    projectConnection: draft.projectConnection,
    // delivery (live sessions) is intentionally not part of the authoring
    // contract — see NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md §23.
  };
}


export function updatePackageState(updatedPkg: ContentPackageRecord) {
  const all = loadAll();
  const idx = all.findIndex(p => p.id === updatedPkg.id);
  if (idx !== -1) {
    all[idx] = updatedPkg;
    saveAll(all);
  }
}
