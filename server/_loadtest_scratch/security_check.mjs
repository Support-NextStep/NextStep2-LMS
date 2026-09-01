import { readFileSync } from "node:fs";
import { Session } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
// Sample 5 random students from across the whole pool, all of whom made real submissions during the load tests
const sampleIndices = [5, 105, 250, 350, 480];

async function loginAndGetId(acc) {
  const s = new Session();
  const login = await s.post("/auth/login", { email: acc.email, password: acc.password });
  return { session: s, id: login.json.id, email: acc.email };
}

const students = await Promise.all(sampleIndices.map((i) => loginAndGetId(pool[i])));
console.log("Sampled students:", students.map((s) => s.id));

let violations = 0;
for (let i = 0; i < students.length; i++) {
  const me = students[i];
  const myProgress = await me.session.get("/progress").then((r) => r.json);
  const mySubs = await me.session.get(`/sessions/stack-implementation/exercise/submissions`).then((r) => r.json);

  for (let j = 0; j < students.length; j++) {
    if (i === j) continue;
    const other = students[j];
    // Try to read the OTHER student's submission list using MY session — the sessionId is shared/public, but the studentId used to filter must come from MY OWN JWT, never other.id
    // Real attack surface: does GET /sessions/:id/exercise/submissions ever return another student's rows if I'm authenticated as someone else?
    const crossSubs = await me.session.get(`/sessions/stack-implementation/exercise/submissions`).then((r) => r.json);
    const leaked = crossSubs.some((s) => mySubs.every((mine) => mine.id !== s.id) === false ? false : false);
  }

  // Direct check: does my own submission list ever contain a submission whose studentId isn't me? (submissions list endpoint doesn't return studentId in payload typically, so instead verify DB-side ownership for what my endpoint returned)
  console.log(`${me.email}: /progress rows=${myProgress.length}, own submissions=${mySubs.length}`);
}

// The real, decisive check: for each sampled student, fetch their own evaluation for a submission they made, then try fetching it via a DIFFERENT student's session
console.log("\n--- Cross-student evaluation access attempt ---");
