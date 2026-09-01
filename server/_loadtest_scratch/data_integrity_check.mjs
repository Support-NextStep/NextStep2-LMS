import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
await prisma.$connect();

const before = JSON.parse(readFileSync("./_loadtest_scratch/baseline_before.json", "utf8").replace(/^BASELINE_BEFORE_SLICE8:\s*/, ""));

const after = {
  users: await prisma.user.count(),
  students: await prisma.user.count({ where: { role: "STUDENT" } }),
  submissions: await prisma.exerciseSubmission.count(),
  evaluations: await prisma.exerciseEvaluation.count(),
  sessionProgress: await prisma.studentSessionProgress.count(),
  activityProgress: await prisma.studentActivityProgress.count(),
};

console.log("BEFORE:", JSON.stringify(before));
console.log("AFTER: ", JSON.stringify(after));
console.log("DELTA: ", JSON.stringify(Object.fromEntries(Object.keys(before).map((k) => [k, after[k] - before[k]]))));

// Orphan checks — a row whose FK target no longer exists.
const orphanSubmissions = await prisma.$queryRaw`
  SELECT count(*)::int AS c FROM exercise_submissions es
  LEFT JOIN users u ON u.id = es.student_id
  WHERE u.id IS NULL
`;
console.log("Orphan submissions (no matching student):", orphanSubmissions[0].c);

const orphanEvaluations = await prisma.$queryRaw`
  SELECT count(*)::int AS c FROM exercise_evaluations ee
  LEFT JOIN exercise_submissions es ON es.id = ee.submission_id
  WHERE es.id IS NULL
`;
console.log("Orphan evaluations (no matching submission):", orphanEvaluations[0].c);

const orphanSessionProgress = await prisma.$queryRaw`
  SELECT count(*)::int AS c FROM student_session_progress ssp
  LEFT JOIN users u ON u.id = ssp.student_id
  WHERE u.id IS NULL
`;
console.log("Orphan session progress rows:", orphanSessionProgress[0].c);

const orphanActivityProgress = await prisma.$queryRaw`
  SELECT count(*)::int AS c FROM student_activity_progress sap
  LEFT JOIN users u ON u.id = sap.student_id
  WHERE u.id IS NULL
`;
console.log("Orphan activity progress rows:", orphanActivityProgress[0].c);

// Duplicate checks — unique constraints should already prevent these at the DB level, verify no violations slipped through.
const dupSessionProgress = await prisma.$queryRaw`
  SELECT student_id, session_id, count(*)::int AS c FROM student_session_progress
  GROUP BY student_id, session_id HAVING count(*) > 1
`;
console.log("Duplicate (student,session) progress rows:", dupSessionProgress.length);

const dupActivityProgress = await prisma.$queryRaw`
  SELECT student_id, session_id, activity_type, count(*)::int AS c FROM student_activity_progress
  GROUP BY student_id, session_id, activity_type HAVING count(*) > 1
`;
console.log("Duplicate (student,session,activityType) rows:", dupActivityProgress.length);

const dupEvaluations = await prisma.$queryRaw`
  SELECT submission_id, count(*)::int AS c FROM exercise_evaluations
  GROUP BY submission_id HAVING count(*) > 1
`;
console.log("Duplicate evaluation rows per submission:", dupEvaluations.length);

// Cross-reference: every submission's contentVersionId must belong to the SAME session as the submission itself.
const mismatchedVersion = await prisma.$queryRaw`
  SELECT count(*)::int AS c FROM exercise_submissions es
  JOIN content_versions cv ON cv.id = es.content_version_id
  WHERE cv.session_id != es.session_id
`;
console.log("Submissions whose ContentVersion belongs to a DIFFERENT session:", mismatchedVersion[0].c);

// Multiple live publications per session (should never happen — partial unique index).
const dupLivePub = await prisma.$queryRaw`
  SELECT session_id, count(*)::int AS c FROM publications WHERE superseded_at IS NULL
  GROUP BY session_id HAVING count(*) > 1
`;
console.log("Sessions with more than one live publication:", dupLivePub.length);

await prisma.$disconnect();
