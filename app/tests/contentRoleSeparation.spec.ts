import { test, expect } from "@playwright/test";
import {
  loginAsContentAuthor,
  loginAsContentReviewer,
  openAuthoringWorkspace,
  fillMandatorySections,
  submitForReview,
  approveAsReviewer,
  REAL_COURSE_ID,
  REAL_SUBJECT_ID,
  REAL_SESSION_TITLE,
} from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Dedicated proof suite for the Content Author / Content Reviewer role and
// workspace separation. The full authoring->review->approve->publish->student
// lifecycle (including versioning) is already exercised end to end in
// contentLifecycle.spec.ts and contentIsolation.spec.ts; this file focuses on
// the role-BOUNDARY guarantees those lifecycle tests don't specifically
// assert: separate logins, separate route namespaces each can't cross into,
// and that the Content Author never gets approval powers while the Content
// Reviewer never gets authoring powers over the same underlying
// ContentPackageRecord data.
// ---------------------------------------------------------------------------

test.describe("Role separation: separate logins", () => {
  test("Content Author and Content Reviewer log in into separate, isolated sessions", async ({ page }) => {
    await loginAsContentAuthor(page, "author@nextstep2.com");
    await expect(page).toHaveURL(/\/content\/dashboard/);

    await loginAsContentReviewer(page, "reviewer@nextstep2.com");
    await expect(page).toHaveURL(/\/review\/dashboard/);

    const stored = await page.evaluate(() => ({
      author: window.localStorage.getItem("nextstep2:contentAuthorAccount"),
      reviewer: window.localStorage.getItem("nextstep2:contentReviewerAccount"),
    }));
    expect(stored.author).toContain("author@nextstep2.com");
    expect(stored.reviewer).toContain("reviewer@nextstep2.com");
    // Two entirely separate accounts, not the same session read twice.
    expect(stored.author).not.toBe(stored.reviewer);
  });
});

test.describe("Role separation: route namespaces are isolated", () => {
  test("Content Author cannot access Reviewer routes", async ({ page }) => {
    await loginAsContentAuthor(page);
    for (const path of ["/review/dashboard", "/review/pending", "/review/changes-requested", "/review/approved", "/review/published"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/review\/login/);
    }
  });

  test("Content Reviewer cannot access Author routes", async ({ page }) => {
    await loginAsContentReviewer(page);
    for (const path of ["/content/dashboard", "/content/courses", "/content/submissions", `/content/courses/${REAL_COURSE_ID}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/content\/login/);
    }
  });

  test("the same underlying package is reachable through both role-specific URLs once each role is logged in — same data, different screens", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    await fillMandatorySections(page, { objective: "ROLEBOUNDARY" });
    const id = await submitForReview(page);

    // Content Author's own status view works for them.
    await page.goto(`/content/submissions/${id}`);
    await expect(page).toHaveURL(new RegExp(`/content/submissions/${id}`));
    await expect(page.getByRole("heading", { name: "Submission Status" })).toBeVisible();

    // Before a Reviewer session exists, the Reviewer's workstation for that
    // exact same package id is not reachable — not missing data, a missing session.
    await page.goto(`/review/package/${id}`);
    await expect(page).toHaveURL(/\/review\/login/);

    // Once logged in as Reviewer (a session the Author never needed), the
    // SAME package id now opens the real review workstation — same
    // ContentPackageRecord, a different, role-appropriate screen over it.
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${id}`);
    await expect(page).toHaveURL(new RegExp(`/review/package/${id}`));
    await expect(page.getByRole("heading", { name: "Content Review" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve Content" })).toBeVisible();
  });
});

test.describe("Role separation: Content Author has no approval powers", () => {
  test("Approve/Publish/Request Changes never appear anywhere in the Content Author's workspace", async ({ page }) => {
    await loginAsContentAuthor(page);

    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    await fillMandatorySections(page, { objective: "NOAPPROVALPOWER" });
    const id = await submitForReview(page);

    // On the submission-status page itself...
    await expect(page.getByRole("button", { name: "Approve Content" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);
    // The checklist is present (for status visibility) but not interactive.
    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeDisabled();

    // ...and across Dashboard / Courses / My Submissions.
    for (const path of ["/content/dashboard", "/content/courses", "/content/submissions", `/content/submissions/${id}`]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Approve Content" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);
    }
  });
});

test.describe("Role separation: Content Reviewer cannot edit authored content", () => {
  test("the Reviewer's workstation only offers checklist/notes/decision controls — never the source content fields", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    await fillMandatorySections(page, { objective: "REVIEWERCANNOTEDIT" });
    const id = await submitForReview(page);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${id}`);

    // No authoring-workspace affordance anywhere on the review page — a
    // Reviewer has no path to editing session content, only to reviewing it.
    await expect(page.getByRole("link", { name: /author/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /continue editing/i })).toHaveCount(0);
    // The only free-text input on the page is the reviewer's OWN notes field
    // (a decision artifact, not the authored content) — there is exactly one
    // textarea, and no other text/number inputs belonging to session content.
    await expect(page.locator("textarea")).toHaveCount(1);

    // Reviewing (ticking boxes + notes) does not require or offer navigation
    // into the authoring workspace at any point.
    await approveAsReviewer(page);
    await expect(page.getByText("Content approved")).toBeVisible();
    await expect(page.getByRole("link", { name: /author/i })).toHaveCount(0);
  });
});

test.describe("Role separation: refresh preserves each role's session independently", () => {
  test("refreshing as one role never disturbs the other role's session", async ({ page }) => {
    await loginAsContentAuthor(page, "author@nextstep2.com");
    await loginAsContentReviewer(page, "reviewer@nextstep2.com");

    await page.goto("/content/dashboard");
    await page.reload();
    await expect(page).toHaveURL(/\/content\/dashboard/);
    await expect(page.locator("aside")).toBeVisible();

    await page.goto("/review/dashboard");
    await page.reload();
    await expect(page).toHaveURL(/\/review\/dashboard/);
    await expect(page.locator("aside")).toBeVisible();

    const stored = await page.evaluate(() => ({
      author: window.localStorage.getItem("nextstep2:contentAuthorAccount"),
      reviewer: window.localStorage.getItem("nextstep2:contentReviewerAccount"),
    }));
    expect(stored.author).toContain("author@nextstep2.com");
    expect(stored.reviewer).toContain("reviewer@nextstep2.com");
  });
});
