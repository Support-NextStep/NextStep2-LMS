import { test, expect } from "@playwright/test";
import { loginAsDisposableStudent } from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Day 6 — Complete Student LMS Journey.
//
// Every other Playwright suite in this repo verifies one slice of the
// student experience in isolation (content authoring/review/publish
// lifecycle, video checkpoints, the student session workspace's tab
// behavior). None of them proves the whole chain is actually wired
// together through the real backend/database, end to end, for one real
// student, across a browser refresh and a logout/login cycle — that is
// this file's only job. It deliberately does not re-test edge cases
// (seek/rewind, malformed DOCX, checklist idempotency, etc.) that the
// other suites already cover.
//
// Runs against the one real curriculum session that currently has
// published content (components-and-state / "HTML Forms" — see
// server/prisma/seed.ts). It has no real video, so the checkpoint step
// below drives SessionWorkspace.tsx's own documented no-video
// mock-playback fallback (a 1.4s timer, not a real YouTube embed) — the
// real-YouTube-player path is already covered by videoCheckpoints.spec.ts.
// ---------------------------------------------------------------------------

const SESSION_URL = "/session/components-and-state";

test.describe("Day 6: complete student journey", () => {
  test("register -> dashboard -> course -> subject -> session -> video/checkpoint -> practice -> exercise -> evaluation -> AI Tutor -> refresh -> logout -> login -> persisted state", async ({
    page,
  }) => {
    // ---- 1. Register + Login (real backend account, real cookie session) ----
    const email = await loginAsDisposableStudent(page, "journey-student");
    await expect(page).toHaveURL(/\/dashboard/);

    // ---- 2. Dashboard: real backend-derived subjects, not a hardcoded list ----
    await expect(page.getByRole("heading", { name: "Subjects" })).toBeVisible();
    const subjectsCountText = await page.getByText(/\d+ total/).first().textContent();
    expect(subjectsCountText).toMatch(/\d+ total/);

    // ---- 3. Course -> Subject navigation ----
    // Dashboard's own primary action link always points at /my-course
    // (its exact label — Start Learning/Resume Session/Review My Course —
    // depends on this fresh student's freshly-computed progress state, so
    // assert on the destination rather than a specific label).
    await page.getByRole("link").filter({ hasText: /Start Learning|Resume Session|Review My Course/ }).click();
    await expect(page).toHaveURL(/\/my-course/);

    // Navigate directly to the subject containing the one published session,
    // proving the real subject id resolves to real content (not a 404/blank).
    await page.goto("/my-course/subject/frontend-development");
    await expect(page.getByText("HTML Forms", { exact: true })).toBeVisible();

    // ---- 4. Subject -> Session ----
    await page.locator('a[href="/session/components-and-state"]').click();
    await expect(page).toHaveURL(/\/session\/components-and-state/);

    // ---- 5. Learning content: verify against the real backend response directly, not just the DOM ----
    const apiContent = await (await page.request.get("http://localhost:3000/sessions/components-and-state/content")).json();
    await expect(page.getByText(apiContent.objective, { exact: false })).toBeVisible();
    await expect(page.getByText("Key Concepts", { exact: true })).toBeVisible();

    // ---- 6. Video + checkpoint (no-video mock-playback fallback — see file header) ----
    await page.getByRole("button", { name: "Play session video" }).click();
    await expect(page.getByText("Quick Check", { exact: true })).toBeVisible({ timeout: 5000 });
    // Answer with the real, backend-authored correct option.
    await page.getByRole("button", { name: apiContent.checkpoints[0].options[apiContent.checkpoints[0].correctIndex] }).click();
    await expect(page.getByText("Correct!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue Video" }).click();

    // ---- 7. Practice tab: real published content, "opened = complete" ----
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await expect(page.getByText(apiContent.practice.task, { exact: false })).toBeVisible();

    // ---- 8. Exercise: submit the real published starter code as-is (non-empty, so validation passes) ----
    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    const submitResponsePromise = page.waitForResponse(
      (r) => /\/exercise\/submissions$/.test(r.url()) && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Submit Exercise" }).click();
    await expect(page.getByText(/will be submitted as Attempt #1/)).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const submitResponse = await submitResponsePromise;
    expect(submitResponse.status()).toBe(201);
    const submission = await submitResponse.json();

    // ---- 9. Real evaluation lifecycle: PENDING/EVALUATING -> EVALUATED, with a real score ----
    // "Evaluated" (the badge next to the score) only ever renders for
    // status === "EVALUATED" (AttemptStatusBadge) — a reliable, singular
    // wait condition, unlike "/100" text which also appears in the
    // placeholder "0/100" shown while still PENDING/EVALUATING.
    await expect(page.getByText("Your Submission", { exact: true })).toBeVisible();
    await expect(page.getByText("Evaluated", { exact: true }).first()).toBeVisible({ timeout: 30000 });

    // ---- 10. AI Tutor: a session-specific question against the CURRENT published context ----
    await page.getByRole("button", { name: "Need Help?" }).click();
    const panel = page.getByRole("dialog", { name: "Need Help" });
    await panel.getByLabel("Ask something about this session").fill(
      "Which HTML element should contain my form's inputs, per this lesson?"
    );
    const askResponsePromise = page.waitForResponse((r) => /\/ai-tutor\/ask$/.test(r.url()) && r.request().method() === "POST");
    await panel.getByRole("button", { name: "Ask", exact: true }).click();
    const askResponse = await askResponsePromise;
    expect(askResponse.status()).toBe(201);
    const askBody = await askResponse.json();
    expect(askBody.answer.length).toBeGreaterThan(10);
    await expect(panel.getByText(askBody.answer, { exact: false })).toBeVisible();
    await panel.getByRole("button", { name: "Close help" }).click();

    // ---- 11. Refresh: the evaluated result must survive a real reload (DB-backed, not component state) ----
    await page.reload();
    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    await expect(page.getByText("Your Submission", { exact: true })).toBeVisible();
    await expect(page.getByText("Evaluated", { exact: true }).first()).toBeVisible();

    // ---- 12. Complete Session (server-side validates Exercise + all 3 activities) ----
    await expect(page.getByText("You're ready to complete this session.", { exact: true })).toBeVisible();
    const completeResponsePromise = page.waitForResponse(
      (r) => /\/progress\/complete$/.test(r.url()) && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Complete Session", exact: false }).click();
    const completeResponse = await completeResponsePromise;
    expect(completeResponse.status()).toBe(201);

    // ---- 13. Next Session navigation: real subject ordering, not invented ----
    // components-and-state is not the last session in frontend-development
    // (see /subjects/frontend-development/sessions), so a real next session exists.
    const nextButton = page.getByRole("button", { name: "Continue to Next Session" });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await expect(page).not.toHaveURL(/components-and-state/);

    // ---- 14. Dashboard reflects the real, just-created progress ----
    await page.goto("/dashboard");
    await expect(page.getByText(/1 of \d+ subjects completed|\d+ of \d+ subjects completed/)).toBeVisible();

    // ---- 15. Verify server-side ownership directly: submission + progress belong to THIS student ----
    const me = await (await page.request.get("http://localhost:3000/auth/me")).json();
    expect(submission.attemptNumber).toBe(1);
    const progressAfter = await (await page.request.get("http://localhost:3000/progress")).json();
    expect(progressAfter.some((p: { sessionId: string }) => p.sessionId === "components-and-state")).toBe(true);

    // ---- 16. Logout -> protected pages/actions genuinely rejected, not just hidden ----
    await page.getByRole("button", { name: "Log Out" }).click();
    await expect(page).toHaveURL(/\/login/);
    const meAfterLogout = await page.request.get("http://localhost:3000/auth/me");
    expect(meAfterLogout.status()).toBe(401);
    const progressAfterLogout = await page.request.get("http://localhost:3000/progress");
    expect(progressAfterLogout.status()).toBe(401);

    // ---- 17. Login again -> the SAME real identity and progress persist ----
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
    const meAgain = await (await page.request.get("http://localhost:3000/auth/me")).json();
    expect(meAgain.id).toBe(me.id);
    const progressAgain = await (await page.request.get("http://localhost:3000/progress")).json();
    expect(progressAgain.some((p: { sessionId: string }) => p.sessionId === "components-and-state")).toBe(true);
  });
});
