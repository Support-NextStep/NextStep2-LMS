import { readFileSync } from "node:fs";
import { Session } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const acc = pool[450];
const session = new Session();
await session.post("/auth/login", { email: acc.email, password: acc.password });
const start = performance.now();
const submitRes = await session.post("/sessions/stack-implementation/exercise/submissions", { files: [{ name: "index.js", content: "class Stack{}" }] });
const submitLatency = performance.now() - start;
const evalRes = await session.get(`/sessions/stack-implementation/exercise/submissions/${submitRes.json.id}/evaluation`);
console.log("Submit latency (ms):", Math.round(submitLatency));
console.log("Evaluation status immediately after submit:", evalRes.json.status);
