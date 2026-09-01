import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { summarize, summarizeByEndpoint, samplePgConnections, sampleQueueStats, sampleProcess, findBackendPid, sleep } from "./lib.mjs";
import { runVirtualStudent, pollUntilTerminal } from "./scenario.mjs";

const CONCURRENCY = Number(process.argv[2] || 10);
const POOL_OFFSET = Number(process.argv[3] || 0);
const DRAIN = process.argv.includes("--drain");
const LABEL = `LEVEL_${CONCURRENCY}`;

if (!existsSync("./_loadtest_scratch/pool.json")) {
  console.error("No account pool found — run register_pool.mjs first.");
  process.exit(1);
}
const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
if (pool.length < POOL_OFFSET + CONCURRENCY) {
  console.error(`Pool has ${pool.length} accounts, need ${POOL_OFFSET + CONCURRENCY}. Run register_pool.mjs with a larger count first.`);
  process.exit(1);
}
const accounts = pool.slice(POOL_OFFSET, POOL_OFFSET + CONCURRENCY);

console.log(`\n=== ${LABEL} (${CONCURRENCY} concurrent virtual students) ===`);

const pid = findBackendPid();
console.log("Backend PID:", pid);

const samples = [];
const sampleTimer = setInterval(async () => {
  try {
    const [pg, queue] = await Promise.all([samplePgConnections(), sampleQueueStats()]);
    const proc = pid ? sampleProcess(pid) : { rssMb: null };
    samples.push({ at: Date.now(), pg, queue, proc });
  } catch (err) {
    samples.push({ at: Date.now(), error: String(err) });
  }
}, 2000);

const beforePg = await samplePgConnections();
const beforeQueue = await sampleQueueStats();
console.log("Before — pg:", JSON.stringify(beforePg), "queue:", JSON.stringify(beforeQueue));

const wallStart = performance.now();
const results = await Promise.allSettled(accounts.map((acc) => runVirtualStudent(acc)));
const wallMs = performance.now() - wallStart;

clearInterval(sampleTimer);

const allTimings = [];
const allSubmissions = [];
let failedLogins = 0;
for (const r of results) {
  if (r.status === "fulfilled") {
    allTimings.push(...r.value.timings);
    allSubmissions.push(...r.value.submissions);
    if (r.value.failedLogin) failedLogins++;
  } else {
    console.error("Virtual student threw:", r.reason);
  }
}

const overall = summarize(allTimings);
const byEndpoint = summarizeByEndpoint(allTimings);

console.log(`\n--- ${LABEL} INTERACTIVE PHASE RESULTS ---`);
console.log(`Wall time: ${(wallMs / 1000).toFixed(1)}s | Failed logins: ${failedLogins}/${accounts.length}`);
console.log("Overall:", JSON.stringify(overall));
console.log("By endpoint:");
for (const [k, v] of Object.entries(byEndpoint)) {
  console.log(`  ${k.padEnd(55)} n=${String(v.total).padStart(4)} p50=${String(v.p50).padStart(5)}ms p95=${String(v.p95).padStart(5)}ms p99=${String(v.p99).padStart(5)}ms max=${String(v.max).padStart(6)}ms err=${v.errors}`);
}

const afterPg = await samplePgConnections();
const afterQueue = await sampleQueueStats();
console.log("After interactive phase — pg:", JSON.stringify(afterPg), "queue:", JSON.stringify(afterQueue));

const peakPgActive = Math.max(beforePg.active, ...samples.filter((s) => s.pg).map((s) => s.pg.active));
const peakPgTotal = Math.max(beforePg.total, ...samples.filter((s) => s.pg).map((s) => s.pg.total));
const peakRss = Math.max(0, ...samples.filter((s) => s.proc && s.proc.rssMb).map((s) => s.proc.rssMb));
console.log(`Peak PG connections during run: active=${peakPgActive} total=${peakPgTotal}`);
console.log(`Peak backend RSS during run: ${peakRss || "n/a"} MB`);
console.log(`Submissions made: ${allSubmissions.length}`);

const record = {
  label: LABEL,
  concurrency: CONCURRENCY,
  wallMs,
  overall,
  byEndpoint,
  failedLogins,
  submissions: allSubmissions.length,
  peakPgActive,
  peakPgTotal,
  peakRss,
  samples: samples.map((s) => ({ at: s.at, pg: s.pg, queue: s.queue, rssMb: s.proc?.rssMb })),
};
appendFileSync("./_loadtest_scratch/results.jsonl", JSON.stringify(record) + "\n");

if (DRAIN && allSubmissions.length > 0) {
  console.log(`\n--- ${LABEL} AI EVALUATION DRAIN PHASE (${allSubmissions.length} submissions) ---`);
  const drainStart = performance.now();
  const drainSamples = [];
  const drainTimer = setInterval(async () => {
    const queue = await sampleQueueStats();
    drainSamples.push({ at: Date.now(), queue });
  }, 3000);

  const drainResults = await Promise.allSettled(allSubmissions.map((s) => pollUntilTerminal(s, { timeoutMs: 180000 })));
  clearInterval(drainTimer);
  const drainMs = performance.now() - drainStart;

  const terminalStatuses = drainResults.map((r) => (r.status === "fulfilled" ? r.value : { status: "ERROR" }));
  const evaluated = terminalStatuses.filter((t) => t.status === "EVALUATED").length;
  const failed = terminalStatuses.filter((t) => t.status === "FAILED").length;
  const timedOut = terminalStatuses.filter((t) => t.status === "TIMEOUT").length;
  const latencies = terminalStatuses.filter((t) => t.latencyMs).map((t) => t.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const maxLatency = latencies[latencies.length - 1] || 0;

  console.log(`Drain wall time: ${(drainMs / 1000).toFixed(1)}s`);
  console.log(`EVALUATED=${evaluated} FAILED=${failed} TIMEOUT=${timedOut} (of ${terminalStatuses.length})`);
  console.log(`Per-submission latency (submit -> terminal): p50=${Math.round(p50)}ms p95=${Math.round(p95)}ms max=${Math.round(maxLatency)}ms`);
  console.log(`Throughput: ${(terminalStatuses.length / (drainMs / 1000 / 60)).toFixed(1)} evaluations/minute`);
  console.log("Queue depth over drain:", JSON.stringify(drainSamples.map((s) => s.queue)));

  const finalQueue = await sampleQueueStats();
  console.log("Final queue stats:", JSON.stringify(finalQueue));

  appendFileSync(
    "./_loadtest_scratch/results.jsonl",
    JSON.stringify({ label: `${LABEL}_DRAIN`, drainMs, evaluated, failed, timedOut, p50, p95, maxLatency, drainSamples, finalQueue }) + "\n"
  );
}

console.log(`\n=== ${LABEL} DONE ===`);
