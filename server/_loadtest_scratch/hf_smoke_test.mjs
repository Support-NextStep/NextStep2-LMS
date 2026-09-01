import { readFileSync } from "node:fs";
import { Session, sleep } from "./lib.mjs";

// Test 11 — real Hugging Face smoke test. Small, controlled: 5 concurrent
// real evaluations, through the SAME queue/worker/retry machinery as
// everything else — never bypassing it. No secrets are read or printed
// here; the backend process holds HF_TOKEN, this script never touches it.

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const accounts = pool.slice(505, 510); // 5 accounts, previously unused in this exact combination
const SESSION_ID = "stack-implementation";

const REAL_CODE = `class Stack {
  constructor() { this.items = []; }
  push(item) { this.items.push(item); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  isEmpty() { return this.items.length === 0; }
}
module.exports = Stack;`;

async function submitReal(acc) {
  const s = new Session();
  const login = await s.post("/auth/login", { email: acc.email, password: acc.password });
  if (!login.ok) return { ok: false, stage: "login" };
  const t0 = performance.now();
  const res = await s.post(`/sessions/${SESSION_ID}/exercise/submissions`, { files: [{ name: "index.js", content: REAL_CODE }] });
  const submitLatencyMs = Math.round(performance.now() - t0);
  if (!res.ok) return { ok: false, stage: "submit", status: res.status };
  return { ok: true, session: s, submissionId: res.json.id, submitLatencyMs, submittedAt: Date.now() };
}

console.log(`Submitting ${accounts.length} REAL Hugging Face evaluations (session=${SESSION_ID})...`);
const submissions = await Promise.all(accounts.map(submitReal));
for (const s of submissions) {
  if (!s.ok) console.log("SUBMIT FAILED:", s.stage, s.status ?? "");
  else console.log(`Submitted ${s.submissionId} in ${s.submitLatencyMs}ms (did not wait for the model)`);
}

const valid = submissions.filter((s) => s.ok);
console.log(`\nPolling ${valid.length} real evaluations to completion (up to 90s each)...`);

async function poll(sub) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const res = await sub.session.get(`/sessions/${SESSION_ID}/exercise/submissions/${sub.submissionId}/evaluation`);
    const status = res.json?.status;
    if (status === "EVALUATED" || status === "FAILED") {
      return { submissionId: sub.submissionId, status, latencyMs: Date.now() - sub.submittedAt, overallScore: res.json?.overallScore, failureReason: res.json?.failureReason, providerNote: res.json?.feedback?.slice?.(0, 60) };
    }
    await sleep(2000);
  }
  return { submissionId: sub.submissionId, status: "TIMEOUT" };
}

const results = await Promise.all(valid.map(poll));
console.log("\n--- RESULTS (no secrets, only status/score) ---");
for (const r of results) {
  console.log(
    `${r.submissionId}: ${r.status} in ${r.latencyMs ?? "?"}ms` +
      (r.status === "EVALUATED" ? ` score=${r.overallScore}` : "") +
      (r.status === "FAILED" ? ` reason="${(r.failureReason ?? "").replace(/Bearer\s+\S+/gi, "[REDACTED]").slice(0, 120)}"` : "")
  );
}
const evaluated = results.filter((r) => r.status === "EVALUATED").length;
const failed = results.filter((r) => r.status === "FAILED").length;
const timedOut = results.filter((r) => r.status === "TIMEOUT").length;
console.log(`\nSummary: EVALUATED=${evaluated} FAILED=${failed} TIMEOUT=${timedOut} (of ${results.length})`);
