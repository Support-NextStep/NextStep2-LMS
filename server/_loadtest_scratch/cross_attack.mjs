import { readFileSync } from "node:fs";
import { Session } from "./lib.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const victim = JSON.parse(readFileSync("./_loadtest_scratch/victim.json", "utf8"));
const attackerAccount = pool[480]; // a DIFFERENT student

const attacker = new Session();
const login = await attacker.post("/auth/login", { email: attackerAccount.email, password: attackerAccount.password });
console.log("Attacker logged in as:", login.json.id, "(victim is", victim.studentAId + ")");

// 1. Try to read the victim's evaluation directly by known submission id
const evalAttempt = await attacker.get(`/sessions/${victim.sessionId}/exercise/submissions/${victim.submissionId}/evaluation`);
console.log("Attacker GET victim's evaluation ->", evalAttempt.status, JSON.stringify(evalAttempt.json).slice(0, 150));

// 2. Try to read victim's /progress by... there is no victim-id param anywhere; /progress is always self-scoped. Confirm attacker's own /progress never contains victim's session completion they didn't do.
const myProgress = await attacker.get("/progress");
console.log("Attacker's own /progress:", JSON.stringify(myProgress.json));

// 3. Try to complete victim's submission requirement via forging nothing — just confirm submissions list for the session only shows attacker's own
const mySubs = await attacker.get(`/sessions/${victim.sessionId}/exercise/submissions`);
const leaksVictim = mySubs.json.some((s) => s.id === victim.submissionId);
console.log("Attacker's own submission list contains victim's submission id?", leaksVictim, "(must be false)");

// 4. Try forging a studentId in the request body of a POST — never trusted server-side
const forgeAttempt = await attacker.post(`/sessions/${victim.sessionId}/progress/complete`, { studentId: victim.studentAId });
console.log("POST with forged studentId in body -> status:", forgeAttempt.status);
