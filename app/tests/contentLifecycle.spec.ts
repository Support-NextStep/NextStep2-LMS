import { test, expect } from "@playwright/test";
import {
  buildContentPackageZip,
  buildSingleSessionPackage,
  REAL_COURSE_ID,
  REAL_SUBJECT_ID,
  REAL_SESSION_ID,
} from "./fixtures/buildContentPackageZip";
import {
  loginAsContentManager,
  importPackage,
  getPackageIdByFileName,
  readStoredPackages,
  checkAllReviewBoxes,
} from "./fixtures/helpers";

const V1_MARKER = "PKGMARKERV1-REST-API-INTEGRATION-CONTENT";
const V2_MARKER = "PKGMARKERV2-REST-API-INTEGRATION-CONTENT-CORRECTED";

function packageWithMarker(marker: string) {
  return buildSingleSessionPackage(REAL_COURSE_ID, REAL_SUBJECT_ID, REAL_SESSION_ID, marker);
}

const studentSessionUrl = `/session/${REAL_SESSION_ID}`;

test.describe("Content Manager -> Student: full publish lifecycle", () => {
  test("import -> draft -> changes requested -> re-import -> approve -> publish -> student sees it", async ({ page }) => {
    await loginAsContentManager(page);

    // ---- 1. Import a valid content ZIP ----
    const v1Zip = await buildContentPackageZip(packageWithMarker(V1_MARKER));
    await importPackage(page, "session-v1.zip", v1Zip);
    await expect(page.getByText("Package saved as", { exact: false })).toBeVisible();

    const pkgId = await getPackageIdByFileName(page, "session-v1.zip");

    // ---- 2. Verify it appears as DRAFT ----
    const stored = await readStoredPackages(page);
    expect(stored.find((p) => p.id === pkgId)?.status).toBe("draft");

    await page.goto("/content/dashboard");
    const draftHeading = page.getByRole("heading", { name: "session-v1.zip" });
    await expect(draftHeading).toBeVisible();
    const draftCard = draftHeading.locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await expect(draftCard.getByText("Draft", { exact: true })).toBeVisible();

    // ---- 3. Verify the student does not see the new content (Draft) ----
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // ---- 4. Open Review ----
    await page.goto(`/content/package/${pkgId}`);
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

    // ---- 6. Verify status becomes CHANGES REQUESTED ----
    await expect(page.locator("text=Changes Requested").first()).toBeVisible();
    await page.goto("/content/dashboard");
    const changesCard = page
      .getByRole("heading", { name: "session-v1.zip" })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await expect(changesCard.getByText("Changes Req", { exact: false })).toBeVisible();

    // Still invisible to students while changes are requested.
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // ---- 7. Re-import the corrected package ----
    const correctedZip = await buildContentPackageZip(packageWithMarker(V1_MARKER));
    await importPackage(page, "session-v1-corrected.zip", correctedZip);
    const correctedId = await getPackageIdByFileName(page, "session-v1-corrected.zip");
    expect((await readStoredPackages(page)).find((p) => p.id === correctedId)?.status).toBe("draft");

    // ---- 8. Review the corrected package + complete the checklist ----
    await page.goto(`/content/package/${correctedId}`);
    await checkAllReviewBoxes(page);
    await expect(page.getByRole("button", { name: "Approve Content" })).toBeEnabled();

    // ---- 9. Approve Content ----
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Approve Content" }).click();

    // ---- 10. Verify status becomes APPROVED ----
    await expect(page.getByText("Content approved")).toBeVisible();
    expect((await readStoredPackages(page)).find((p) => p.id === correctedId)?.status).toBe("approved");

    // ---- 11. Verify the student still does not see it (Approved) ----
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // ---- 12. Publish ----
    await page.goto(`/content/package/${correctedId}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Publish" }).click();

    // ---- 13. Verify status becomes PUBLISHED ----
    await expect(page.locator("text=Published").first()).toBeVisible();
    expect((await readStoredPackages(page)).find((p) => p.id === correctedId)?.status).toBe("published");

    // The original changes-requested package is untouched by the corrected re-import.
    expect((await readStoredPackages(page)).find((p) => p.id === pkgId)?.status).toBe("changes_requested");

    // ---- 14/15. Open the same course/subject/session as a student; verify published content shows ----
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();
  });
});

test.describe("Content Manager -> Student: replacement / versioning", () => {
  test("publishing a corrected v2 replaces v1 for students, never exposing v2's draft/approved states", async ({ page }) => {
    await loginAsContentManager(page);

    // Background: v1 is already imported, reviewed, and published.
    const v1Zip = await buildContentPackageZip(packageWithMarker(V1_MARKER));
    await importPackage(page, "session-v1.zip", v1Zip);
    const v1Id = await getPackageIdByFileName(page, "session-v1.zip");
    await page.goto(`/content/package/${v1Id}`);
    await checkAllReviewBoxes(page);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Approve Content" }).click();
    await expect(page.getByText("Content approved")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("text=Published").first()).toBeVisible();

    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();

    // Import v2 (the corrected package) for the same course/subject/session.
    const v2Zip = await buildContentPackageZip(packageWithMarker(V2_MARKER));
    await importPackage(page, "session-v2.zip", v2Zip);
    const v2Id = await getPackageIdByFileName(page, "session-v2.zip");
    expect((await readStoredPackages(page)).find((p) => p.id === v2Id)?.status).toBe("draft");

    // Draft v2 must not be visible — v1 must remain the live version.
    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();
    await expect(page.getByText(V2_MARKER, { exact: false })).toHaveCount(0);

    // Review + Approve v2 — still must not be visible; v1 still live.
    await page.goto(`/content/package/${v2Id}`);
    await checkAllReviewBoxes(page);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Approve Content" }).click();
    await expect(page.getByText("Content approved")).toBeVisible();

    await page.goto(studentSessionUrl);
    await expect(page.getByText(V1_MARKER, { exact: false })).toBeVisible();
    await expect(page.getByText(V2_MARKER, { exact: false })).toHaveCount(0);

    // Publish v2 — now v2 replaces v1 for students.
    await page.goto(`/content/package/${v2Id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("text=Published").first()).toBeVisible();

    await page.goto(studentSessionUrl);
    await expect(page.getByText(V2_MARKER, { exact: false })).toBeVisible();
    await expect(page.getByText(V1_MARKER, { exact: false })).toHaveCount(0);

    // Known MVP limitation (documented, not a bug under test here): v1's own
    // record stays "published" in the Content Manager's records — there is no
    // explicit supersede/unpublish step. Student-facing resolution correctly
    // prefers the most recently *published* package (see publishedContent.ts),
    // which is what the assertions above actually verify.
    expect((await readStoredPackages(page)).find((p) => p.id === v1Id)?.status).toBe("published");
  });
});
