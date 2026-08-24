import { loadContentPackages, toPreviewSessionContent, type ContentPackageRecord, type ContentPackageStatus } from "./contentPackages";
import type { SessionContent } from "./sessionContent";

/**
 * "Last touched" timestamp used to break ties between two package records —
 * publishedAt when it's been published, otherwise the most recent review
 * step that happened, falling back to when it was imported. Centralized here
 * so every consumer of "which package record is the current one for this
 * session" (the student-facing lookup below, and Admin's read-only content
 * overview) uses the exact same rule instead of drifting apart.
 */
function lastTouchedAt(pkg: ContentPackageRecord): string {
  return pkg.review?.publishedAt ?? pkg.review?.approvedAt ?? pkg.review?.reviewedAt ?? pkg.importedAt;
}

export function getPublishedSessionContent(
  courseId: string,
  subjectId: string,
  sessionId: string
): SessionContent | null {
  const all = loadContentPackages();
  const published = all
    .filter((p) => p.status === "published" && p.courses)
    // Most-recently-*published* package wins when more than one published
    // package happens to contain the same course/subject/session (e.g. a
    // corrected v2 re-import published after v1). This is what makes
    // "publish a replacement" actually replace what students see, instead
    // of depending on the coincidence of import order.
    .sort((a, b) => lastTouchedAt(b).localeCompare(lastTouchedAt(a)));

  for (const pkg of published) {
    const course = pkg.courses!.find((c) => c.id === courseId);
    if (!course) continue;

    const subject = course.subjects.find((s) => s.id === subjectId);
    if (!subject) continue;

    const session = subject.sessions.find((s) => s.id === sessionId);
    if (session?.content) {
      return toPreviewSessionContent(session.content);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Admin read-only content overview support.
//
// Admin needs to answer "what is this session's current status?" across
// every imported package, not just the published ones — but it must never
// disagree with what getPublishedSessionContent() above resolves for
// students. resolveSessionStatuses() below is the single shared answer both
// read from: one row per (course, subject, session), reduced from every
// non-invalid package record to the one that currently represents it.
//
// The reduction rule is a direct generalization of the same "most recently
// touched wins" idea used above, with one addition: PUBLISHED always beats
// any pending status, regardless of recency. That's not a second,
// conflicting version-resolution algorithm — it's the same "the live
// published version stays live until a replacement is actually published"
// rule from the Content Manager flow, just also reported to Admin instead of
// only being applied to the student-facing lookup.
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<Exclude<ContentPackageStatus, "invalid">, number> = {
  draft: 0,
  changes_requested: 1,
  approved: 2,
  published: 3,
};

export type SessionStatusInfo = {
  courseId: string;
  courseTitle: string;
  subjectId: string;
  subjectTitle: string;
  subjectOrder: number;
  sessionId: string;
  sessionTitle: string;
  sessionDescription: string;
  sessionOrder: number;
  status: Exclude<ContentPackageStatus, "invalid">;
  /** The package record currently representing this session — for linking back into Content Manager-authored data. */
  packageId: string;
  packageFileName: string;
  /** publishedAt for a published row, otherwise the most recent review step, otherwise import time. */
  statusAt: string;
};

/**
 * One row per (course, subject, session) across every valid content package,
 * each resolved to whichever package record currently represents it. Invalid
 * packages are excluded — they carry no usable `courses` data (see
 * contentPackages.ts). This is read-only aggregation; it never mutates a
 * package record.
 */
export function resolveSessionStatuses(): SessionStatusInfo[] {
  const all = loadContentPackages().filter((p) => p.status !== "invalid" && p.courses);

  const winners = new Map<
    string,
    {
      pkg: ContentPackageRecord;
      courseId: string;
      courseTitle: string;
      subjectId: string;
      subjectTitle: string;
      subjectOrder: number;
      sessionId: string;
      sessionTitle: string;
      sessionDescription: string;
      sessionOrder: number;
    }
  >();

  for (const pkg of all) {
    for (const course of pkg.courses ?? []) {
      for (const subject of course.subjects) {
        for (const session of subject.sessions) {
          if (!session.content) continue; // no usable authored content — nothing to report on
          const key = `${course.id}::${subject.id}::${session.id}`;
          const candidate = {
            pkg,
            courseId: course.id,
            courseTitle: course.title,
            subjectId: subject.id,
            subjectTitle: subject.title,
            subjectOrder: subject.order,
            sessionId: session.id,
            sessionTitle: session.title,
            sessionDescription: session.description,
            sessionOrder: session.order,
          };

          const current = winners.get(key);
          if (!current) {
            winners.set(key, candidate);
            continue;
          }

          const currentRank = STATUS_RANK[current.pkg.status as Exclude<ContentPackageStatus, "invalid">];
          const candidateRank = STATUS_RANK[pkg.status as Exclude<ContentPackageStatus, "invalid">];
          const candidateIsNewer =
            candidateRank > currentRank ||
            (candidateRank === currentRank && lastTouchedAt(pkg).localeCompare(lastTouchedAt(current.pkg)) > 0);

          if (candidateIsNewer) winners.set(key, candidate);
        }
      }
    }
  }

  return [...winners.values()].map((w) => ({
    courseId: w.courseId,
    courseTitle: w.courseTitle,
    subjectId: w.subjectId,
    subjectTitle: w.subjectTitle,
    subjectOrder: w.subjectOrder,
    sessionId: w.sessionId,
    sessionTitle: w.sessionTitle,
    sessionDescription: w.sessionDescription,
    sessionOrder: w.sessionOrder,
    status: w.pkg.status as Exclude<ContentPackageStatus, "invalid">,
    packageId: w.pkg.id,
    packageFileName: w.pkg.fileName,
    statusAt: lastTouchedAt(w.pkg),
  }));
}
