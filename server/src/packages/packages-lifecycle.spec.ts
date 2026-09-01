import { randomUUID } from 'crypto';
import { createConnection } from 'net';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PackageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PackagesService } from './packages.service';
import { ReviewService } from '../review/review.service';
import { ContentService } from '../content/content.service';

// ---------------------------------------------------------------------------
// Slice 4 — Content Authoring & Version Management lifecycle. Integration
// tests against the real dev PostgreSQL database, same conventions as every
// other spec file in this project (service-level, no HTTP/supertest layer —
// see activity-progress.spec.ts's header comment for why role/auth-guard
// rejections (401/403) are verified live via the browser/API instead of
// here, not by this file — that was done for real in the Slice 4 end-to-end
// validation report, which found every one correctly enforced).
//
// Creates its own throwaway Course/Subject/Session/User rows so it never
// touches the real seeded curriculum or any real student's history — a
// lesson learned the hard way in the prior end-to-end validation slice (see
// that report's "Bugs discovered" §2): never assume the dev DB's shape, and
// never let a cleanup hook run with an unset/undefined filter. Every cleanup
// query below is guarded against an id that never got assigned.
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

/** A complete, valid draft — satisfies every mandatory section (see draft-completeness.ts) so submit() never fails on missing content. */
function completeDraft(exerciseObjective: string, criteria: string[]) {
  return {
    courseId: 'e2e-slice4-course',
    subjectId: 'e2e-slice4-subject',
    sessionTitle: 'E2E Slice 4 Session',
    sessionDescription: 'Fixture session for packages-lifecycle.spec.ts.',
    learning: { objective: 'Learn the thing.', examples: ['example one'], keyConcepts: ['concept one'] },
    practice: { task: 'Practice the thing.', language: 'javascript' },
    exercise: { objective: exerciseObjective, requirements: ['req one'], language: 'javascript', evaluationCriteria: criteria },
  };
}

