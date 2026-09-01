import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { Session, findBackendPid, sleep } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const accounts = pool.slice(0, 40); // reuse — idempotent, fine for this purpose

async function submitOne(acc, sessionId) {
  const s = new Session();
  await s.post("/auth/login", { email: acc.email, password: acc.password });
  const res = await s.post(`/sessions/${sessionId}/exercise/submissions`, { files: [{ name: "index.js", content: "class X{}" }] });
  return { session: s, sessionId, submissionId: res.json?.id, email: acc.email, password: acc.password };
}

console.log("Submitting 40 exercises across 3 sessions...");
const sessions = ["stack-implementation", "queue-implementation", "linked-list-implementation"];
const subs = await Promise.all(accounts.map((acc, i) => submitOne(acc, sessions[i % 3])));
console.log("Submitted:", subs.filter((s) => s.submissionId).length);

const prisma = new PrismaClient();
await prisma.$connect();

// Poll rapidly until we see EVALUATING rows, then kill IMMEDIATELY.
let evaluatingRows = [];
for (let i = 0; i < 20; i++) {
  evaluatingRows = await prisma.exerciseEvaluation.findMany({ where: { status: "EVALUATING" }, select: { id: true, submissionId: true, retryCount: true } });
  if (evaluatingRows.length > 0) break;
  await sleep(100);
}
console.log(`Found ${evaluatingRows.length} EVALUATING rows — killing backend NOW.`);

const pid = findBackendPid();
const killTime = Date.now();
execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
console.log(`Backend (PID ${pid}) force-killed at ${new Date(killTime).toISOString()}`);

const stillEvaluating = await prisma.exerciseEvaluation.findMany({ where: { status: "EVALUATING" } });
console.log(`EVALUATING rows immediately after kill: ${stillEvaluating.length} (these are now orphaned — no worker will touch them until reclaimed)`);

writeFileSync(
  "./_loadtest_scratch/restart_test_state.json",
  JSON.stringify({
    killTime,
    evaluatingAtKill: stillEvaluating.map((r) => r.id),
    subs: subs.map((s) => ({ email: s.email, password: s.password, sessionId: s.sessionId, submissionId: s.submissionId })),
  })
);
await prisma.$disconnect();
console.log("STATE_SAVED — now restart the backend and run restart_recovery3.mjs to observe reclaim.");
