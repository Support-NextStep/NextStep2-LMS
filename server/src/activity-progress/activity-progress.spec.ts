import { randomUUID } from 'crypto';
import { createConnection } from 'net';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityProgressService } from './activity-progress.service';
import type { CompleteActivityDto } from './dto/complete-activity.dto';

// ---------------------------------------------------------------------------
// Server-Side Session Activity Progress slice — integration tests against
// the real dev PostgreSQL database (this project has no separate test-DB
// infrastructure; see evaluation-reliability.spec.ts's own header comment
// for the established precedent this file follows).
//
// These are SERVICE-level integration tests, matching every other spec file
// in this project (evaluation-reliability.spec.ts, huggingface-evaluator.spec.ts,
// etc.) — none of them go through HTTP/supertest, so none of them exercise
// JwtAuthGuard/RolesGuard directly. That means "unauthenticated request ->
// 401" and "wrong role -> 403" are NOT verified here — there is no e2e
// harness in this codebase to verify them against, and adding one would be
// new test infrastructure beyond this slice's scope. What IS verified here,
// directly, is the substance those guards exist to protect: every method
// below takes the acting student's id as an explicit parameter (there is no
// "targetStudentId" the caller could substitute), so ownership/isolation is
// structural, not just a runtime check — proven by the cross-student tests.
// ActivityProgressController uses byte-for-byte the same
// @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.STUDENT) pattern as
// ProgressController/SubmissionsController/EvaluationController, all of
// which have been exercised for real unauthenticated/wrong-role rejections
// via live manual browser testing across this project's history.
//
// Reuses two throwaway User rows and whatever ContentVersion is currently
// published in the dev DB (same precedent as evaluation-reliability.spec.ts)
// — if none exists, the suite fails fast with a clear message. All rows
// created by this file are deleted in afterAll().
// ---------------------------------------------------------------------------

/**
 * Same root-cause guard as evaluation-reliability.spec.ts (duplicated here
 * rather than shared, matching this project's own "small duplication over a
 * cross-file test-infra dependency" precedent — see that file's identically-
 * named function for the full mechanism this protects against). This file
 * doesn't share a background worker with any live server, but it does
 * create/read real rows a live backend's own HTTP routes could observe or
 * race against if a developer runs `npm test` without stopping `npm run
 * start:dev` first — failing fast and clearly here is strictly better than
 * a confusing intermittent assertion failure.
 */
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

