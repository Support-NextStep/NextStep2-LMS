import { randomUUID } from 'crypto';
import { createConnection } from 'net';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from './progress.service';
import { ActivityProgressService } from '../activity-progress/activity-progress.service';

// ---------------------------------------------------------------------------
// Server-Side Session Activity Progress slice — Complete Session validation.
// Integration tests against the real dev PostgreSQL database, same
// conventions as evaluation-reliability.spec.ts / activity-progress.spec.ts
// (service-level, no HTTP/supertest layer exists in this project — see
// activity-progress.spec.ts's header comment for the full reasoning on what
// that does and doesn't let this file verify).
//
// This specifically covers ProgressService.completeSession() now requiring
// Learning/Video Check/Practice (via StudentActivityProgress) in addition to
// its pre-existing Exercise check (via ExerciseSubmission) — the actual
// closing of the gap this whole slice exists for.
// ---------------------------------------------------------------------------

function assertNoLiveBackendServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const fail = () => {
      socket.destroy();
      reject(
        new Error(
          `A live server is already listening on port ${port}. Stop the dev server before running this integration suite ` +
            `(see evaluation-reliability.spec.ts's assertNoLiveBackendServer for the full reasoning).`
        )
      );
    };
    socket.setTimeout(300);
    socket.on('connect', fail);
    socket.on('timeout', () => {
      socket.destroy();
      resolve();
    });
    socket.on('error', () => resolve());
  });
}

