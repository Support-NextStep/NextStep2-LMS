import { test, expect } from "@playwright/test";
import { buildContentPackageZip, buildSingleSessionPackage } from "./fixtures/buildContentPackageZip";
import { loginAsAdmin, loginAsContentManager, importAndSetStatus } from "./fixtures/helpers";

const ADMIN_QA_COURSE = "admin-qa-course";
const ADMIN_QA_SUBJECT = "admin-qa-subject";

test.describe("Admin: authentication and session isolation", () => {
  test("admin login works and the admin session is isolated from Content Manager", async ({ page }) => {
    await loginAsAdmin(page, "admin@nextstep2.com");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const keys = await page.evaluate(() => ({
      admin: window.localStorage.getItem("nextstep2:adminAccount"),
      contentManager: window.localStorage.getItem("nextstep2:contentManagerAccount"),
    }));
    expect(keys.admin).toContain("admin@nextstep2.com");
    expect(keys.contentManager).toBeNull();

    // Logging into Content Manager afterwards must not touch the admin key.
    await loginAsContentManager(page, "cm@nextstep2.com");
    const keysAfter = await page.evaluate(() => ({
      admin: window.localStorage.getItem("nextstep2:adminAccount"),
      contentManager: window.localStorage.getItem("nextstep2:contentManagerAccount"),
    }));
    expect(keysAfter.admin).toContain("admin@nextstep2.com");
    expect(keysAfter.contentManager).toContain("cm@nextstep2.com");
  });

  test("admin routes reject unauthenticated users", async ({ page }) => {
    for (const path of ["/admin/dashboard", "/admin/students", "/admin/content"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });

  test("refresh preserves the admin session", async ({ page }) => {
    await loginAsAdmin(page);
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("Admin: dashboard", () => {
  test("dashboard loads and metrics/activity are derived from real data", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText("Nothing needs attention right now.")).toBeVisible();
    await expect(page.getByText("No activity yet.")).toBeVisible();
    // Never fabricated: a fresh browser has no performance records yet.
    await expect(page.locator("text=Content Awaiting Review").locator("xpath=..").getByText("0", { exact: true })).toBeVisible();

    // Create real Content Manager activity, then confirm the dashboard reflects it.
    await loginAsContentManager(page);
    const zip = await buildContentPackageZip(buildSingleSessionPackage(ADMIN_QA_COURSE, ADMIN_QA_SUBJECT, "dash-session", "DASHMARKER"));
    await importAndSetStatus(page, "dash-package.zip", zip, "draft");

    await loginAsAdmin(page);
    await expect(page.locator("text=1 content package awaiting review")).toBeVisible();
    await expect(page.getByText("Content package imported")).toBeVisible();
    await expect(page.getByText("dash-package.zip")).toBeVisible();
  });
});

test.describe("Admin: students", () => {
  test("student list loads with real data", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    await expect(page.getByText("Jordan Smith")).toBeVisible();
    await expect(page.getByText("Email not available")).toBeVisible();
  });

  test("student search filters results and shows the empty state", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/students");

    await page.getByPlaceholder("Search students...").fill("Jordan");
    await expect(page.getByText("Jordan Smith")).toBeVisible();

    await page.getByPlaceholder("Search students...").fill("no-such-student-zzz");
    await expect(page.getByText("No students found.")).toBeVisible();
    await expect(page.getByText("Jordan Smith")).toHaveCount(0);
  });

  test("student detail is read-only, shows learning/performance/portfolio info, and back navigation works", async ({ page }) => {
    // Give the student a real portfolio project first, so Admin has real
    // (non-empty-state) portfolio data to display.
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Edit Portfolio" }).click();
    await page.getByRole("button", { name: "Add Project" }).click();
    await page.getByLabel("Title").fill("Admin QA Test Project");
    await page.getByRole("button", { name: "Save Portfolio" }).click();
    await expect(page.getByText("Admin QA Test Project")).toBeVisible();

    await loginAsAdmin(page);
    await page.goto("/admin/students");
    await page.getByText("Jordan Smith").click();
    await expect(page).toHaveURL(/\/admin\/students\/.+/);

    // Profile
    await expect(page.getByRole("heading", { name: "Jordan Smith" })).toBeVisible();
    await expect(page.getByText("Not available").first()).toBeVisible(); // Email / Joined

    // Learning
    await expect(page.getByText("Overall Progress")).toBeVisible();
    await expect(page.getByText("Sessions Completed").first()).toBeVisible();

    // Performance — a fresh browser has no scored sessions; must say so honestly.
    await expect(page.getByText("Average Score")).toBeVisible();
    await expect(page.getByText("No session performance recorded yet.")).toBeVisible();

    // Portfolio reflects the real project added above.
    await expect(page.getByText("Admin QA Test Project")).toBeVisible();

    // Read-only: no editable form fields anywhere on the page.
    await expect(page.locator("input, textarea")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Portfolio" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    // Back navigation
    await page.getByText("Back to Students").click();
    await expect(page).toHaveURL(/\/admin\/students$/);
  });
});

test.describe("Admin: content", () => {
  test("content overview and course detail show correct, deduplicated status counts", async ({ page }) => {
    await loginAsContentManager(page);
    const zipFor = (sessionId: string, marker: string) =>
      buildContentPackageZip(buildSingleSessionPackage(ADMIN_QA_COURSE, ADMIN_QA_SUBJECT, sessionId, marker));

    await importAndSetStatus(page, "qa-published.zip", await zipFor("session-published", "PUBMARK"), "published");
    await importAndSetStatus(page, "qa-draft.zip", await zipFor("session-draft", "DRAFTMARK"), "draft");
    await importAndSetStatus(page, "qa-changes.zip", await zipFor("session-changes", "CHGMARK"), "changes_requested");
    await importAndSetStatus(page, "qa-approved.zip", await zipFor("session-approved", "APPMARK"), "approved");

    await loginAsAdmin(page);
    await page.goto("/admin/content");
    await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();

    const courseCard = page.getByText("QA Fixture Course").first().locator("xpath=ancestor::a[1]");
    await expect(courseCard.getByText("1 subject")).toBeVisible();
    await expect(courseCard.getByText("4 sessions")).toBeVisible();
    await expect(courseCard.getByText("1 Published", { exact: true })).toBeVisible();
    await expect(courseCard.getByText("1 Approved", { exact: true })).toBeVisible();
    await expect(courseCard.getByText("1 Changes Requested", { exact: true })).toBeVisible();
    await expect(courseCard.getByText("1 Draft", { exact: true })).toBeVisible();

    // No Content Manager review/approve/publish controls on the overview.
    await expect(page.getByRole("button", { name: "Approve Content" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);

    // Drill into the course.
    await courseCard.click();
    await expect(page).toHaveURL(new RegExp(`/admin/content/${ADMIN_QA_COURSE}`));
    await expect(page.getByText("QA Fixture Subject")).toBeVisible();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Changes Requested", { exact: true })).toBeVisible();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();

    // No review/approve/publish controls on the drill-down either.
    await expect(page.getByRole("button", { name: "Approve Content" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);

    // Back navigation off the drill-down.
    await page.getByText("Back to Content").click();
    await expect(page).toHaveURL(/\/admin\/content$/);
  });
});

test.describe("Admin: cross-role isolation", () => {
  test("student and Content Manager routes never expose Admin links", async ({ page }) => {
    for (const path of ["/dashboard", "/my-course"]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }

    await loginAsContentManager(page);
    for (const path of ["/content/dashboard", "/content/import"]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }
  });
});

test.describe("Admin: responsive layout", () => {
  test("mobile layout renders with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    for (const path of ["/admin/dashboard", "/admin/students", "/admin/content"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }

    await page.goto("/admin/students");
    await page.getByText("Jordan Smith").click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