describe('Content Authoring & Version Management lifecycle (integration, real Postgres)', () => {
  let prisma: PrismaService;
  let packagesService: PackagesService;
  let reviewService: ReviewService;
  let contentService: ContentService;

  let authorId: string;
  let author2Id: string;
  let reviewerId: string;

  const createdUserIds: string[] = [];
  const createdPackageIds: string[] = [];
  const createdSessionIds: string[] = [];
  let mainSessionId: string;
  let mainCourseId: string;
  let mainSubjectId: string;

  async function createUser(role: 'CONTENT_AUTHOR' | 'CONTENT_REVIEWER', label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `packages-lifecycle-${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash-this-user-never-logs-in',
        role,
        name: `Packages Lifecycle Test ${label}`,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  /** A brand-new throwaway Session under the shared fixture Course/Subject — isolates each negative-transition test from the others and from the main happy-path lineage. */
  async function createFixtureSession(): Promise<string> {
    const session = await prisma.session.create({
      data: { id: `e2e-slice4-session-${randomUUID()}`, subjectId: mainSubjectId, title: 'E2E Slice 4 Fixture Session', description: 'fixture', order: 1 },
    });
    createdSessionIds.push(session.id);
    return session.id;
  }

  /** Drives a fresh package for a fresh session to exactly the given status via the real service calls, so each negative-transition test starts from a genuine, correctly-reached state. */
  async function makePackageInStatus(status: PackageStatus): Promise<{ packageId: string; sessionId: string }> {
    const sid = await createFixtureSession();
    const pkg = await packagesService.createPackage(sid, authorId);
    createdPackageIds.push(pkg.id);
    if (status === 'DRAFT') return { packageId: pkg.id, sessionId: sid };

    await packagesService.saveDraft(pkg.id, authorId, completeDraft('Fixture objective.', ['fixture criterion']));
    await packagesService.submit(pkg.id, authorId);
    if (status === 'READY_FOR_REVIEW') return { packageId: pkg.id, sessionId: sid };

    if (status === 'CHANGES_REQUESTED') {
      await reviewService.requestChanges(pkg.id, reviewerId, { checked: true }, 'Fixture change request.');
      return { packageId: pkg.id, sessionId: sid };
    }

    await reviewService.approve(pkg.id, reviewerId, { checked: true });
    if (status === 'APPROVED') return { packageId: pkg.id, sessionId: sid };

    await reviewService.publish(pkg.id, reviewerId);
    return { packageId: pkg.id, sessionId: sid };
  }

  beforeAll(async () => {
    await assertNoLiveBackendServer(Number(process.env.PORT) || 3000);

    prisma = new PrismaService();
    await prisma.$connect();

    const course = await prisma.course.create({ data: { id: `e2e-slice4-course-${randomUUID()}`, title: 'E2E Slice 4 Course', description: 'fixture' } });
    mainCourseId = course.id;
    const subject = await prisma.subject.create({ data: { id: `e2e-slice4-subject-${randomUUID()}`, courseId: course.id, title: 'E2E Slice 4 Subject', description: 'fixture', order: 1 } });
    mainSubjectId = subject.id;
    const session = await prisma.session.create({ data: { id: `e2e-slice4-session-${randomUUID()}`, subjectId: subject.id, title: 'E2E Slice 4 Session', description: 'fixture', order: 1 } });
    mainSessionId = session.id;
    createdSessionIds.push(session.id);

    authorId = await createUser('CONTENT_AUTHOR', 'author');
    author2Id = await createUser('CONTENT_AUTHOR', 'author2');
    reviewerId = await createUser('CONTENT_REVIEWER', 'reviewer');
  });

  beforeEach(() => {
    packagesService = new PackagesService(prisma);
    reviewService = new ReviewService(prisma);
    contentService = new ContentService(prisma);
  });

  afterAll(async () => {
    if (createdSessionIds.length > 0) await prisma.publication.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    if (createdPackageIds.length > 0) {
      await prisma.contentReview.deleteMany({ where: { packageId: { in: createdPackageIds } } });
      await prisma.contentVersion.deleteMany({ where: { packageId: { in: createdPackageIds } } });
      await prisma.contentPackage.deleteMany({ where: { id: { in: createdPackageIds } } });
    }
    if (createdSessionIds.length > 0) await prisma.session.deleteMany({ where: { id: { in: createdSessionIds } } });
    if (mainSubjectId) await prisma.subject.deleteMany({ where: { id: mainSubjectId } });
    if (mainCourseId) await prisma.course.deleteMany({ where: { id: mainCourseId } });
    if (createdUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('happy path — full lifecycle on one session (tests 1-9)', () => {
    it('1. creates a draft package in DRAFT status with empty draftContent', async () => {
      const pkg = await packagesService.createPackage(mainSessionId, authorId);
      createdPackageIds.push(pkg.id);
      expect(pkg.status).toBe('DRAFT');
      expect(pkg.draftContent).toEqual({});
    });

    it('15. rejects creating a second active package for a session that already has one', async () => {
      await expect(packagesService.createPackage(mainSessionId, authorId)).rejects.toThrow(ConflictException);
    });

    it('2. persists draft content and reads it back verbatim', async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'DRAFT' } });
      await packagesService.saveDraft(pkg.id, authorId, completeDraft('Implement thing A.', ['criterion A1', 'criterion A2', 'criterion A3']));
      const read = await packagesService.getPackage(pkg.id, { sub: authorId, role: 'CONTENT_AUTHOR' });
      expect((read.draftContent as ReturnType<typeof completeDraft>).exercise.objective).toBe('Implement thing A.');
    });

    it("rejects another author's attempt to read or edit this package (ownership, not just role)", async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'DRAFT' } });
      await expect(packagesService.saveDraft(pkg.id, author2Id, { x: 1 })).rejects.toThrow(ForbiddenException);
      await expect(packagesService.getPackage(pkg.id, { sub: author2Id, role: 'CONTENT_AUTHOR' })).rejects.toThrow(ForbiddenException);
    });

    it('3. submit for review creates a new immutable ContentVersion and flips status to READY_FOR_REVIEW', async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'DRAFT' } });
      const submitted = await packagesService.submit(pkg.id, authorId);
      expect(submitted.status).toBe('READY_FOR_REVIEW');
      expect(submitted.currentContentVersionId).not.toBeNull();
    });

    it('4. request-changes records an append-only ContentReview row with the given notes', async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'READY_FOR_REVIEW' } });
      await reviewService.requestChanges(pkg.id, reviewerId, { checked: true }, 'Please clarify the exercise scenario.');
      const afterRequest = await prisma.contentPackage.findUniqueOrThrow({ where: { id: pkg.id } });
      expect(afterRequest.status).toBe('CHANGES_REQUESTED');
      const reviews = await prisma.contentReview.findMany({ where: { packageId: pkg.id } });
      expect(reviews).toHaveLength(1);
      expect(reviews[0].action).toBe('CHANGES_REQUESTED');
      expect(reviews[0].notes).toBe('Please clarify the exercise scenario.');
    });

    it('5. resubmitting after edits creates a SECOND, distinct ContentVersion — never mutates the first', async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'CHANGES_REQUESTED' } });
      const firstVersionId = pkg.currentContentVersionId!;
      const firstVersionBefore = await prisma.contentVersion.findUniqueOrThrow({ where: { id: firstVersionId } });

      await packagesService.saveDraft(pkg.id, authorId, completeDraft('Implement thing A (clarified).', ['criterion A1', 'criterion A2', 'criterion A3']));
      const resubmitted = await packagesService.submit(pkg.id, authorId);

      expect(resubmitted.status).toBe('READY_FOR_REVIEW');
      expect(resubmitted.currentContentVersionId).not.toBe(firstVersionId);

      const firstVersionAfter = await prisma.contentVersion.findUniqueOrThrow({ where: { id: firstVersionId } });
      expect(firstVersionAfter.createdAt).toEqual(firstVersionBefore.createdAt);
      expect((firstVersionAfter.exercise as { objective?: string }).objective).toBe('Implement thing A.');
    });

    it('6. approve requires every checklist item checked, then records an APPROVED review and flips status', async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'READY_FOR_REVIEW' } });
      await expect(reviewService.approve(pkg.id, reviewerId, { checked: false })).rejects.toThrow(BadRequestException);
      const approved = await reviewService.approve(pkg.id, reviewerId, { checked: true });
      expect(approved.status).toBe('APPROVED');
    });

    it('7. publish supersedes the prior live Publication and creates exactly one new live Publication + a PUBLISHED review row', async () => {
      const pkg = await prisma.contentPackage.findFirstOrThrow({ where: { sessionId: mainSessionId, status: 'APPROVED' } });
      const publication = await reviewService.publish(pkg.id, reviewerId);
      expect(publication.sessionId).toBe(mainSessionId);

      const live = await prisma.publication.findMany({ where: { sessionId: mainSessionId, supersededAt: null } });
      expect(live).toHaveLength(1);
      expect(live[0].id).toBe(publication.id);

      const pkgAfter = await prisma.contentPackage.findUniqueOrThrow({ where: { id: pkg.id } });
      expect(pkgAfter.status).toBe('PUBLISHED');

      const reviews = await prisma.contentReview.findMany({ where: { packageId: pkg.id, action: 'PUBLISHED' } });
      expect(reviews).toHaveLength(1);
    });

    it('9. the published version now serves the latest (clarified) content to students', async () => {
      const content = await contentService.getPublishedContentForSession(mainSessionId);
      expect((content?.exercise as { objective?: string })?.objective).toBe('Implement thing A (clarified).');
    });

    it('8. the original pre-changes-requested ContentVersion remains byte-for-byte immutable after everything above', async () => {
      const versions = await prisma.contentVersion.findMany({ where: { sessionId: mainSessionId }, orderBy: { createdAt: 'asc' } });
      expect(versions).toHaveLength(2); // pre- and post-changes-requested — never mutated in place
      expect((versions[0].exercise as { objective?: string }).objective).toBe('Implement thing A.');
      expect((versions[0].exercise as { evaluationCriteria?: string[] }).evaluationCriteria).toEqual(['criterion A1', 'criterion A2', 'criterion A3']);
      expect((versions[1].exercise as { objective?: string }).objective).toBe('Implement thing A (clarified).');
    });

    it('13. an in-progress NEW draft (started after publish) is never exposed via the public published-content read path', async () => {
      const liveObjective = ((await contentService.getPublishedContentForSession(mainSessionId))?.exercise as { objective?: string })?.objective;

      const newDraftPkg = await packagesService.createPackage(mainSessionId, authorId);
      createdPackageIds.push(newDraftPkg.id);
      await packagesService.saveDraft(newDraftPkg.id, authorId, completeDraft('SECRET DRAFT ONLY — must never be visible to students.', ['secret criterion']));

      const afterDraftSaved = await contentService.getPublishedContentForSession(mainSessionId);
      expect((afterDraftSaved?.exercise as { objective?: string })?.objective).toBe(liveObjective);

      // Even once submitted for review (still not approved/published), the
      // new ContentVersion it freezes must still not be what students see.
      await packagesService.submit(newDraftPkg.id, authorId);
      const afterSubmit = await contentService.getPublishedContentForSession(mainSessionId);
      expect((afterSubmit?.exercise as { objective?: string })?.objective).toBe(liveObjective);
      expect((afterSubmit?.exercise as { objective?: string })?.objective).not.toContain('SECRET DRAFT');
    });
  });

  describe('16. invalid state transitions are rejected (each on its own independent fixture)', () => {
    it('rejects submitting a package that is READY_FOR_REVIEW (already submitted)', async () => {
      const { packageId } = await makePackageInStatus('READY_FOR_REVIEW');
      await expect(packagesService.submit(packageId, authorId)).rejects.toThrow(ConflictException);
    });

    it('rejects editing (saveDraft) a package that is READY_FOR_REVIEW', async () => {
      const { packageId } = await makePackageInStatus('READY_FOR_REVIEW');
      await expect(packagesService.saveDraft(packageId, authorId, { x: 1 })).rejects.toThrow(ConflictException);
    });

    it('rejects approving a package that is DRAFT (never submitted)', async () => {
      const { packageId } = await makePackageInStatus('DRAFT');
      await expect(reviewService.approve(packageId, reviewerId, { checked: true })).rejects.toThrow(ConflictException);
    });

    it('rejects approving a package that is CHANGES_REQUESTED', async () => {
      const { packageId } = await makePackageInStatus('CHANGES_REQUESTED');
      await expect(reviewService.approve(packageId, reviewerId, { checked: true })).rejects.toThrow(ConflictException);
    });

    it('rejects publishing a package that is DRAFT', async () => {
      const { packageId } = await makePackageInStatus('DRAFT');
      await expect(reviewService.publish(packageId, reviewerId)).rejects.toThrow(ConflictException);
    });

    it('rejects publishing a package that is READY_FOR_REVIEW (not yet approved)', async () => {
      const { packageId } = await makePackageInStatus('READY_FOR_REVIEW');
      await expect(reviewService.publish(packageId, reviewerId)).rejects.toThrow(ConflictException);
    });

    it('rejects publishing an already-PUBLISHED package again (no accidental overwrite)', async () => {
      const { packageId } = await makePackageInStatus('PUBLISHED');
      await expect(reviewService.publish(packageId, reviewerId)).rejects.toThrow(ConflictException);
    });

    it('rejects editing a PUBLISHED package', async () => {
      const { packageId } = await makePackageInStatus('PUBLISHED');
      await expect(packagesService.saveDraft(packageId, authorId, { x: 1 })).rejects.toThrow(ConflictException);
    });

    it('rejects submitting an already-PUBLISHED package', async () => {
      const { packageId } = await makePackageInStatus('PUBLISHED');
      await expect(packagesService.submit(packageId, authorId)).rejects.toThrow(ConflictException);
    });

    it('publishing a fresh session never leaves more than one live Publication', async () => {
      const { sessionId } = await makePackageInStatus('PUBLISHED');
      const live = await prisma.publication.findMany({ where: { sessionId, supersededAt: null } });
      expect(live).toHaveLength(1);
    });
  });
});
