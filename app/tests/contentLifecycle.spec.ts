import { test, expect } from "@playwright/test";
import {
  loginAsContentAuthor,
  loginAsContentReviewer,
  getPackageStatus,
  checkAllReviewBoxes,
  openAuthoringWorkspace,
  fillMandatorySections,
  goToAuthoringSection,
  submitForReview,
  authorAndPublish,
  REAL_COURSE_ID,
  REAL_SUBJECT_ID,
  REAL_SESSION_TITLE,
  REAL_SESSION_ID,
} from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Content Author -> Content Reviewer -> Student, exercising the full
// ContentPackageRecord lifecycle across the two now-separate roles/workspaces
// (see the role/workspace separation slice's final report). Behavioral
// coverage is unchanged from before that split: content never reaches the
// student while draft/changes_requested/approved, and becomes visible only
// once published — what changed is WHO performs which step and WHERE:
// authoring/submitting happens only in the Content Author's workspace
// (/content/*, its own login), review/request-changes/approve/publish only
// in the Content Reviewer's workspace (/review/*, a separate login). Both
// operate on the exact same ContentPackageRecord — there is no duplicate
// domain model underneath either workspace.
//
// The first test below proves the single-record revise-and-resubmit cycle
// (Author fixes a changes_requested submission and resubmits — same package
// id throughout). The second test is the opposite case — revising content
// that's already PUBLISHED — where the real workflow intentionally creates a
// second, brand-new package (see "Author New Version" in
// ContentSubjectDetail.tsx), because an approved/published record must never
// be edited in place.
// ---------------------------------------------------------------------------

const V1_MARKER = "PKGMARKERV1-REST-API-INTEGRATION-CONTENT";
const V1_CORRECTED_MARKER = "PKGMARKERV1-REST-API-INTEGRATION-CONTENT-CORRECTED";
const V2_MARKER = "PKGMARKERV2-REST-API-INTEGRATION-CONTENT";

const studentSessionUrl = `/session/${REAL_SESSION_ID}`;

// contentIsolation.spec.ts also authors/publishes against this same real
// curriculum session (REAL_SESSION_TITLE), so when this file runs together
// with it in one suite, the Author's "My Submissions" list can contain more
// than one card titled REAL_SESSION_TITLE at once — a bare
// getByRole("heading", { name: REAL_SESSION_TITLE }) is then ambiguous
// (Playwright strict-mode violation). Each card links unambiguously to
// /content/submissions/{pkg.id} (see ContentSubmissions.tsx), so scope by
// that instead of by title text.
function submissionCard(page: import("@playwright/test").Page, pkgId: string) {
  return page.locator("div.rounded-xl", { has: page.locator(`a[href="/content/submissions/${pkgId}"]`) });
}

