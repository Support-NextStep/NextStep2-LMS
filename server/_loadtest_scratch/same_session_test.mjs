import { readFileSync } from "node:fs";
import { Session, sleep } from "./lib.mjs";

const CONCURRENCY = Number(process.argv[2] || 30);
const POOL_OFFSET = Number(process.argv[3] || 0);
const SESSION_ID = "queue-implementation"; // fixed — everyone hits the SAME session
const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const accounts = pool.slice(POOL_OFFSET, POOL_OFFSET + CONCURRENCY);

const CODE_VARIANTS = [
  { label: "correct", code: "class Queue { constructor(){this.items=[];} enqueue(i){this.items.push(i);} dequeue(){return this.items.shift();} front(){return this.items[0];} isEmpty(){return this.items.length===0;} }" },
  { label: "partial", code: "class Queue { constructor(){this.items=[];} enqueue(i){this.items.push(i);} }" },
  { label: "wrong", code: "function notAQueue() { return 42; }" },
];

async function run(account, idx) {
  const session = new Session();
  const login = await session.post("/auth/login", { email: account.email, password: account.password });
  if (!login.ok) return { ok: false, stage: "login" };

  await session.post(`/sessions/${SESSION_ID}/activity-progress/learning/complete`, {});
  await session.post(`/sessions/${SESSION_ID}/activity-progress/practice/complete`, {});
  const variant = CODE_VARIANTS[idx % CODE_VARIANTS.length];
  const submitRes = await session.post(`/sessions/${SESSION_ID}/exercise/submissions`, { files: [{ name: "index.js", content: variant.code }] });
  const completeRes = await session.post(`/sessions/${SESSION_ID}/progress/complete`, {});

  return {
    ok: true,
    studentId: login.json.id,
    email: account.email,
    submissionId: submitRes.json?.id ?? null,
    variant: variant.label,
    completeStatus: completeRes.status,
    completedAt: completeRes.json?.completedAt ?? null,
  };
}

console.log(`Running ${CONCURRENCY} students against the SAME session (${SESSION_ID}) simultaneously...`);
const results = await Promise.all(accounts.map((acc, i) => run(acc, i)));
const failed = results.filter((r) => !r.ok);
console.log(`Completed: ${results.length - failed.length}/${results.length} (failed: ${failed.length})`);
console.log(JSON.stringify(results.slice(0, 3), null, 2));

import { writeFileSync } from "node:fs";
writeFileSync("./_loadtest_scratch/same_session_results.json", JSON.stringify({ sessionId: SESSION_ID, results }, null, 2));
console.log("Results written to same_session_results.json");
