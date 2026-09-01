import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { Session, BASE } from "./lib.mjs";

const COUNT = Number(process.argv[2] || 10);
const POOL_FILE = "./_loadtest_scratch/pool.json";
const RUN_TAG = process.env.LOADTEST_TAG || "slice8";

let pool = existsSync(POOL_FILE) ? JSON.parse(readFileSync(POOL_FILE, "utf8")) : [];
const startIndex = pool.length;

async function registerOne(i) {
  const session = new Session();
  const email = `loadtest-${RUN_TAG}-${i}-${Date.now()}@nextstep2.dev`;
  const password = "LoadTest123!";
  const name = `Load Test Student ${i}`;
  const res = await session.post("/auth/register", { email, password, name });
  if (res.status !== 201 && res.status !== 200) {
    console.error(`FAILED to register #${i}:`, res.status, JSON.stringify(res.json));
    return null;
  }
  return { id: res.json.id, email, password, name };
}

const CONCURRENCY = 20;
const toCreate = COUNT;
const results = [];
const start = performance.now();

for (let batchStart = 0; batchStart < toCreate; batchStart += CONCURRENCY) {
  const batch = [];
  for (let i = batchStart; i < Math.min(batchStart + CONCURRENCY, toCreate); i++) {
    batch.push(registerOne(startIndex + i));
  }
  const batchResults = await Promise.all(batch);
  results.push(...batchResults.filter(Boolean));
  process.stdout.write(`\rRegistered ${results.length}/${toCreate}`);
}
console.log();

pool = pool.concat(results);
writeFileSync(POOL_FILE, JSON.stringify(pool, null, 0));
const elapsed = ((performance.now() - start) / 1000).toFixed(1);
console.log(`Registered ${results.length} new accounts in ${elapsed}s (${(results.length / elapsed).toFixed(1)}/s). Pool total: ${pool.length}`);
