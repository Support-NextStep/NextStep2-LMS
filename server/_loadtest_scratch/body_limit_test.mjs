import { readFileSync } from "node:fs";
import { Session } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const acc = pool[100];
const session = new Session();
await session.post("/auth/login", { email: acc.email, password: acc.password });

for (const sizeKb of [50, 90, 150, 500]) {
  const content = "x".repeat(sizeKb * 1024);
  const res = await session.post("/sessions/stack-implementation/exercise/submissions", { files: [{ name: "index.js", content }] });
  console.log(`Payload ~${sizeKb}KB -> status ${res.status}`);
}
