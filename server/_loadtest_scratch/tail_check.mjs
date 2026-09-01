import { readFileSync } from "node:fs";
import { Session } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
console.log("Pool size:", pool.length);
const acc = pool[pool.length - 1];
const session = new Session();
const t0 = performance.now();
const login = await session.post("/auth/login", { email: acc.email, password: acc.password });
const t1 = performance.now();
const progress = await session.get("/progress");
const t2 = performance.now();
const courses = await session.get("/courses");
const t3 = performance.now();
console.log("Last pool account login:", login.status, Math.round(t1-t0)+"ms");
console.log("GET /progress:", progress.status, Math.round(t2-t1)+"ms | rows:", progress.json.length);
console.log("GET /courses:", courses.status, Math.round(t3-t2)+"ms");
