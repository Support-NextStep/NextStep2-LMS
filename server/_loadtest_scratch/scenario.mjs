import { Session, sleep, jitter } from "./lib.mjs";

// Real, pre-existing published curriculum reused from prior slices — no new
// curriculum created for this load test (see Slice 8's "preserve real
// existing curriculum" instruction).
export const COURSE_ID = "full-stack-with-ai";
export const SUBJECT_ID = "core-data-structures";
export const SESSION_IDS = ["stack-implementation", "queue-implementation", "linked-list-implementation"];

const SAMPLE_CODE = `class Stack {
  constructor() { this.items = []; }
  push(item) { this.items.push(item); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  isEmpty() { return this.items.length === 0; }
}
console.log(new Stack());`;

/** Realistic per-action think-time — compressed vs. a real human (see this slice's report for why: it makes the test a conservative/harder approximation of concurrent load, never an easier one). */
async function think(minMs = 80, spreadMs = 220) {
  await sleep(jitter(minMs, spreadMs));
}

/**
 * One realistic student session: login -> browse catalog -> open a session
 * -> read progress/activity state -> complete Learning+Practice -> submit
 * an exercise -> (optionally) complete the session. Returns the HTTP
 * timings recorded and any exercise submission(s) made, so the caller can
 * separately track AI-evaluation drain (see runner.mjs) without blocking
 * this "interactive" scenario on evaluation completion — a real student
 * doesn't sit and stare at the loading spinner either, and Complete Session
 * only requires a submission to *exist*, never for it to be evaluated yet.
 */
export async function runVirtualStudent(account, opts = {}) {
  const { completeSession = true, submitExercise = true } = opts;
  const timings = [];
  const submissions = [];
  const session = new Session();

  const login = await session.post("/auth/login", { email: account.email, password: account.password }, timings);
  if (!login.ok) return { timings, submissions, failedLogin: true };

  await session.get("/auth/me", timings);
  await think();

  await session.get("/courses", timings);
  await think();
  await session.get(`/courses/${COURSE_ID}/subjects`, timings);
  await think();
  await session.get(`/subjects/${SUBJECT_ID}/sessions`, timings);
  await think();

  const sessionId = SESSION_IDS[Math.floor(Math.random() * SESSION_IDS.length)];

  await session.get(`/sessions/${sessionId}/content`, timings);
  await think();
  await session.get(`/progress`, timings);
  await think();
  await session.get(`/sessions/${sessionId}/activity-progress`, timings);
  await think(150, 300); // "watching/reading" pause

  await session.post(`/sessions/${sessionId}/activity-progress/learning/complete`, {}, timings);
  await think(200, 400); // "doing Practice" pause
  await session.post(`/sessions/${sessionId}/activity-progress/practice/complete`, {}, timings);
  await think();

  if (submitExercise) {
    const submitRes = await session.post(
      `/sessions/${sessionId}/exercise/submissions`,
      { files: [{ name: "index.js", content: SAMPLE_CODE }] },
      timings
    );
    if (submitRes.ok && submitRes.json?.id) {
      submissions.push({ session, sessionId, submissionId: submitRes.json.id, submittedAt: Date.now() });
      // One immediate poll — this is the Test 9 check that the submission
      // endpoint itself doesn't block on the LLM, i.e. the very next read
      // should still see PENDING/EVALUATING, not require a wait.
      const evalRes = await session.get(`/sessions/${sessionId}/exercise/submissions/${submitRes.json.id}/evaluation`, timings);
      submissions[submissions.length - 1].statusRightAfterSubmit = evalRes.json?.status ?? null;
    }
  }
  await think();

  if (completeSession) {
    await session.post(`/sessions/${sessionId}/progress/complete`, {}, timings);
  }

  return { timings, submissions, failedLogin: false };
}

/** Polls one submission's evaluation until it reaches a terminal state or the deadline passes. Returns the terminal status and how long it took from submission. */
export async function pollUntilTerminal(sub, { pollIntervalMs = 1500, timeoutMs = 120000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await sub.session.get(`/sessions/${sub.sessionId}/exercise/submissions/${sub.submissionId}/evaluation`);
    const status = res.json?.status;
    if (status === "EVALUATED" || status === "FAILED") {
      return { status, completedAt: Date.now(), latencyMs: Date.now() - sub.submittedAt, retryCount: res.json?.retryCount ?? null };
    }
    await sleep(pollIntervalMs);
  }
  return { status: "TIMEOUT", completedAt: Date.now(), latencyMs: Date.now() - sub.submittedAt, retryCount: null };
}
