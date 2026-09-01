import { readFileSync } from "node:fs";
import { Session, sampleQueueStats, sleep } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const accounts = pool.slice(485, 500); // 15 accounts, unused so far in this exact combo

async function submitOne(acc) {
  const s = new Session();
  await s.post("/auth/login", { email: acc.email, password: acc.password });
  const res = await s.post("/sessions/linked-list-implementation/exercise/submissions", { files: [{ name: "index.js", content: "class LinkedList{}" }] });
  return { session: s, submissionId: res.json?.id };
}

console.log("Submitting 15 exercises...");
const subs = await Promise.all(accounts.map(submitOne));
console.log("Submitted:", subs.filter(s => s.submissionId).length);

await sleep(1500); // let the worker claim its concurrency=5 worth into EVALUATING
const beforeKill = await sampleQueueStats();
console.log("Queue stats just before kill:", JSON.stringify(beforeKill));

const evaluatingRows = await (async () => {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  await p.$connect();
  const rows = await p.exerciseEvaluation.findMany({ where: { status: "EVALUATING" }, select: { id: true, submissionId: true, attemptedAt: true } });
  await p.$disconnect();
  return rows;
})();
console.log("EVALUATING rows at kill time:", evaluatingRows.length);

import { writeFileSync } from "node:fs";
writeFileSync("./_loadtest_scratch/restart_test_subs.json", JSON.stringify(subs.map(s => s.submissionId)));
console.log("KILL_NOW");
