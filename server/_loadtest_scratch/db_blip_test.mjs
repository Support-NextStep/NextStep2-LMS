import { readFileSync } from "node:fs";
import { Session } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const acc = pool[300];
const session = new Session();
await session.post("/auth/login", { email: acc.email, password: acc.password });

const attempts = [];
for (let i = 0; i < 6; i++) {
  const start = performance.now();
  const res = await session.get("/progress");
  attempts.push({ i, status: res.status, latencyMs: Math.round(performance.now() - start) });
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(JSON.stringify(attempts, null, 2));