describe('ActivityProgressService (integration, real Postgres)', () => {
  let prisma: PrismaService;
  let service: ActivityProgressService;

  let studentAId: string;
  let studentBId: string;
  let sessionId: string;
  let requiredCheckpointIds: string[];

  const createdUserIds: string[] = [];

  async function createTestStudent(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `activity-progress-${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash-this-user-never-logs-in',
        role: 'STUDENT',
        name: `Activity Progress Test ${label}`,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function complete(studentId: string, activityType: string, dto: CompleteActivityDto = {}) {
    return service.completeActivity(sessionId, studentId, activityType, dto);
  }

  beforeAll(async () => {
    await assertNoLiveBackendServer(Number(process.env.PORT) || 3000);

    prisma = new PrismaService();
    await prisma.$connect();

    // A real dev DB can (and, as of the end-to-end LMS validation slice,
    // now does) have MORE THAN ONE currently-published session at once —
    // findFirst() with no further filter previously just took whichever one
    // Postgres happened to return first, which broke the moment a second
    // published session without required checkpoints existed. Scan every
    // live publication and use the first one that actually has a required
    // checkpoint, rather than assuming the dev DB only ever has one.
    const publications = await prisma.publication.findMany({ where: { supersededAt: null }, include: { contentVersion: true } });
    if (publications.length === 0) {
      throw new Error('No currently-published ContentVersion found in the dev database — publish something before running this spec.');
    }
    const withRequiredCheckpoint = publications
      .map((p) => {
        const checkpoints = (p.contentVersion.checkpoints as unknown as { id?: unknown; required?: unknown }[] | null) ?? [];
        const ids = checkpoints.filter((c) => c.required === true && typeof c.id === 'string').map((c) => c.id as string);
        return { publication: p, requiredCheckpointIds: ids };
      })
      .find((candidate) => candidate.requiredCheckpointIds.length > 0);
    if (!withRequiredCheckpoint) {
      throw new Error('None of the currently-published ContentVersions have a required checkpoint — publish content with one before running this spec.');
    }
    sessionId = withRequiredCheckpoint.publication.sessionId;
    requiredCheckpointIds = withRequiredCheckpoint.requiredCheckpointIds;

    studentAId = await createTestStudent('a');
    studentBId = await createTestStudent('b');
  });

  beforeEach(() => {
    service = new ActivityProgressService(prisma);
  });

  afterAll(async () => {
    await prisma.studentActivityProgress.deleteMany({ where: { studentId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Each test starts from a clean slate for studentA/studentB's activity
    // rows — deleting between tests (not just in afterAll) keeps every test
    // below independent of execution order. Guarded against beforeAll
    // itself having failed (studentAId/studentBId still undefined in that
    // case) — an unguarded `in: [undefined, undefined]` is itself a Prisma
    // validation error that would mask the real beforeAll failure.
    if (!studentAId && !studentBId) return;
    await prisma.studentActivityProgress.deleteMany({ where: { studentId: { in: [studentAId, studentBId].filter(Boolean) } } });
  });

  it('records a LEARNING completion', async () => {
    const result = await complete(studentAId, 'learning');
    expect(result.activityType).toBe('learning');
    expect(result.completedAt).toBeInstanceOf(Date);

    const row = await prisma.studentActivityProgress.findUnique({
      where: { studentId_sessionId_activityType: { studentId: studentAId, sessionId, activityType: 'LEARNING' } },
    });
    expect(row).not.toBeNull();
  });

  it('records a PRACTICE completion', async () => {
    await complete(studentAId, 'practice');
    const row = await prisma.studentActivityProgress.findUnique({
      where: { studentId_sessionId_activityType: { studentId: studentAId, sessionId, activityType: 'PRACTICE' } },
    });
    expect(row).not.toBeNull();
  });

  it('records a VIDEO_CHECK completion when every required checkpoint is answered', async () => {
    const result = await complete(studentAId, 'videoCheck', { answeredCheckpointIds: requiredCheckpointIds });
    expect(result.activityType).toBe('videoCheck');
    const row = await prisma.studentActivityProgress.findUnique({
      where: { studentId_sessionId_activityType: { studentId: studentAId, sessionId, activityType: 'VIDEO_CHECK' } },
    });
    expect(row).not.toBeNull();
  });

  it('a WRONG answer still counts as answered — correctness is never part of the payload at all, only which checkpoint ids were seen', async () => {
    // The DTO only ever carries ids, never which option was picked or
    // whether it was right — this test's real assertion is that supplying
    // the exact required ids succeeds regardless of any notion of
    // "correctness," which this service has no way to even receive.
    await expect(complete(studentAId, 'videoCheck', { answeredCheckpointIds: requiredCheckpointIds })).resolves.toMatchObject({
      activityType: 'videoCheck',
    });
  });

  it('rejects VIDEO_CHECK completion when a required checkpoint has not been answered', async () => {
    await expect(complete(studentAId, 'videoCheck', { answeredCheckpointIds: [] })).rejects.toThrow(BadRequestException);
    const row = await prisma.studentActivityProgress.findUnique({
      where: { studentId_sessionId_activityType: { studentId: studentAId, sessionId, activityType: 'VIDEO_CHECK' } },
    });
    expect(row).toBeNull();
  });

  it('rejects an unknown activity type', async () => {
    await expect(complete(studentAId, 'somethingElse')).rejects.toThrow(BadRequestException);
  });

  it('rejects completion for a session that does not exist', async () => {
    await expect(service.completeActivity('nonexistent-session-id', studentAId, 'learning', {})).rejects.toThrow(NotFoundException);
  });

  it('repeated completion is idempotent — no duplicate row, completedAt unchanged', async () => {
    const first = await complete(studentAId, 'learning');
    const second = await complete(studentAId, 'learning');
    expect(second.completedAt.getTime()).toBe(first.completedAt.getTime());

    const count = await prisma.studentActivityProgress.count({
      where: { studentId: studentAId, sessionId, activityType: 'LEARNING' },
    });
    expect(count).toBe(1);
  });

  it('duplicate rows cannot be created even for videoCheck across repeated required-checkpoint submissions', async () => {
    await complete(studentAId, 'videoCheck', { answeredCheckpointIds: requiredCheckpointIds });
    await complete(studentAId, 'videoCheck', { answeredCheckpointIds: requiredCheckpointIds });
    const count = await prisma.studentActivityProgress.count({
      where: { studentId: studentAId, sessionId, activityType: 'VIDEO_CHECK' },
    });
    expect(count).toBe(1);
  });

  it("does not let Student A's completions appear in Student B's activity progress", async () => {
    await complete(studentAId, 'learning');
    await complete(studentAId, 'practice');

    const bList = await service.listForStudent(sessionId, studentBId);
    expect(bList).toHaveLength(0);

    const aList = await service.listForStudent(sessionId, studentAId);
    expect(aList.map((r) => r.activityType).sort()).toEqual(['learning', 'practice']);
  });

  it("completing an activity for Student A never creates or affects any row for Student B", async () => {
    await complete(studentAId, 'learning');
    const bRow = await prisma.studentActivityProgress.findUnique({
      where: { studentId_sessionId_activityType: { studentId: studentBId, sessionId, activityType: 'LEARNING' } },
    });
    expect(bRow).toBeNull();
  });
});
