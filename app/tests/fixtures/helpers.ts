// ---------------------------------------------------------------------------
// Shared Playwright helpers for the Content Manager -> Student verification
// suite. Not a spec file — no .spec.ts suffix.
// ---------------------------------------------------------------------------
import { expect, type Page } from "@playwright/test";

export async function loginAsContentManager(page: Page, email = "manager@example.com") {
  await page.goto("/content/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/content\/dashboard/);
}

export async function loginAsAdmin(page: Page, email = "admin@example.com") {
  await page.goto("/admin/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

/** Uploads a package via the real Import flow and waits for the validation result screen. */
export async function importPackage(page: Page, fileName: string, zip: Buffer) {
  await page.goto("/content/import");
  await page.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: "application/zip", buffer: zip });
  await expect(page.getByText(/Package saved as|could not be imported/)).toBeVisible();
}

export type StoredPackage = { id: string; fileName: string; status: string };

/** Reads the raw contentPackages localStorage record — used to get a package's id for direct navigation, and to assert persisted status without depending on UI text. */
export async function readStoredPackages(page: Page): Promise<StoredPackage[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("nextstep2:contentPackages");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { id: string; fileName: string; status: string }[];
    return parsed.map((p) => ({ id: p.id, fileName: p.fileName, status: p.status }));
  });
}

export async function getPackageIdByFileName(page: Page, fileName: string): Promise<string> {
  const all = await readStoredPackages(page);
  const match = all.find((p) => p.fileName === fileName);
  if (!match) throw new Error(`No stored content package found with fileName "${fileName}"`);
  return match.id;
}

/** Ticks every review checklist box on the Content Package Detail page (currently open). */
export async function checkAllReviewBoxes(page: Page) {
  const labels = [
    "Course information reviewed",
    "Subject structure reviewed",
    "Session content reviewed",
    "Videos reviewed",
    "Practice activities reviewed",
    "AI Help reviewed",
    "Exercises reviewed",
    "Content is ready for students",
  ];
  for (const label of labels) {
    await page.getByText(label, { exact: true }).click();
  }
}

/**
 * Drives a package all the way from import to Published, ticking every
 * checklist box. Used to set up background state (e.g. "v1 is already
 * published") for tests that are really about something else.
 */
export async function importAndPublish(page: Page, fileName: string, zip: Buffer): Promise<string> {
  await importPackage(page, fileName, zip);
  const id = await getPackageIdByFileName(page, fileName);

  await page.goto(`/content/package/${id}`);
  await checkAllReviewBoxes(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve Content" }).click();
  await expect(page.getByText("Content approved")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("text=Published").first()).toBeVisible();

  return id;
}

/**
 * Drives a package to a specific status via the real Content Manager UI —
 * used to build a mix of draft/changes_requested/approved/published packages
 * for Admin's read-only content overview tests.
 */
export async function importAndSetStatus(
  page: Page,
  fileName: string,
  zip: Buffer,
  target: "draft" | "changes_requested" | "approved" | "published",
  notes = "Needs updates before this can ship."
): Promise<string> {
  await importPackage(page, fileName, zip);
  const id = await getPackageIdByFileName(page, fileName);
  if (target === "draft") return id;

  await page.goto(`/content/package/${id}`);

  if (target === "changes_requested") {
    await page.fill("textarea", notes);
    await page.getByRole("button", { name: "Request Changes" }).click();
    await expect(page.locator("text=Changes Requested").first()).toBeVisible();
    return id;
  }

  await checkAllReviewBoxes(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve Content" }).click();
  await expect(page.getByText("Content approved")).toBeVisible();
  if (target === "approved") return id;

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("text=Published").first()).toBeVisible();
  return id;
}
