import { readFileSync } from "node:fs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const acc = pool[101];

const loginRes = await fetch("http://localhost:3000/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: acc.email, password: acc.password }),
});
const setCookie = loginRes.headers.getSetCookie();
const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");

const content = "x".repeat(150 * 1024);
const res = await fetch("http://localhost:3000/sessions/stack-implementation/exercise/submissions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookieHeader },
  body: JSON.stringify({ files: [{ name: "index.js", content }] }),
});
console.log("Status:", res.status);
console.log("Content-Type:", res.headers.get("content-type"));
const text = await res.text();
console.log("Body (first 300 chars):", text.slice(0, 300));
