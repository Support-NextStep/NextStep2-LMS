import { test, expect } from "@playwright/test";
import {
  buildContentPackageZip,
  buildSingleSessionPackage,
  REAL_COURSE_ID,
  REAL_SUBJECT_ID,
  REAL_SESSION_ID,
} from "./fixtures/buildContentPackageZip";
import { loginAsContentManager, importAndPublish } from "./fixtures/helpers";

const MARKER = "PKGMARKER-ISOLATION-TEST-CONTENT";
const studentSessionUrl = `/session/${REAL_SESSION_ID}`;

test.describe("Isolation: unrelated sessions and existing content", () => {
  test("publishing one package does not expose unrelated sessions, and existing curated/fallback content keeps working", async ({ page }) => {
    await loginAsContentManager(page);
    const zip = await buildContentPackageZip(buildSingleSessionPackage(REAL_COURSE_ID, REAL_SUBJECT_ID, REAL_SESSION_ID, MARKER));
    await importAndPublish(page, "isolation-target.zip", zip);

    // The published session shows the new content.
    await page.goto(studentSessionUrl);
    await expect(page.getByText(MARKER, { exact: false })).toBeVisible();

    // A DIFFERENT session that already had hand-curated content (sessionContent.ts)
    // in the same course is completely untouched by the publish above.
    await page.goto("/session/components-and-state");
    await expect(page.getByText("build a working HTML form", { exact: false })).toBeVisible();
    await expect(page.getByText(MARKER, { exact: false })).toHaveCount(0);

    // A session in a DIFFERENT subject that has no curated or published
    // content still falls back to the generic mock content, unaffected.
    await page.goto("/session/backend-api-session-1");
    await expect(page.getByText("Design and build APIs that power real applications.", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(MARKER, { exact: false })).toHaveCount(0);
  });
});

test.describe("Isolation: status matrix", () => {
  test("draft / changes requested / approved are invisible; only published is visible", async ({ page }) => {
    await page.goto("/login"); // establish the app origin before touching localStorage

    const record = {
      id: "pkg-isolation-matrix",
      fileName: "isolation-matrix.zip",
      importedAt: new Date().toISOString(),
      importedBy: "qa@example.com",
      status: "draft",
      courseCount: 1,
      subjectCount: 1,
      sessionCount: 1,
      validation: { valid: true, errors: [], warnings: [] },
      courses: [
        {
          id: REAL_COURSE_ID,
          title: "QA Course",
          description: "QA",
          subjects: [
            {
              id: REAL_SUBJECT_ID,
              courseId: REAL_COURSE_ID,
              title: "QA Subject",
              description: "QA",
              order: 1,
              sessions: [
                {
                  id: REAL_SESSION_ID,
                  subjectId: REAL_SUBJECT_ID,
                  title: "QA Session",
                  description: "QA",
                  order: 1,
                  content: {
                    objective: `${MARKER}: objective text.`,
                    concepts: [],
                    keyConcepts: [],
                    examples: [],
                    practice: { task: "task", checklist: [], language: "javascript" },
                    aiHelp: { quickPrompts: [], replies: {}, defaultReply: "reply" },
                    exercise: { objective: "obj", requirements: [], language: "javascript" },
                    requiredActivities: ["learning", "practice", "exercise"],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    async function setStatus(status: string) {
      await page.evaluate(
        ({ record, status }) => {
          window.localStorage.setItem("nextstep2:contentPackages", JSON.stringify([{ ...record, status }]));
        },
        { record, status }
      );
    }

    for (const status of ["draft", "changes_requested", "approved"]) {
      await setStatus(status);
      await page.goto(studentSessionUrl);
      await expect(page.getByText(MARKER, { exact: false })).toHaveCount(0);
    }

    await setStatus("published");
    await page.goto(studentSessionUrl);
    await expect(page.getByText(MARKER, { exact: false })).toBeVisible();
  });
});

test.describe("Isolation: student routes never expose Content Manager controls", () => {
  test("no Content Manager links/branding appear on student pages", async ({ page }) => {
    for (const path of ["/dashboard", "/my-course", studentSessionUrl]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/content"]')).toHaveCount(0);
      await expect(page.getByText("Content Manager", { exact: false })).toHaveCount(0);
    }
  });
});
