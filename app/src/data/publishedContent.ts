import { loadContentPackages, toPreviewSessionContent } from "./contentPackages";
import type { SessionContent } from "./sessionContent";

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
    .sort((a, b) => {
      const aKey = a.review?.publishedAt ?? a.importedAt;
      const bKey = b.review?.publishedAt ?? b.importedAt;
      return bKey.localeCompare(aKey);
    });

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
