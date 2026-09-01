import { readFileSync, writeFileSync } from "node:fs";
import { runVirtualStudent } from "./scenario.mjs";
import { samplePgConnections, sampleProcess, findBackendPid, summarize } from "./lib.mjs";

const WAVES = Number(process.argv[2] || 6);
const WAVE_SIZE = Number(process.argv[3] || 40);
const WAVE_INTERVAL_MS = Number(process.argv[4] || 80000);

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const pid = findBackendPid();
console.log(`Sustained load: ${WAVES} waves of ${WAVE_SIZE} students, ${WAVE_INTERVAL_MS / 1000}s apart. Backend PID ${pid}.`);

const waveResults = [];
const startedAt = Date.now();

for (let w = 0; w < WAVES; w++) {
  const waveStart = performance.now();
  const offset = (w * WAVE_SIZE) % (pool.length - WAVE_SIZE);
  const accounts = pool.slice(offset, offset + WAVE_SIZE);

  const before = await Promise.all([samplePgConnections(), Promise.resolve(pid ? sampleProcess(pid) : { rssMb: null })]);
  const results = await Promise.allSettled(accounts.map((acc) => runVirtualStudent(acc, { submitExercise: w % 2 === 0 })));
  const timings = results.flatMap((r) => (r.status === "fulfilled" ? r.value.timings : []));
  const overall = summarize(timings);
  const after = await Promise.all([samplePgConnections(), Promise.resolve(pid ? sampleProcess(pid) : { rssMb: null })]);
  const waveMs = performance.now() - waveStart;

  const record = {
    wave: w,
    atMs: Date.now() - startedAt,
    waveMs: Math.round(waveMs),
    overall,
    pgBefore: before[0],
    pgAfter: after[0],
    rssBeforeMb: before[1].rssMb,
    rssAfterMb: after[1].rssMb,
  };
  waveResults.push(record);
  console.log(
    `Wave ${w} @ t=${Math.round(record.atMs / 1000)}s: n=${overall.total} err=${overall.errors} p50=${overall.p50}ms p95=${overall.p95}ms max=${overall.max}ms | RSS=${record.rssAfterMb}MB | pg total=${after[0].total}`
  );
  writeFileSync("./_loadtest_scratch/sustained_results.json", JSON.stringify(waveResults, null, 2));

  if (w < WAVES - 1) {
    const elapsed = performance.now() - waveStart;
    const remaining = Math.max(0, WAVE_INTERVAL_MS - elapsed);
    await new Promise((r) => setTimeout(r, remaining));
  }
}

console.log(`\nSustained test complete. Total wall time: ${Math.round((Date.now() - startedAt) / 1000)}s`);
const firstRss = waveResults[0].rssAfterMb;
const lastRss = waveResults[waveResults.length - 1].rssAfterMb;
console.log(`RSS: first wave=${firstRss}MB, last wave=${lastRss}MB, delta=${lastRss - firstRss}MB`);
const firstP95 = waveResults[0].overall.p95;
const lastP95 = waveResults[waveResults.length - 1].overall.p95;
console.log(`p95 latency: first wave=${firstP95}ms, last wave=${lastP95}ms`);
