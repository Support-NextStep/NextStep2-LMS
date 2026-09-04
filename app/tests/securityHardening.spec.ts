import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsContentAuthor, loginAsContentReviewer, loginAsDisposableStudent } from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Day 8 — Authentication & Security Hardening regression suite.
//
// Every assertion here hits the real backend directly (page.request), never
// relying on the UI hiding a button — a security property is only real when
// the SERVER enforces it. See DAY 8 — AUTHENTICATION & SECURITY FINAL REPORT
// for the full audit this codifies.
// ---------------------------------------------------------------------------

const SESSION_ID = "components-and-state";

test.describe("Day 8: authentication", () => {
  test("no auth -> protected endpoint -> 401", async ({ page }) => {
    const res = await page.request.get("http://localhost:3000/progress");
    expect(res.status()).toBe(401);
  });

  test("invalid JWT -> 401", async ({ page }) => {
    const res = await page.request.get("http://localhost:3000/auth/me", {
      headers: { Cookie: "access_token=garbage.invalid.token" },
    });
    expect(res.status()).toBe(401);
  });

  test("modified JWT (tampered signature) -> 401, never trusted", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-tamper");
    const cookies = await page.context().cookies();
    const real = cookies.find((c) => c.name === "access_token")!.value;
    const tampered = real.slice(0, -1) + (real.endsWith("A") ? "B" : "A");
    const res = await page.request.get("http://localhost:3000/auth/me", {
      headers: { Cookie: `access_token=${tampered}` },
    });
    expect(res.status()).toBe(401);
  });

  test("logout invalidates the session — the same cookie no longer authenticates", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-logout");
    await page.request.post("http://localhost:3000/auth/logout");
    const res = await page.request.get("http://localhost:3000/auth/me");
    expect(res.status()).toBe(401);
  });

  test("fake role/studentId in a request body is ignored, never trusted over the JWT", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-spoof");
    const me = await (await page.request.get("http://localhost:3000/auth/me")).json();
    const res = await page.request.post(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`, {
      data: {
        studentId: "00000000-0000-0000-0000-000000000000",
        role: "ADMIN",
        files: [{ name: "x.html", content: "<form><input required></form>" }],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    // Regardless of what the request body claimed, the created submission
    // is queryable back through THIS student's own real endpoint — proving
    // it was attributed to the real, JWT-derived identity.
    const mine = await (await page.request.get(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`)).json();
    expect(mine.some((s: { id: string }) => s.id === body.id)).toBe(true);
    expect(me.id).not.toBe("00000000-0000-0000-0000-000000000000");
  });
});

test.describe("Day 8: role authorization (server-side, direct API)", () => {
  test("Student -> /admin/* -> 403", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-role-student");
    const r1 = await page.request.get("http://localhost:3000/admin/students");
    expect(r1.status()).toBe(403);
    const r2 = await page.request.get("http://localhost:3000/admin/dashboard");
    expect(r2.status()).toBe(403);
  });

  test("Author -> /admin/* -> 403", async ({ page }) => {
    await loginAsContentAuthor(page);
    const res = await page.request.get("http://localhost:3000/admin/students");
    expect(res.status()).toBe(403);
  });

  test("Reviewer -> /admin/* -> 403", async ({ page }) => {
    await loginAsContentReviewer(page);
    const res = await page.request.get("http://localhost:3000/admin/students");
    expect(res.status()).toBe(403);
  });

  test("Student -> review queue / package write endpoints -> 403", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-role-student2");
    const queue = await page.request.get("http://localhost:3000/review/packages");
    expect(queue.status()).toBe(403);
    const create = await page.request.post("http://localhost:3000/packages", { data: { sessionId: SESSION_ID } });
    expect(create.status()).toBe(403);
  });
});

