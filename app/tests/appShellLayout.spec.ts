import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsContentManager } from "./fixtures/helpers";

test.describe("App shell: per-role navigation", () => {
  test("Student uses the shared shell with exactly its four nav items and no role badge", async ({ page }) => {
    await page.goto("/dashboard");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "My Course" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Performance" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Portfolio" })).toBeVisible();
    await expect(sidebar.getByRole("link")).toHaveCount(4);

    // No leaked role links, and no role badge (Student never had one).
    await expect(page.getByText("Content Manager")).toHaveCount(0);
    await expect(page.getByText("Admin", { exact: true })).toHaveCount(0);
  });

  test("Content Manager uses the shared shell with exactly one Content nav item and an identifying badge", async ({ page }) => {
    await loginAsContentManager(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Content" })).toBeVisible();
    await expect(sidebar.getByRole("link")).toHaveCount(1);

    await expect(page.getByText("Content Manager").first()).toBeVisible();
  });

  test("Admin uses the shared shell with exactly Dashboard/Students/Content and an identifying badge", async ({ page }) => {
    await loginAsAdmin(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Students" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Content" })).toBeVisible();
    await expect(sidebar.getByRole("link")).toHaveCount(3);

    await expect(page.getByText("Admin", { exact: true }).first()).toBeVisible();
  });

  test("active navigation state highlights the current section for each role", async ({ page }) => {
    // Student
    await page.goto("/performance");
    await expect(page.locator("aside").getByRole("link", { name: "Performance" })).toHaveClass(/bg-brand-50/);
    await expect(page.locator("aside").getByRole("link", { name: "Dashboard" })).not.toHaveClass(/bg-brand-50/);

    // Content Manager
    await loginAsContentManager(page);
    await page.goto("/content/dashboard");
    await expect(page.locator("aside").getByRole("link", { name: "Content" })).toHaveClass(/bg-brand-50/);

    // Admin
    await loginAsAdmin(page);
    await page.goto("/admin/students");
    await expect(page.locator("aside").getByRole("link", { name: "Students" })).toHaveClass(/bg-brand-50/);
    await expect(page.locator("aside").getByRole("link", { name: "Dashboard" })).not.toHaveClass(/bg-brand-50/);
    await expect(page.locator("aside").getByRole("link", { name: "Content" })).not.toHaveClass(/bg-brand-50/);
  });
});

test.describe("App shell: authentication boundaries", () => {
  test("login/signup pages never render the authenticated shell", async ({ page }) => {
    for (const path of ["/login", "/signup", "/content/login", "/admin/login"]) {
      await page.goto(path);
      await expect(page.locator("aside")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Log Out" })).toHaveCount(0);
    }
  });

  test("logout works for Content Manager and Admin and returns to their own login", async ({ page }) => {
    await loginAsContentManager(page);
    await page.locator("aside").getByRole("button", { name: "Log Out" }).click();
    await expect(page).toHaveURL(/\/content\/login/);
    await page.goto("/content/dashboard");
    await expect(page).toHaveURL(/\/content\/login/); // logout actually cleared the session

    await loginAsAdmin(page);
    await page.locator("aside").getByRole("button", { name: "Log Out" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("role sessions stay isolated and refresh preserves the authenticated shell", async ({ page }) => {
    await loginAsContentManager(page, "cm@nextstep2.com");
    await loginAsAdmin(page, "admin@nextstep2.com");

    const stored = await page.evaluate(() => ({
      admin: window.localStorage.getItem("nextstep2:adminAccount"),
      contentManager: window.localStorage.getItem("nextstep2:contentManagerAccount"),
    }));
    expect(stored.admin).toContain("admin@nextstep2.com");
    expect(stored.contentManager).toContain("cm@nextstep2.com");

    // Refresh keeps the Admin shell (currently logged-in role).
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator("aside")).toBeVisible();

    // Content Manager's own session is still intact underneath.
    await page.goto("/content/dashboard");
    await expect(page).toHaveURL(/\/content\/dashboard/);
    await page.reload();
    await expect(page).toHaveURL(/\/content\/dashboard/);
    await expect(page.locator("aside")).toBeVisible();
  });
});

test.describe("App shell: responsive behavior", () => {
  test("mobile drawer navigation works and no horizontal overflow at 375/768/1366", async ({ page }) => {
    await loginAsAdmin(page);

    for (const width of [375, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/dashboard");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }

    // Mobile drawer: sidebar itself is hidden below lg, hamburger opens an overlay drawer with the same nav.
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/admin/dashboard");
    await expect(page.locator("aside")).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawerNav = page.locator('div[class*="shadow-xl"]');
    await expect(drawerNav.getByRole("link", { name: "Students" })).toBeVisible();

    await drawerNav.getByRole("link", { name: "Students" }).click();
    await expect(page).toHaveURL(/\/admin\/students/);
    // Navigating closes the drawer.
    await expect(page.locator('div[class*="shadow-xl"]')).toHaveCount(0);
  });
});
