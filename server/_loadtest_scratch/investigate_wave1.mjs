import { readFileSync } from "node:fs";
import { runVirtualStudent } from "./scenario.mjs";

const pool = JSON.parse(readFileSync("./_loadtest_scratch/pool.json", "utf8"));
const accounts = pool.slice(40, 80);

const results = await Promise.allSettled(accounts.map((acc) => runVirtualStudent(acc, { submitExercise: false })));
const allTimings = [];
for (const r of results) {
  if (r.status === "fulfilled") allTimings.push(...r.value.timings);
  else console.log("THREW:", r.reason);
}
const errors = allTimings.filter((t) => !t.ok);
console.log("Total requests:", allTimings.length, "Errors:", errors.length);
for (const e of errors) {
  console.log(JSON.stringify(e));
}
