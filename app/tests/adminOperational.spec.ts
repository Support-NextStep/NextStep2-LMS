import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsDisposableStudent } from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Day 7 — Admin Operational Views Completion.
//
// Covers exactly the new real, backend-backed Admin behavior added today
// (server/src/admin — GET /admin/students, GET /admin/students/:id,
// GET /admin/dashboard) — replacing the old "Admin MVP" prototype
// (getAllStudentIds()'s one synthetic id, exerciseSubmissions.ts's
// localStorage-only submissions, both now deleted). adminFlow.spec.ts covers
// the existing Admin UI end to end; this file specifically proves the new
// data is real, correctly scoped per student, and properly role-gated.
// ---------------------------------------------------------------------------

const SESSION_ID = "components-and-state";

test.describe("Day 7: real Admin student roster and detail", () => {
  test("roster returns real, multiple students from the backend, and non-Admin roles are rejected", async ({ page }) => {
    // Two fresh, real, disposable students — proves the roster is not the
    // old one-synthetic-id mock.
    const emailA = await loginAsDisposableStudent(page, "adminop-a");
    const idA = (await (await page.request.get("http://localhost:3000/auth/me")).json()).id as string;

    await loginAsAdmin(page);
    const roster = (await (await page.request.get("http://localhost:3000/admin/students")).json()) as { id: string; email: string }[];
    expect(roster.length).toBeGreaterThanOrEqual(2); // the real seed student + at least this new one
    expect(roster.some((s) => s.id === idA && s.email === emailA)).toBe(true);
    // Never a password hash or any other secret.
    expect(JSON.stringify(roster)).not.toContain("passwordHash");
    expect(JSON.stringify(roster)).not.toContain("password_hash");

    // Non-Admin roles genuinely rejected server-side, not just hidden in the UI.
    await loginAsDisposableStudent(page, "adminop-blocked");
    const asStudent = await page.request.get("http://localhost:3000/admin/students");
    expect(asStudent.status()).toBe(403);
    const asStudentDetail = await page.request.get(`http://localhost:3000/admin/students/${idA}`);
    expect(asStudentDetail.status()).toBe(403);
  });

  test("student detail returns the correct student's real progress/submission/evaluation, with no cross-student contamination", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsDisposableStudent(pageA, "adminop-detail-a");
    const idA = (await (await pageA.request.get("http://localhost:3000/auth/me")).json()).id as string;

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsDisposableStudent(pageB, "adminop-detail-b");
    const idB = (await (await pageB.request.get("http://localhost:3000/auth/me")).json()).id as string;

    // Student A does real, verifiable work; Student B does nothing.
    await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress/learning/complete`);
    const submitRes = await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`, {
      data: { files: [{ name: "solution.html", content: "<form><input name=\"name\" required></form>" }] },
    });
    expect(submitRes.status()).toBe(201);

    // Poll for the real evaluation to complete.
    let evaluated = false;
    for (let i = 0; i < 10 && !evaluated; i++) {
      const subs = (await (await pageA.request.get(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`)).json()) as {
        evaluation: { status: string } | null;
      }[];
      evaluated = subs.some((s) => s.evaluation?.status === "EVALUATED" || s.evaluation?.status === "FAILED");
      if (!evaluated) await pageA.waitForTimeout(1500);
    }

    const contextAdmin = await browser.newContext();
    const pageAdmin = await contextAdmin.newPage();
    await loginAsAdmin(pageAdmin);

    const detailA = await (await pageAdmin.request.get(`http://localhost:3000/admin/students/${idA}`)).json();
    expect(detailA.id).toBe(idA);
    expect(detailA.activityProgress.some((a: { activityType: string }) => a.activityType === "LEARNING")).toBe(true);
    expect(detailA.submissions.length).toBe(1);
    expect(detailA.submissions[0].sessionId).toBe(SESSION_ID);
    expect(["EVALUATED", "FAILED", "PENDING", "EVALUATING"]).toContain(detailA.submissions[0].evaluation?.status);
    // No secrets in the evaluation payload either.
    expect(JSON.stringify(detailA)).not.toMatch(/hf_[a-zA-Z0-9]/);
    expect(JSON.stringify(detailA)).not.toContain("retryCount");
    expect(JSON.stringify(detailA)).not.toContain("failureReason");

    const detailB = await (await pageAdmin.request.get(`http://localhost:3000/admin/students/${idB}`)).json();
    expect(detailB.id).toBe(idB);
    expect(detailB.activityProgress.length).toBe(0);
    expect(detailB.submissions.length).toBe(0);

    // Changing the studentId in the URL never returns the wrong student's data.
    expect(detailA.id).not.toBe(detailB.id);
    expect(JSON.stringify(detailB)).not.toContain(idA);

    await contextA.close();
    await contextB.close();
    await contextAdmin.close();
  });

  test("dashboard student/course metrics match direct API counts", async ({ page }) => {
    await loginAsAdmin(page);
    const [dashboard, roster, courses] = await Promise.all([
      page.request.get("http://localhost:3000/admin/dashboard").then((r) => r.json()),
      page.request.get("http://localhost:3000/admin/students").then((r) => r.json()),
      page.request.get("http://localhost:3000/courses").then((r) => r.json()),
    ]);
    expect(dashboard.studentsCount).toBe(roster.length);
    expect(dashboard.activeStudentsCount).toBe(roster.filter((s: { isActive: boolean }) => s.isActive).length);

    await page.goto("/admin/dashboard");
    await expect(page.getByText("Students", { exact: true }).locator("xpath=..").getByText(String(dashboard.studentsCount), { exact: true })).toBeVisible();
    await expect(
      page.getByText("Active Students", { exact: true }).locator("xpath=..").getByText(String(dashboard.activeStudentsCount), { exact: true })
    ).toBeVisible();
    await expect(page.getByText("Courses", { exact: true }).locator("xpath=..").getByText(String(courses.length), { exact: true })).toBeVisible();
  });
});
