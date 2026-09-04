import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsContentAuthor, loginAsContentReviewer, authorAndSetStatus, REAL_COURSE_ID, REAL_SUBJECT_ID } from "./fixtures/helpers";

// The old ZIP-based fixtures could invent an entirely new, arbitrary
// course/subject (e.g. "admin-qa-course") packaged alongside its sessions.
// The real authoring workspace deliberately can't do that — Course/Subject
// structure is platform-owned (see NEXTSTEP2_BACKEND_DOMAIN_MODEL.md); the
// Content Team authors SESSIONS within an existing curated course/subject,
// never new courses/subjects. These tests now author their QA sessions into
// the one real curated course/subject instead, which is just as isolated:
// each Playwright test gets a fresh browser context/localStorage, so no
// unrelated package exists there to skew the counts being asserted.

test.describe("Admin: authentication and session isolation", () => {
  test("admin login works, and logging into a different role afterward really ends the admin session (real single-cookie auth, not per-role localStorage coexistence)", async ({ page }) => {
    // Real backend auth is one httpOnly access_token cookie per browser
    // context (path: "/") — there is no per-role localStorage account key to
    // "isolate" any more (that was the old mock-login architecture). The
    // real, current guarantee this test can actually make is the opposite of
    // the old one: logging into a second role on the same page genuinely
    // logs the first one out, and each login correctly reflects its own
    // account's identity while it's the active session.
    await loginAsAdmin(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    const meAsAdmin = await page.request.get("http://localhost:3000/auth/me");
    expect((await meAsAdmin.json()).role).toBe("ADMIN");

    await loginAsContentAuthor(page);
    const meAsAuthor = await page.request.get("http://localhost:3000/auth/me");
    expect((await meAsAuthor.json()).role).toBe("CONTENT_AUTHOR");

    // The admin session is really gone now — a direct API call with this
    // same page's cookies no longer authenticates as Admin at all.
    const adminApiAfter = await page.request.get("http://localhost:3000/admin/students");
    expect(adminApiAfter.status()).toBe(403); // CONTENT_AUTHOR is a real, authenticated-but-wrong role, not "logged out"
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
    // "No activity yet." can never be asserted honestly here: the real
    // seeded curriculum (components-and-state / "HTML Forms (seed)") is
    // already PUBLISHED, and the Admin activity feed is a real, cross-author
    // view over EVERY submitted package — that seed entry always appears.
    // What IS still true on a clean DB is that nothing is currently
    // awaiting review or has changes requested.
    await expect(page.getByText("Nothing needs attention right now.")).toBeVisible();
    await expect(page.getByText("Content package published")).toBeVisible();
    await expect(page.getByText("HTML Forms (seed)")).toBeVisible();
    await expect(page.locator("text=Content Awaiting Review").locator("xpath=..").getByText("0", { exact: true })).toBeVisible();

    // Create real Content Author activity, then confirm the dashboard reflects it.
    await loginAsContentAuthor(page);
    await authorAndSetStatus(
      page,
      { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: "Admin Dashboard QA Session", objective: "DASHMARKER" },
      "draft"
    );

    await loginAsAdmin(page);
    await expect(page.locator("text=1 content package awaiting review")).toBeVisible();
    // AdminDashboard.tsx's real, current ACTIVITY_LABEL map (per-status,
    // not the old ZIP-era fixed "Content package imported" copy) labels a
    // READY_FOR_REVIEW package's activity row "Content package submitted
    // for review".
    await expect(page.getByText("Content package submitted for review")).toBeVisible();
    await expect(page.getByText("Admin Dashboard QA Session")).toBeVisible();
  });
});

test.describe("Admin: students", () => {
  test("student list loads with real data", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    // Real, backend-derived roster (GET /admin/students) — the seed
    // student's real email is now always shown (never the old mock's
    // "Email not available", since a real User row always has one).
    await expect(page.getByText("Jordan Smith")).toBeVisible();
    await expect(page.getByText("jordan.smith@nextstep2.dev")).toBeVisible();
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

  test("student detail is read-only, shows real learning/performance info from the backend, and back navigation works", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/students");
    await page.getByText("Jordan Smith").click();
    await expect(page).toHaveURL(/\/admin\/students\/.+/);

    // Profile — real User fields (GET /admin/students/:id), never the old
    // mock's fixed "Not available" placeholders.
    await expect(page.getByRole("heading", { name: "Jordan Smith" })).toBeVisible();
    await expect(page.getByText("jordan.smith@nextstep2.dev")).toBeVisible();

    // Learning
    await expect(page.getByText("Overall Progress")).toBeVisible();
    await expect(page.getByText("Sessions Completed").first()).toBeVisible();

    // Performance — real per-student data; this seed student has never had
    // an EVALUATED exercise submission, so "not scored yet" is the honest,
    // current state (not a fabricated absence).
    await expect(page.getByText("Average Score")).toBeVisible();
    await expect(page.getByText("No session performance recorded yet.")).toBeVisible();

    // Read-only: no editable form fields anywhere on the page.
    await expect(page.locator("input, textarea")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    // Back navigation
    await page.getByText("Back to Students").click();
    await expect(page).toHaveURL(/\/admin\/students$/);
  });
});

// Portfolio itself remains a separate, pre-existing, localStorage-only
// feature (Day 6 audit) — out of Day 7's Admin-completion scope. This test
// verifies only what Admin's Student Detail page actually does with it
// today: render its real empty-state copy for a student who has never used
// Portfolio at all (localStorage is scoped per real backend id now — see
// AdminStudentDetail.tsx — so a real student who never opened /portfolio on
// this browser correctly shows no projects/skills, not fabricated data).
test.describe("Admin: student detail — Portfolio section (separate from Admin operational scope)", () => {
  test("Portfolio section shows its real empty state for a student with no local portfolio data", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/students");
    await page.getByText("Jordan Smith").click();

    await expect(page.getByText("Portfolio", { exact: true })).toBeVisible();
    await expect(page.getByText("No projects added yet.")).toBeVisible();
    await expect(page.getByText("No skills added yet.")).toBeVisible();
  });
});

test.describe("Admin: content", () => {
  test("content overview and course detail show correct, deduplicated status counts", async ({ page }) => {
    // authorAndSetStatus's "published" and "approved"/"changes_requested"
    // branches all end by logging in as Content Reviewer (a real single
    // httpOnly cookie per browser context — logging into a second role
    // really does end the first one, same as every other multi-role test in
    // this suite). Each call below must start freshly logged in as Content
    // Author again before opening the authoring workspace.
    const author = async (sessionTitle: string, objective: string, status: "draft" | "changes_requested" | "approved" | "published") => {
      await loginAsContentAuthor(page);
      return authorAndSetStatus(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle, objective }, status);
    };

    // This is a real, cross-author, cross-test view (GET /review/packages)
    // — the real seeded curriculum (HTML Forms) is always PUBLISHED in it,
    // and running this file together with other suites/tests can leave its
    // own prior packages behind too. Capture the real baseline first and
    // assert deltas, rather than absolute counts, so this test's correctness
    // never depends on being the only thing that has ever touched this
    // course (Day 5/6 established the same discipline for contentLifecycle/
    // contentIsolation's shared real-session assertions).
    await loginAsAdmin(page);
    const baseline = await page.request.get(`http://localhost:3000/review/packages?status=ALL`).then((r) => r.json());
    const baselineForCourse = (baseline as { sessionId: string }[]).length; // course-agnostic count is fine here — REAL_COURSE_ID is the only course with any packages at all
    const countByStatus = (status: string) => (baseline as { status: string }[]).filter((p) => p.status === status).length;
    const basePublished = countByStatus("PUBLISHED");
    const basePending = countByStatus("READY_FOR_REVIEW");
    const baseChanges = countByStatus("CHANGES_REQUESTED");
    const baseApproved = countByStatus("APPROVED");

    await author("QA Published Session", "PUBMARK", "published");
    await author("QA Draft Session", "DRAFTMARK", "draft");
    await author("QA Changes Session", "CHGMARK", "changes_requested");
    await author("QA Approved Session", "APPMARK", "approved");

    await loginAsAdmin(page);
    await page.goto("/admin/content");
    await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();

    const courseCard = page.getByText("Full-Stack Web Development").first().locator("xpath=ancestor::a[1]");
    await expect(courseCard.getByText("1 subject")).toBeVisible();
    await expect(courseCard.getByText(`${baselineForCourse + 4} sessions`)).toBeVisible();
    await expect(courseCard.getByText(`${basePublished + 1} Published`, { exact: true })).toBeVisible();
    await expect(courseCard.getByText(`${baseApproved + 1} Approved`, { exact: true })).toBeVisible();
    await expect(courseCard.getByText(`${baseChanges + 1} Changes Requested`, { exact: true })).toBeVisible();
    // "draft" here means the pre-submission-review "pending review" state
    // (see authorAndSetStatus's own doc comment) — AdminContent.tsx
    // deliberately never shows a literal-DRAFT pill at all (a not-yet-
    // submitted draft is the author's own, not an admin-visible fact), so
    // the real, current label for this package is "Pending Review".
    await expect(courseCard.getByText(`${basePending + 1} Pending Review`, { exact: true })).toBeVisible();

    // No Content Reviewer review/approve/publish controls on the overview.
    await expect(page.getByRole("button", { name: "Approve Content" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request Changes" })).toHaveCount(0);

    // Drill into the course.
    await courseCard.click();
    await expect(page).toHaveURL(new RegExp(`/admin/content/${REAL_COURSE_ID}`));
    await expect(page.getByText("Frontend Development")).toBeVisible();
    // .first() since the real seeded session (HTML Forms) is also PUBLISHED
    // in this same subject — this test only needs to confirm each status
    // label renders at least once, not an exact count (already asserted via
    // the baseline-delta pills on the overview page above).
    await expect(page.getByText("Published", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pending Review", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Changes Requested", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();

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
  test("student, Content Author, and Content Reviewer routes never expose Admin links", async ({ page }) => {
    for (const path of ["/dashboard", "/my-course"]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }

    await loginAsContentAuthor(page);
    for (const path of ["/content/dashboard", `/content/courses/${REAL_COURSE_ID}`, `/content/courses/${REAL_COURSE_ID}/subjects/${REAL_SUBJECT_ID}`]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }

    await loginAsContentReviewer(page);
    for (const path of ["/review/dashboard", "/review/pending", "/review/changes-requested", "/review/approved", "/review/published"]) {
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