test.describe("Content Author -> Content Reviewer -> Student: full publish lifecycle", () => {
  test("author -> submit -> reviewer requests changes -> author revises & resubmits -> reviewer approves -> publishes -> student sees it", async ({ page }) => {
    await loginAsContentAuthor(page);

    // ---- 1. Author a brand-new session and submit it for review ----
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    await fillMandatorySections(page, { objective: V1_MARKER });
    const pkgId = await submitForReview(page);

    // ---- 2. Verify it appears as pending review, in the Author's OWN My Submissions list ----
    // Real backend status right after Submit for Review is READY_FOR_REVIEW
    // (PackagesService.submit()) — the old "draft" string was this same old
    // localStorage model's own (differently-named) "pending review" state.
    await expect.poll(() => getPackageStatus(page, pkgId)).toBe("READY_FOR_REVIEW");

    await page.goto("/content/submissions");
    const draftCard = submissionCard(page, pkgId);
    await expect(draftCard.getByRole("heading", { name: REAL_SESSION_TITLE })).toBeVisible();
    await expect(draftCard.getByText("Pending Review", { exact: true })).toBeVisible();
    // The Content Author never sees Approve/Publish/Request Changes anywhere in their own workspace.
    await expect(page.getByRole("button", { name: "Approve Content" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);

    // ---- 3. Verify the student does not see the new content (pending review) ----
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // ---- 4. Content Reviewer opens Review (a separate login/session) ----
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${pkgId}`);
    await expect(page.getByRole("heading", { name: "Content Review" })).toBeVisible();

    // ---- 5. Test Request Changes with notes ----
    // Tick every box except "ready" first, to also confirm Approve stays disabled
    // until the checklist is fully complete.
    for (const label of [
      "Course information reviewed",
      "Subject structure reviewed",
      "Session content reviewed",
      "Videos reviewed",
      "Practice activities reviewed",
      "AI Help reviewed",
      "Exercises reviewed",
    ]) {
      await page.getByText(label, { exact: true }).click();
    }
    await expect(page.getByRole("button", { name: "Approve Content" })).toBeDisabled();

    await page.fill("textarea", "Please fix the API error-handling example before this ships.");
    await page.getByRole("button", { name: "Request Changes" }).click();

    // ---- 6. Verify status becomes CHANGES REQUESTED, visible to the Author too ----
    await expect(page.locator("text=Changes Requested").first()).toBeVisible();
    // Real auth is one httpOnly cookie per browser context (path: '/') — it
    // is not the old localStorage model's separate-key-per-role coexistence,
    // so logging in as Reviewer really did log the Author out of this same
    // `page`. A real Content Author checking their own submissions list
    // would genuinely log back in here — do the same.
    await loginAsContentAuthor(page);
    await page.goto("/content/submissions");
    const changesCard = submissionCard(page, pkgId);
    await expect(changesCard.getByText("Changes Req", { exact: false })).toBeVisible();

    // Still invisible to students while changes are requested.
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // ---- 7. Author resumes the SAME package to address the requested changes ----
    // (Continue Editing — proven below to be the same record, not a new one.)
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    // Learning Objective lives on the Learning Content panel, not Session
    // Information (see the same fix already applied in helpers.ts/contentAuthoring.spec.ts).
    await goToAuthoringSection(page, "Learning Content");
    await page.getByLabel("Learning Objective").fill(V1_CORRECTED_MARKER);
    const resubmittedId = await submitForReview(page);
    expect(resubmittedId).toBe(pkgId); // revising a changes_requested draft resumes it in place — never a duplicate.
    await expect.poll(() => getPackageStatus(page, resubmittedId)).toBe("READY_FOR_REVIEW");

    // ---- 8. Reviewer reviews the corrected package + completes the checklist ----
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${resubmittedId}`);
    await checkAllReviewBoxes(page);
    await expect(page.getByRole("button", { name: "Approve Content" })).toBeEnabled();

    // ---- 9. Approve Content ----
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Approve Content" }).click();

    // ---- 10. Verify status becomes APPROVED ----
    await expect(page.getByText("Content approved")).toBeVisible();
    await expect.poll(() => getPackageStatus(page, resubmittedId)).toBe("APPROVED");

    // ---- 11. Verify the student still does not see it (Approved) ----
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_CORRECTED_MARKER, { exact: false })).toHaveCount(0);

    // ---- 12. Publish ----
    await page.goto(`/review/package/${resubmittedId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Publish" }).click();

    // ---- 13. Verify status becomes PUBLISHED ----
    await expect(page.locator("text=Published").first()).toBeVisible();
    await expect.poll(() => getPackageStatus(page, resubmittedId)).toBe("PUBLISHED");

    // ---- 14/15. Open the same course/subject/session as a student; verify the corrected, published content shows ----
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_CORRECTED_MARKER, { exact: false })).toBeVisible();
  });
});

test.describe("Content Author -> Content Reviewer -> Student: replacement / versioning", () => {
  test("publishing a corrected v2 replaces v1 for students, never exposing v2's draft/approved states", async ({ page }) => {
    await loginAsContentAuthor(page);

    // Background: v1 is already authored, reviewed, and published (authorAndPublish logs in as Content Reviewer internally too).
    const v1Id = await authorAndPublish(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: REAL_SESSION_TITLE,
      objective: V1_MARKER,
    });

    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();

    // Author v2 for the SAME course/subject/session — since v1 is published
    // (not draft/changes_requested), the workspace offers "Author New
    // Version" and starts a genuinely new package rather than resuming v1's.
    // Real auth is one cookie per browser context — authorAndPublish above
    // ends logged in as Reviewer, so log back in as Author here (a real
    // person switching hats would do the same).
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    await fillMandatorySections(page, { objective: V2_MARKER });
    const v2Id = await submitForReview(page);

    // Proves the "author new version" fix: a distinct package, not v1 edited in place.
    expect(v2Id).not.toBe(v1Id);
    await expect.poll(() => getPackageStatus(page, v2Id)).toBe("READY_FOR_REVIEW");

    // Draft v2 must not be visible — v1 must remain the live version.
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();
    await expect(page.getByText(V2_MARKER, { exact: false })).toHaveCount(0);

    // Reviewer reviews + approves v2 — still must not be visible; v1 still live.
    // Real auth is one cookie per context — log back in as Reviewer (the
    // author actions just above overwrote that session).
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${v2Id}`);
    await checkAllReviewBoxes(page);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Approve Content" }).click();
    await expect(page.getByText("Content approved")).toBeVisible();

    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();
    await expect(page.getByText(V2_MARKER, { exact: false })).toHaveCount(0);

    // Publish v2 — now v2 replaces v1 for students.
    await page.goto(`/review/package/${v2Id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("text=Published").first()).toBeVisible();

    await page.goto(studentSessionUrl);
    await expect(page.getByText(V2_MARKER, { exact: false })).toBeVisible();
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // Known MVP limitation (documented, not a bug under test here): v1's own
    // ContentPackage row stays PUBLISHED forever — ReviewService.publish()
    // only flips the OLD Publication's supersededAt and the CURRENT
    // package's own status, never touches any other package's row. There is
    // no explicit supersede/unpublish step. Student-facing resolution
    // correctly prefers the most recently *published* Publication (see
    // ContentService.getPublishedContentForSession's `supersededAt IS NULL`
    // query), which is what the assertions above actually verify — this is
    // the real backend's exact equivalent of the old model's same behavior.
    await expect.poll(() => getPackageStatus(page, v1Id)).toBe("PUBLISHED");
  });
});
