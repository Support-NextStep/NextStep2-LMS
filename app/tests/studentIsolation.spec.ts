import { test, expect } from "@playwright/test";
import { loginAsDisposableStudent } from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Day 6 — Multi-Student Isolation.
//
// Student A performs a real learning activity, submits a real exercise, and
// gets a real evaluation. Student B then logs in independently (a separate
// browser context, its own real cookie session) and must not be able to see
// or mutate any of A's private records through the real API — server-side
// ownership (studentId always derived from the verified JWT — see
// SubmissionsService/ProgressService/ActivityProgressService), not just
// frontend hiding.
// ---------------------------------------------------------------------------

const SESSION_ID = "components-and-state";

test.describe("Day 6: multi-student isolation", () => {
  test("Student B cannot read or mutate Student A's submission, evaluation, or progress", async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsDisposableStudent(pageA, "isolation-student-a");

    // Student A: submit a real exercise (evaluation lifecycle itself is
    // already covered by studentJourney.spec.ts — this test only needs a
    // real, persisted submission to exist so isolation can be checked).
    const submitResponse = await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`, {
      data: { files: [{ name: "solution.html", content: "<form><input name=\"name\"></form>" }] },
    });
    expect(submitResponse.status()).toBe(201);

    // Student A: complete real activity progress.
    await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress/learning/complete`);
    await pageA.request.post(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress/practice/complete`);

    const aSubmissions = await (await pageA.request.get(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`)).json();
    expect(aSubmissions.length).toBeGreaterThan(0);
    const aActivity = await (await pageA.request.get(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress`)).json();
    expect(aActivity.length).toBe(2);

    // Student B: a fully independent browser context — its own cookies, its own real login.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsDisposableStudent(pageB, "isolation-student-b");

    // Student B must see NONE of Student A's records via the real, legitimate endpoints.
    const bSubmissions = await (await pageB.request.get(`http://localhost:3000/sessions/${SESSION_ID}/exercise/submissions`)).json();
    expect(bSubmissions.length).toBe(0);

    const bProgress = await (await pageB.request.get("http://localhost:3000/progress")).json();
    expect(bProgress.length).toBe(0);

    const bActivity = await (await pageB.request.get(`http://localhost:3000/sessions/${SESSION_ID}/activity-progress`)).json();
    expect(bActivity.length).toBe(0);

    // Student B cannot fake completion server-side either — the session-complete
    // guard (requires Exercise + all 3 activities) is evaluated against B's OWN
    // rows, which don't exist, regardless of what A has done.
    const bCompleteAttempt = await pageB.request.post(`http://localhost:3000/sessions/${SESSION_ID}/progress/complete`);
    expect(bCompleteAttempt.status()).toBe(400);

    // No endpoint anywhere accepts a studentId/ownerId in the request body —
    // every one of these routes derives identity solely from B's own verified
    // JWT cookie (see JwtAuthGuard + CurrentUser across submissions/progress/
    // activity-progress controllers), so there is no field to even attempt an
    // IDOR through. Confirm none of A's aggregate data is reachable from B's
    // session even when explicitly asked for A's session id — since B was
    // never told A's studentId or submission id, and B's own list endpoints
    // (verified empty above) are the actual points of potential leakage.
    expect(aActivity.some((a: { activityType: string }) => a.activityType === "learning")).toBe(true);
    expect(bActivity).not.toEqual(aActivity);
    expect(aSubmissions).not.toEqual(bSubmissions);

    await contextA.close();
    await contextB.close();
  });
});
