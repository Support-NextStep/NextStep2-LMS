import { test, expect } from "@playwright/test";
import { loginAsDisposableStudent } from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Student Session UI cleanup — proves the frozen product decisions:
//   1. Practice is guided experimentation only (no Self-Check, no AI Hint,
//      no Ask AI button) — just task + starter code + the OneCompiler editor.
//   2. AI Help is not a tab — it's the persistent "Need Help?" widget.
//   3. Exercise is unchanged as a separate assessment activity.
//
// Uses the one curated real session (sessionContent.ts's "components-and-state",
// under /session/components-and-state) rather than authoring new content —
// reading it (tab visibility, Practice/Exercise structure, opening the Need
// Help dialog) needs no login, since published-content GET routes are public
// (see the frontend/backend data contract audit). This is the same session
// other suites already reference.
//
// Day 5 follow-up: the two tests that actually SUBMIT something (Exercise
// submission, an AI Tutor question) are a different story — both now hit
// real, JwtAuthGuard-gated backend endpoints (AI Exercise Evaluation Slice 1,
// Day 2; AI Tutor, Day 3), so an anonymous visitor gets a real 401, not a
// canned/mocked result. Those two tests log in as a real disposable student
// first and assert on the real current UI/network behavior — never on the
// pre-Day-2/pre-Day-3 mocked text this file used to expect.
// ---------------------------------------------------------------------------

const SESSION_URL = "/session/components-and-state";

test.describe("Student Session: Practice/Exercise tabs only", () => {
  test("shows exactly Practice and Exercise tabs — no AI Help tab", async ({ page }) => {
    await page.goto(SESSION_URL);

    await expect(page.getByRole("button", { name: "Practice", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exercise", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "AI Help", exact: true })).toHaveCount(0);
  });
});

test.describe("Student Session: Practice is guided experimentation only", () => {
  test("Practice shows the task, starter code, and a working code editor — no Self-Check, no AI Hint, no Ask AI", async ({ page }) => {
    await page.goto(SESSION_URL);
    await page.getByRole("button", { name: "Practice", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Practice", exact: true })).toBeVisible();
    await expect(page.getByText("Create a simple HTML registration form", { exact: false })).toBeVisible();
    await expect(page.locator('iframe[title="Practice code editor"]')).toBeVisible();
    await expect(page.getByText(/powered by OneCompiler/)).toBeVisible();

    // Removed per the Practice cleanup — evaluation/AI-assistance UI.
    await expect(page.getByRole("button", { name: "Self-Check", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI Hint", exact: true })).toHaveCount(0);
    await expect(page.getByText("Reference checklist", { exact: false })).toHaveCount(0);
  });

  test("no Ask AI button anywhere in the session (Practice's included one and the old AI Help tab's are both gone)", async ({ page }) => {
    await page.goto(SESSION_URL);
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ask AI", exact: true })).toHaveCount(0);
  });
});

test.describe("Student Session: Exercise is unchanged", () => {
  test("Exercise still has objective, requirements, starter code, a code editor, and Submit — no Self-Check/AI Hint added to it", async ({ page }) => {
    await page.goto(SESSION_URL);
    await page.getByRole("button", { name: "Exercise", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Exercise", exact: true })).toBeVisible();
    await expect(page.getByText("Build a registration form independently.")).toBeVisible();
    await expect(page.getByText("Basic validation", { exact: true })).toBeVisible(); // one of the requirements
    await expect(page.locator('iframe[title="Exercise code editor"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Exercise" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Self-Check", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI Hint", exact: true })).toHaveCount(0);
  });

  test("submission flow goes through the real backend: Submit Exercise -> confirm -> a real attempt is recorded", async ({ page }) => {
    // Real, JwtAuthGuard-gated endpoint since AI Exercise Evaluation Slice 1
    // (Day 2) — an anonymous visitor can no longer complete this flow at
    // all, so a real login is required to test it for real.
    await loginAsDisposableStudent(page);
    await page.goto(SESSION_URL);
    await page.getByRole("button", { name: "Exercise", exact: true }).click();

    const submitResponsePromise = page.waitForResponse(
      (r) => /\/exercise\/submissions$/.test(r.url()) && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Submit Exercise" }).click();
    await expect(page.getByText(/will be submitted as Attempt #1/)).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const submitResponse = await submitResponsePromise;
    expect(submitResponse.status()).toBe(201);

    // Current real UI: a "Your Submission" block showing the attempt number
    // and its (queued/evaluating/evaluated/failed) status — there is no
    // "Exercise Submitted" toast/heading any more (that was this test's own
    // stale, pre-Day-2 expectation).
    await expect(page.getByText("Your Submission", { exact: true })).toBeVisible();
    await expect(page.getByText("Attempt #1", { exact: true }).first()).toBeVisible();
  });
});

test.describe("Student Session: Need Help widget", () => {
  test("Need Help control is visible, opens the help panel, and can be closed", async ({ page }) => {
    await page.goto(SESSION_URL);

    const needHelpButton = page.getByRole("button", { name: "Need Help?" });
    await expect(needHelpButton).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Need Help" })).toHaveCount(0);

    await needHelpButton.click();
    const panel = page.getByRole("dialog", { name: "Need Help" });
    await expect(panel).toBeVisible();
    // The content-authored AI Help data (quick prompts) is still there, just relocated.
    await expect(panel.getByText("Explain this topic", { exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "Close help" }).click();
    await expect(page.getByRole("dialog", { name: "Need Help" })).toHaveCount(0);
  });

  test("Need Help stays available while Practice or Exercise is open", async ({ page }) => {
    await page.goto(SESSION_URL);

    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await expect(page.getByRole("button", { name: "Need Help?" })).toBeVisible();

    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    await expect(page.getByRole("button", { name: "Need Help?" })).toBeVisible();
  });

  test("a quick prompt inside Need Help gets a real AI Tutor reply, using the content-authored AI Help data", async ({ page }) => {
    // Real, JwtAuthGuard-gated endpoint since Day 3 — this used to be a
    // frontend-only canned reply (no backend call at all, so no login was
    // needed); an anonymous visitor now gets a real 401 instead. The
    // suggested-prompt text itself ("Explain this topic") is still the
    // real content-authored AI Help data — only the reply source changed.
    await loginAsDisposableStudent(page);
    await page.goto(SESSION_URL);
    await page.getByRole("button", { name: "Need Help?" }).click();

    const panel = page.getByRole("dialog", { name: "Need Help" });
    const askResponsePromise = page.waitForResponse((r) => /\/ai-tutor\/ask$/.test(r.url()) && r.request().method() === "POST");
    await panel.getByText("Explain this topic", { exact: true }).click();
    const askResponse = await askResponsePromise;
    expect(askResponse.status()).toBe(201);
    const body = (await askResponse.json()) as { answer: string };
    expect(body.answer.length).toBeGreaterThan(20);
    await expect(panel.getByText(body.answer, { exact: false })).toBeVisible();
  });
});

test.describe("Student Session: unaffected areas still work", () => {
  test("Video Check, progress, and the rest of the Learn column are unaffected by the Practice/AI Help cleanup", async ({ page }) => {
    await page.goto(SESSION_URL);

    await expect(page.getByRole("heading", { name: "Learn", exact: true })).toBeVisible();
    await expect(page.getByText("About this lesson")).toBeVisible();
    await expect(page.getByText("Key Concepts")).toBeVisible();
    await expect(page.getByText(/Progress/).first()).toBeVisible();
  });
});
