// ---------------------------------------------------------------------------
// Test-only helper: builds an in-memory .zip Buffer matching the Content
// Package Authoring Structure (see NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md
// and src/data/contentPackages.ts), so Playwright specs can drive the real
// Import -> Review -> Approve -> Publish flow against realistic fixtures
// without committing binary .zip files to the repo.
//
// Not a spec file (no .spec.ts suffix) — Playwright's default testMatch
// won't pick this up as a test.
// ---------------------------------------------------------------------------
// Loaded via createRequire rather than a static ESM import: Playwright's test
// loader running under Node 22 hits a Node bug ("Unexpected module status 3")
// when jszip's internally-circular CJS requires are pulled in through the
// synchronous ESM interop path. A plain require() (as the app's own Vite
// build already uses under the hood) sidesteps it.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require("jszip") as typeof import("jszip");

export type FixtureSessionContent = {
  objective: string;
  concepts?: string[];
  keyConcepts?: string[];
  examples?: string[];
  practice: { task: string; starterCode?: string; checklist?: string[]; language: string };
  aiHelp: { quickPrompts?: string[]; replies?: Record<string, string>; defaultReply: string };
  exercise: { objective: string; requirements?: string[]; starterCode?: string; language: string };
  requiredActivities?: string[];
};

export type FixtureSession = {
  id: string;
  title: string;
  description: string;
  order: number;
  content: FixtureSessionContent;
};

export type FixtureSubject = {
  id: string;
  title: string;
  description: string;
  order: number;
  sessions: FixtureSession[];
};

export type FixtureCourse = {
  id: string;
  title: string;
  description: string;
  subjects: FixtureSubject[];
};

export async function buildContentPackageZip(
  courses: FixtureCourse[],
  opts?: { packageVersion?: string; contentTeam?: string }
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("package-manifest.json", JSON.stringify({ packageVersion: opts?.packageVersion ?? "1.0.0" }));
  zip.file("metadata/content-team.json", JSON.stringify({ contentTeam: opts?.contentTeam ?? "QA Content Team" }));

  for (const course of courses) {
    zip.file(`courses/${course.id}/course.json`, JSON.stringify({
      id: course.id,
      title: course.title,
      description: course.description,
    }));

    for (const subject of course.subjects) {
      zip.file(`courses/${course.id}/subjects/${subject.id}/subject.json`, JSON.stringify({
        id: subject.id,
        courseId: course.id,
        title: subject.title,
        description: subject.description,
        order: subject.order,
      }));

      for (const session of subject.sessions) {
        const base = `courses/${course.id}/subjects/${subject.id}/sessions/${session.id}`;
        zip.file(`${base}/session.json`, JSON.stringify({
          id: session.id,
          subjectId: subject.id,
          title: session.title,
          description: session.description,
          order: session.order,
        }));
        zip.file(`${base}/content.json`, JSON.stringify({
          objective: session.content.objective,
          concepts: session.content.concepts ?? [],
          keyConcepts: session.content.keyConcepts ?? [],
          examples: session.content.examples ?? [],
          practice: {
            task: session.content.practice.task,
            starterCode: session.content.practice.starterCode ?? "",
            checklist: session.content.practice.checklist ?? [],
            language: session.content.practice.language,
          },
          aiHelp: {
            quickPrompts: session.content.aiHelp.quickPrompts ?? [],
            replies: session.content.aiHelp.replies ?? {},
            defaultReply: session.content.aiHelp.defaultReply,
          },
          exercise: {
            objective: session.content.exercise.objective,
            requirements: session.content.exercise.requirements ?? [],
            starterCode: session.content.exercise.starterCode,
            language: session.content.exercise.language,
          },
          // Deliberately excludes "videoCheck" so no video/videoCheckpoint block
          // is required — keeps fixtures minimal while staying valid.
          requiredActivities: session.content.requiredActivities ?? ["learning", "practice", "exercise"],
        }));
      }
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

/** Real course id — must match src/data/mock.ts COURSE.id for a published package to reach a real student route. */
export const REAL_COURSE_ID = "full-stack-web-development";
/** Real subject id — matches src/data/mock.ts SUBJECTS_BASE. */
export const REAL_SUBJECT_ID = "frontend-development";
/** A real session id in that subject with no curated entry in sessionContent.ts — uses the generic fallback until published. */
export const REAL_SESSION_ID = "api-integration";

/** A single-course/subject/session fixture whose objective embeds `marker`, so a test can assert its presence/absence on the student page. */
export function buildSingleSessionPackage(
  courseId: string,
  subjectId: string,
  sessionId: string,
  marker: string
): FixtureCourse[] {
  return [
    {
      id: courseId,
      title: "QA Fixture Course",
      description: "QA fixture course",
      subjects: [
        {
          id: subjectId,
          title: "QA Fixture Subject",
          description: "QA fixture subject",
          order: 1,
          sessions: [
            {
              id: sessionId,
              title: "QA Fixture Session",
              description: "QA fixture session",
              order: 1,
              content: {
                objective: `${marker}: Learn how to call REST APIs from React and handle loading/error states.`,
                keyConcepts: ["fetch", "async/await", "loading state"],
                practice: { task: "Fetch a list of users and render them.", language: "javascript" },
                aiHelp: { defaultReply: "Ask me anything about this session." },
                exercise: { objective: "Build a small API-backed list view.", language: "javascript" },
              },
            },
          ],
        },
      ],
    },
  ];
}