describe('ProgressService.completeSession (integration, real Postgres) — Slice 3 activity requirements', () => {
  let prisma: PrismaService;
  let progressService: ProgressService;
  let activityProgressService: ActivityProgressService;

  let studentId: string;
  let sessionId: string;
  let contentVersionId: string;
  let requiredCheckpointIds: string[];
  let requiredActivities: string[];

  const createdUserIds: string[] = [];
  const createdSubmissionIds: string[] = [];
  let attemptCounter = 900_000; // matches evaluation-reliability.spec.ts's convention — far outside any real attempt number

  async function createTestStudent(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `progress-completion-${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash-this-user-never-logs-in',
        role: 'STUDENT',
        name: `Progress Completion Test ${label}`,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function makeExerciseSubmission(forStudentId: string) {
    attemptCounter += 1;
    const submission = await prisma.exerciseSubmission.create({
      data: {
        studentId: forStudentId,
        sessionId,
        contentVersionId,
        language: 'javascript',
        files: [{ name: 'a.js', content: 'console.log(1)' }],
        attemptNumber: attemptCounter,
      },
    });
    createdSubmissionIds.push(submission.id);
    return submission;
  }

  async function completeAllNonExerciseActivities(forStudentId: string) {
    for (const key of ['learning', 'videoCheck', 'practice'] as const) {
      if (!requiredActivities.includes(key)) continue;
      await activityProgressService.completeActivity(
        sessionId,
        forStudentId,
        key,
        key === 'videoCheck' ? { answeredCheckpointIds: requiredCheckpointIds } : {}
      );
    }
  }

  beforeAll(async () => {
    await assertNoLiveBackendServer(Number(process.env.PORT) || 3000);

    prisma = new PrismaService();
    await prisma.$connect();

    // A real dev DB can have MORE THAN ONE currently-published session at
    // once — findFirst() with no further filter previously just took
    // whichever one Postgres happened to return first, which broke the
    // moment a second published session existed that didn't require both
    // "exercise" and "videoCheck" (exactly what happened once the
    // end-to-end LMS validation slice published a second real session).
    // Scan every live publication and use the first one that actually
    // matches what this spec needs, rather than assuming the dev DB only
    // ever has one.
    const publications = await prisma.publication.findMany({ where: { supersededAt: null }, include: { contentVersion: true } });
    const match = publications.find(
      (p) => p.contentVersion.requiredActivities.includes('exercise') && p.contentVersion.requiredActivities.includes('videoCheck')
    );
    if (!match) {
      throw new Error(
        'No currently-published session requires both "exercise" and "videoCheck" — publish content matching that shape before running this spec.'
      );
    }
    sessionId = match.sessionId;
    contentVersionId = match.contentVersionId;
    requiredActivities = match.contentVersion.requiredActivities;
    const checkpoints = (match.contentVersion.checkpoints as unknown as { id?: unknown; required?: unknown }[] | null) ?? [];
    requiredCheckpointIds = checkpoints.filter((c) => c.required === true && typeof c.id === 'string').map((c) => c.id as string);
  });

  beforeEach(async () => {
    progressService = new ProgressService(prisma);
    activityProgressService = new ActivityProgressService(prisma);
    studentId = await createTestStudent(randomUUID().slice(0, 8));
  });

  afterEach(async () => {
    // Guarded against beforeAll/beforeEach having failed (studentId still
    // undefined in that case) — Prisma treats an `undefined` filter value as
    // "no filter on this field," so an unguarded
    // deleteMany({where:{studentId: undefined}}) silently deletes EVERY row
    // in the table instead of doing nothing. This is not a hypothetical: an
    // earlier version of this guard's absence really did wipe
    // student_session_progress/student_activity_progress for every real
    // student in the dev DB when beforeAll threw — see the end-to-end LMS
    // validation report for the incident and recovery.
    if (!studentId) return;
    await prisma.studentSessionProgress.deleteMany({ where: { studentId } });
    await prisma.studentActivityProgress.deleteMany({ where: { studentId } });
  });

  afterAll(async () => {
    await prisma.exerciseEvaluation.deleteMany({ where: { submissionId: { in: createdSubmissionIds } } });
    await prisma.exerciseSubmission.deleteMany({ where: { id: { in: createdSubmissionIds } } });
    await prisma.studentSessionProgress.deleteMany({ where: { studentId: { in: createdUserIds } } });
    await prisma.studentActivityProgress.deleteMany({ where: { studentId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('rejects completion when required activities (Learning/Video Check/Practice) have not been recorded', async () => {
    await makeExerciseSubmission(studentId); // exercise satisfied, but nothing else is
    await expect(progressService.completeSession(sessionId, studentId)).rejects.toThrow(BadRequestException);

    const row = await prisma.studentSessionProgress.findUnique({ where: { studentId_sessionId: { studentId, sessionId } } });
    expect(row).toBeNull();
  });

  it('rejects completion when Exercise has not been submitted, even if every other activity is recorded', async () => {
    await completeAllNonExerciseActivities(studentId);
    await expect(progressService.completeSession(sessionId, studentId)).rejects.toThrow(BadRequestException);
  });

  it('succeeds once every required activity is recorded and at least one Exercise submission exists', async () => {
    await completeAllNonExerciseActivities(studentId);
    await makeExerciseSubmission(studentId);

    const result = await progressService.completeSession(sessionId, studentId);
    expect(result.sessionId).toBe(sessionId);

    const row = await prisma.studentSessionProgress.findUnique({ where: { studentId_sessionId: { studentId, sessionId } } });
    expect(row).not.toBeNull();
  });

  it('Exercise requirement is satisfied regardless of evaluation status — a submission with NO evaluation row at all still counts', async () => {
    await completeAllNonExerciseActivities(studentId);
    const submission = await makeExerciseSubmission(studentId);
    // Deliberately no ExerciseEvaluation row created for this submission —
    // mirrors a legacy/never-evaluated attempt (e.g. student 1/2's real
    // attempts on session-1 predate the evaluation feature).
    const evaluation = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(evaluation).toBeNull();

    await expect(progressService.completeSession(sessionId, studentId)).resolves.toMatchObject({ sessionId });
  });

  it('Exercise requirement is satisfied even when its evaluation is FAILED', async () => {
    await completeAllNonExerciseActivities(studentId);
    const submission = await makeExerciseSubmission(studentId);
    await prisma.exerciseEvaluation.create({
      data: { submissionId: submission.id, status: 'FAILED', failureReason: 'simulated failure for this test' },
    });

    await expect(progressService.completeSession(sessionId, studentId)).resolves.toMatchObject({ sessionId });
  });

  it('Exercise requirement is satisfied while its evaluation is still PENDING', async () => {
    await completeAllNonExerciseActivities(studentId);
    const submission = await makeExerciseSubmission(studentId);
    await prisma.exerciseEvaluation.create({ data: { submissionId: submission.id, status: 'PENDING' } });

    await expect(progressService.completeSession(sessionId, studentId)).resolves.toMatchObject({ sessionId });
  });

  it('repeated Complete Session calls remain idempotent — no duplicate row, completedAt unchanged', async () => {
    await completeAllNonExerciseActivities(studentId);
    await makeExerciseSubmission(studentId);

    const first = await progressService.completeSession(sessionId, studentId);
    const second = await progressService.completeSession(sessionId, studentId);
    expect(second.completedAt.getTime()).toBe(first.completedAt.getTime());

    const count = await prisma.studentSessionProgress.count({ where: { studentId, sessionId } });
    expect(count).toBe(1);
  });

  it('a wrong answer on the required checkpoint still lets Video Check (and therefore the whole session) complete', async () => {
    // completeAllNonExerciseActivities always calls videoCheck with the
    // required checkpoint ids present — correctness is never part of that
    // payload at all (see ActivityProgressService), so this is really just
    // confirming the end-to-end path succeeds without ever needing a
    // "correct answer" concept anywhere in this chain.
    await completeAllNonExerciseActivities(studentId);
    await makeExerciseSubmission(studentId);
    await expect(progressService.completeSession(sessionId, studentId)).resolves.toMatchObject({ sessionId });
  });

  it('rejects completion for a session that does not exist', async () => {
    await expect(progressService.completeSession('nonexistent-session-id', studentId)).rejects.toThrow(NotFoundException);
    const row = await prisma.studentSessionProgress.findUnique({
      where: { studentId_sessionId: { studentId, sessionId: 'nonexistent-session-id' } },
    });
    expect(row).toBeNull();
  });

  it("does not let Student A's completed sessions appear in Student B's progress list, and vice versa", async () => {
    const studentB = await createTestStudent(`${randomUUID().slice(0, 8)}-b`);
    try {
      await completeAllNonExerciseActivities(studentId);
      await makeExerciseSubmission(studentId);
      await progressService.completeSession(sessionId, studentId);

      const aList = await progressService.listForStudent(studentId);
      const bList = await progressService.listForStudent(studentB);
      expect(aList.some((r) => r.sessionId === sessionId)).toBe(true);
      expect(bList.some((r) => r.sessionId === sessionId)).toBe(false);
      expect(bList).toHaveLength(0);
    } finally {
      await prisma.studentSessionProgress.deleteMany({ where: { studentId: studentB } });
      await prisma.studentActivityProgress.deleteMany({ where: { studentId: studentB } });
      await prisma.user.deleteMany({ where: { id: studentB } });
    }
  });

  it('republishing a new ContentVersion for an already-completed session does not duplicate, reset, or otherwise disturb the existing completion row', async () => {
    await completeAllNonExerciseActivities(studentId);
    await makeExerciseSubmission(studentId);
    const original = await progressService.completeSession(sessionId, studentId);

    // Simulate a real republish: the old Publication is superseded and a new
    // ContentVersion+Publication takes over as "live" — exactly what
    // PackagesService.publish() does — without going through the full
    // review/approve/publish pipeline, since this test only needs to prove
    // ProgressService/StudentSessionProgress are structurally indifferent to
    // which ContentVersion is currently live (see StudentSessionProgress's
    // schema — keyed only by studentId+sessionId, with no contentVersionId
    // column at all).
    const pkg = await prisma.contentPackage.findFirst({ where: { sessionId, status: 'PUBLISHED' } });
    if (!pkg) throw new Error('Expected an existing PUBLISHED package for this session.');
    const newVersion = await prisma.contentVersion.create({
      data: {
        sessionId,
        packageId: pkg.id,
        objective: 'Republish-safety test — v2 objective.',
        concepts: [],
        keyConcepts: [],
        examples: [],
        checkpoints: [],
        practice: {},
        exercise: {},
        requiredActivities,
      },
    });
    await prisma.publication.updateMany({ where: { sessionId, supersededAt: null }, data: { supersededAt: new Date() } });
    await prisma.publication.create({
      data: { sessionId, contentVersionId: newVersion.id, publishedById: pkg.importedById },
    });

    try {
      // The original completion row is untouched — same completedAt, no duplicate.
      const rows = await prisma.studentSessionProgress.findMany({ where: { studentId, sessionId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].completedAt.getTime()).toBe(original.completedAt.getTime());

      // The pre-existing ExerciseSubmission stays pinned to the OLD ContentVersion, never silently repointed.
      const submissions = await prisma.exerciseSubmission.findMany({ where: { studentId, sessionId } });
      expect(submissions.every((s) => s.contentVersionId === contentVersionId)).toBe(true);

      // Re-completing after the republish remains idempotent against the same row.
      const again = await progressService.completeSession(sessionId, studentId);
      expect(again.completedAt.getTime()).toBe(original.completedAt.getTime());
      const countAfter = await prisma.studentSessionProgress.count({ where: { studentId, sessionId } });
      expect(countAfter).toBe(1);
    } finally {
      // Restore the original publication as live so this doesn't leak into
      // other tests/specs (or the real dev DB's own live catalog) that
      // assume the pre-existing published version is current.
      await prisma.publication.deleteMany({ where: { contentVersionId: newVersion.id } });
      await prisma.contentVersion.delete({ where: { id: newVersion.id } });
      await prisma.publication.updateMany({ where: { sessionId, contentVersionId }, data: { supersededAt: null } });
    }
  });
});