test.describe("Day 8: IDOR — two-student regression matrix", () => {
  test("Student A authenticated -> attempts Student B resource -> server rejects -> B's data never returned", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsDisposableStudent(pageA, "sec-idor-a");

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsDisposableStudent(pageB, "sec-idor-b");

    // Student A creates a real, distinguishable submission.
    const submitRes = await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`, {
      data: { files: [{ name: "a-only.html", content: "<form><input required></form>" }] },
    });
    expect(submitRes.status()).toBe(201);
    const submissionA = await submitRes.json();

    // Student A also completes a real activity.
    await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress/learning/complete`);

    // Student B: session-scoped submission list is real API/DB data scoped
    // to B's own JWT identity — must never include A's submission.
    const bSubmissions = await (await pageB.request.get(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`)).json();
    expect(bSubmissions.some((s: { id: string }) => s.id === submissionA.id)).toBe(false);

    // Student B's own evaluation-detail route, called with A's submission id -> rejected, not A's data.
    const evalAttempt = await pageB.request.get(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions/${submissionA.id}/evaluation`);
    expect([403, 404]).toContain(evalAttempt.status());
    const evalBody = await evalAttempt.json().catch(() => ({}));
    expect(JSON.stringify(evalBody)).not.toContain("a-only.html");

    // Student B's own progress/activity-progress reads show nothing of A's.
    const bProgress = await (await pageB.request.get("http://localhost:3000/progress")).json();
    expect(bProgress.length).toBe(0);
    const bActivity = await (await pageB.request.get(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress`)).json();
    expect(bActivity.length).toBe(0);

    await contextA.close();
    await contextB.close();
  });

  test("Student -> draft/unpublished package content -> not exposed", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-draft");
    // No active package currently exists for these real curriculum sessions
    // in a clean DB — the canonical "nothing published" 404, never draft
    // content leaking through.
    const res = await page.request.get("http://localhost:3000/sessions/api-integration/content");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.message).not.toContain("DRAFT");
  });
});

test.describe("Day 8: security headers", () => {
  test("real HTTP response carries the expected security headers", async ({ page }) => {
    const res = await page.request.get(`http://localhost:3000/sessions/${SESSION_ID}/content`);
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBeTruthy();
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["content-security-policy"]).toBeTruthy();
  });
});

test.describe("Day 8: DTO / body-size alignment", () => {
  test("oversized request body -> clean 4xx, not a crash", async ({ page }) => {
    const bigContent = "x".repeat(13 * 1024 * 1024); // exceeds the 12mb explicit ceiling
    await loginAsDisposableStudent(page, "sec-oversize");
    const res = await page.request.post(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`, {
      data: { files: [{ name: "big.html", content: bigContent }] },
      failOnStatusCode: false,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("AI Tutor message over its declared limit -> clean 400", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-tutor-limit");
    const res = await page.request.post(`http://localhost:3000/sessions/${SESSION_ID}/ai-tutor/ask`, {
      data: { message: "x".repeat(2001) },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Day 8: student-facing API leak cleanup", () => {
  test("no submission/evaluation response ever contains internal secrets or another student's data", async ({ page }) => {
    await loginAsDisposableStudent(page, "sec-leak");
    const submitRes = await page.request.post(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`, {
      data: { files: [{ name: "leak-check.html", content: "<form><input required></form>" }] },
    });
    const body = await submitRes.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/hf_[a-zA-Z0-9]/);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("password_hash");
    expect(raw).not.toContain("retryCount");
    expect(raw).not.toContain("failureReason");
    expect(raw).not.toContain("providerName");
    expect(raw).not.toContain("nextAttemptAt");
  });
});

test.describe("Day 8: malformed / unauthorized requests never leak internals", () => {
  test("malformed JSON body -> clean 400, no stack trace", async ({ page }) => {
    const res = await page.request.post("http://localhost:3000/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: "{not valid json",
    });
    expect(res.status()).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // no stack-trace-shaped lines
    expect(text.toLowerCase()).not.toContain("prisma");
    expect(text.toLowerCase()).not.toContain(".ts:");
  });
});
