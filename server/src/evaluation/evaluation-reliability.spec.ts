import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationConfig } from './evaluation-config';
import { EvaluationService } from './evaluation.service';
import { PermanentEvaluationError, RetryableEvaluationError, type EvaluationInput, type EvaluationOutput, type ExerciseEvaluator } from './evaluator.interface';

// ---------------------------------------------------------------------------
// AI Evaluation Reliability slice — integration tests against the real dev
// PostgreSQL database (this project has no separate test-DB infrastructure;
// see every prior slice's own verification approach). A ControllableEvaluator
// test double stands in for the real HTTP-calling evaluator, so these never
// hit a real network/LLM provider — see huggingface-evaluator.spec.ts for
// the provider-specific secret-leak test, and the reliability slice's report
// for the separate live Hugging Face smoke test.
//
// Uses two throwaway User rows and reuses whatever ContentVersion is
// currently published in the dev DB (created fresh by nothing here — if
// none exists, the suite fails fast with a clear message rather than
// silently skipping). All rows created by this file are deleted in
// afterAll(); the ContentVersion-pinning test additionally restores the
// original Publication state it temporarily supersedes, in a try/finally.
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configWith(overrides: Record<string, string>): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

class ControllableEvaluator implements ExerciseEvaluator {
  calls = 0;
  behavior: (input: EvaluationInput) => Promise<EvaluationOutput> = async () => fakeOutput();

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    this.calls++;
    return this.behavior(input);
  }
}

function fakeOutput(overallScore = 90): EvaluationOutput {
  return {
    overallScore,
    criteriaResults: [{ criterion: 'test criterion', score: overallScore, passed: overallScore >= 50, feedback: 'ok' }],
    strengths: ['strength'],
    improvements: [],
    feedback: 'looks good',
    providerName: 'controllable-test-evaluator',
  };
}

describe('AI Evaluation Reliability (integration, real Postgres, mock evaluator)', () => {
  let prisma: PrismaService;
  let testConfig: EvaluationConfig;
  let evaluator: ControllableEvaluator;
  let service: EvaluationService;

  let studentAId: string;
  let studentBId: string;
  let sessionId: string;
  let contentVersionId: string;
  let stablePublisherId: string; // a real, permanent User (never deleted by this suite) — used as publishedById for the throwaway Publication the pinning test creates, so afterAll's user cleanup is never blocked by a leftover FK reference

  const createdSubmissionIds: string[] = [];
  const createdUserIds: string[] = [];
  let attemptCounter = 900_000; // far outside any realistic real attempt number, to avoid unique-constraint collisions with real data

  async function createTestStudent(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `eval-reliability-${label}-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash-this-user-never-logs-in',
        role: 'STUDENT',
        name: `Eval Reliability Test ${label}`,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function makeSubmission(studentId: string, files: { name: string; content: string }[] = [{ name: 'a.js', content: 'console.log(1)' }]) {
    attemptCounter += 1;
    const submission = await prisma.exerciseSubmission.create({
      data: {
        studentId,
        sessionId,
        contentVersionId,
        language: 'javascript',
        files,
        attemptNumber: attemptCounter,
      },
    });
    createdSubmissionIds.push(submission.id);
    return submission;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const publication = await prisma.publication.findFirst({ where: { supersededAt: null } });
    if (!publication) {
      throw new Error('No currently-published ContentVersion found in the dev database — publish something before running this spec.');
    }
    sessionId = publication.sessionId;
    contentVersionId = publication.contentVersionId;
    stablePublisherId = publication.publishedById;

    studentAId = await createTestStudent('a');
    studentBId = await createTestStudent('b');

    testConfig = new EvaluationConfig(
      configWith({
        AI_EVALUATION_MAX_RETRIES: '2',
        AI_EVALUATION_RETRY_BASE_DELAY_MS: '10',
        AI_EVALUATION_RETRY_MAX_DELAY_MS: '50',
        AI_EVALUATION_STALE_MS: '100',
        AI_EVALUATION_MAX_FILES: '3',
        AI_EVALUATION_MAX_TOTAL_INPUT_CHARS: '200',
      })
    );
  });

  beforeEach(() => {
    evaluator = new ControllableEvaluator();
    service = new EvaluationService(prisma, testConfig, evaluator);
  });

  afterAll(async () => {
    await prisma.exerciseEvaluation.deleteMany({ where: { submissionId: { in: createdSubmissionIds } } });
    await prisma.exerciseSubmission.deleteMany({ where: { id: { in: createdSubmissionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  // 1. Submission creates PENDING evaluation.
  it('creates a PENDING evaluation for a new submission', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    const evaluation = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(evaluation?.status).toBe('PENDING');
    expect(evaluation?.retryCount).toBe(0);
  });

  // 4. Duplicate processing cannot create duplicate evaluations (creation side).
  it('creating a pending evaluation twice for the same submission never creates a second row', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    await service.createPendingEvaluation(submission.id);
    const count = await prisma.exerciseEvaluation.count({ where: { submissionId: submission.id } });
    expect(count).toBe(1);
  });

  // 2 + 3. Worker processes PENDING -> EVALUATING -> EVALUATED, real evaluator result persisted.
  it('processes a claimed PENDING evaluation through to EVALUATED and persists the result', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    evaluator.behavior = async () => fakeOutput(77);

    const claimed = await service.claimNext(5);
    const mine = claimed.find((c) => c.submissionId === submission.id);
    expect(mine).toBeDefined();

    const duringClaim = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(duringClaim?.status).toBe('EVALUATING');

    await service.processClaimed(mine!.id, mine!.submissionId);

    const after = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(after?.status).toBe('EVALUATED');
    expect(after?.overallScore).toBe(77);
    expect(after?.providerName).toBe('controllable-test-evaluator');
    expect(evaluator.calls).toBe(1);
  });

  // 5 + 6. Transient/timeout failures retry with backoff, and are not claimable again before they're due.
  it('retries a retryable (transient) failure with backoff, then succeeds once due', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);

    let attempt = 0;
    evaluator.behavior = async () => {
      attempt++;
      if (attempt < 2) throw new RetryableEvaluationError('simulated transient network error');
      return fakeOutput(60);
    };

    let claimed = await service.claimNext(5);
    let mine = claimed.find((c) => c.submissionId === submission.id)!;
    await service.processClaimed(mine.id, mine.submissionId);

    let row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('PENDING'); // retried, not failed
    expect(row?.retryCount).toBe(1);
    expect(row?.nextAttemptAt).not.toBeNull();
    expect(row?.failureReason).toMatch(/Retrying after transient error/);

    // Not due yet — must not be claimable immediately.
    claimed = await service.claimNext(5);
    expect(claimed.find((c) => c.submissionId === submission.id)).toBeUndefined();

    await sleep(testConfig.backoffDelayMs(1) + 60);
    claimed = await service.claimNext(5);
    mine = claimed.find((c) => c.submissionId === submission.id)!;
    expect(mine).toBeDefined();
    await service.processClaimed(mine.id, mine.submissionId);

    row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('EVALUATED');
    expect(row?.overallScore).toBe(60);
  });

  // 7. Permanent validation error does not endlessly retry.
  it('a permanent error goes straight to FAILED without retrying', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    evaluator.behavior = async () => {
      throw new PermanentEvaluationError('invalid AI JSON');
    };

    const claimed = await service.claimNext(5);
    const mine = claimed.find((c) => c.submissionId === submission.id)!;
    await service.processClaimed(mine.id, mine.submissionId);

    const row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('FAILED');
    expect(row?.retryCount).toBe(1);
    expect(row?.failureReason).toBe('invalid AI JSON');
    expect(row?.overallScore).toBeNull();
    expect(evaluator.calls).toBe(1); // never retried
  });

  // 8. Evaluation eventually becomes FAILED after retry exhaustion, never fabricating a score.
  it('becomes FAILED once retries are exhausted, never fabricating a score', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    evaluator.behavior = async () => {
      throw new RetryableEvaluationError('always fails');
    };

    for (let i = 0; i < testConfig.maxRetries + 1; i++) {
      const claimed = await service.claimNext(5);
      const mine = claimed.find((c) => c.submissionId === submission.id);
      if (mine) await service.processClaimed(mine.id, mine.submissionId);
      const row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
      if (row?.status === 'FAILED') break;
      await sleep(testConfig.retryMaxDelayMs + 20);
    }

    const row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('FAILED');
    expect(row?.overallScore).toBeNull();
    expect(row?.failureReason).toMatch(/Retries exhausted/);
  });

  // 9. Submission remains intact when evaluation fails.
  it('never touches ExerciseSubmission when evaluation fails', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    evaluator.behavior = async () => {
      throw new PermanentEvaluationError('boom');
    };
    const claimed = await service.claimNext(5);
    const mine = claimed.find((c) => c.submissionId === submission.id)!;
    await service.processClaimed(mine.id, mine.submissionId);

    const stillThere = await prisma.exerciseSubmission.findUnique({ where: { id: submission.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.id).toBe(submission.id);
  });

  // 10. Stale EVALUATING work can recover; a fresh lease must not be reclaimed early.
  it('reclaims a stale EVALUATING row (simulating a crashed worker) after the stale threshold', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    await prisma.exerciseEvaluation.update({
      where: { submissionId: submission.id },
      data: { status: 'EVALUATING', attemptedAt: new Date(Date.now() - (testConfig.staleMs + 1000)) },
    });

    const claimed = await service.claimNext(5);
    const mine = claimed.find((c) => c.submissionId === submission.id);
    expect(mine).toBeDefined();

    evaluator.behavior = async () => fakeOutput(88);
    await service.processClaimed(mine!.id, mine!.submissionId);
    const row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('EVALUATED');
  });

  it('does NOT reclaim a recently-claimed EVALUATING row still within its lease', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);
    await prisma.exerciseEvaluation.update({
      where: { submissionId: submission.id },
      data: { status: 'EVALUATING', attemptedAt: new Date() },
    });
    const claimed = await service.claimNext(5);
    expect(claimed.find((c) => c.submissionId === submission.id)).toBeUndefined();
  });

  // 11. Concurrent workers cannot process the same evaluation twice.
  it('never lets two concurrent claim attempts claim the same row', async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);

    const [claimA, claimB] = await Promise.all([service.claimNext(5), service.claimNext(5)]);
    const inA = claimA.some((c) => c.submissionId === submission.id);
    const inB = claimB.some((c) => c.submissionId === submission.id);
    expect(inA !== inB).toBe(true); // claimed by exactly one of the two concurrent attempts, never both
  });

  // 12. Large submission is rejected safely, without ever reaching the evaluator.
  it('fails an oversized submission immediately without calling the evaluator', async () => {
    const submission = await makeSubmission(studentAId, [{ name: 'big.js', content: 'x'.repeat(500) }]); // > testConfig.maxTotalInputChars (200)
    await service.createPendingEvaluation(submission.id);
    const claimed = await service.claimNext(5);
    const mine = claimed.find((c) => c.submissionId === submission.id)!;
    await service.processClaimed(mine.id, mine.submissionId);

    const row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('FAILED');
    expect(row?.failureReason).toMatch(/exceeding the evaluator's limit/);
    expect(evaluator.calls).toBe(0);
  });

  it('fails a submission with too many files immediately without calling the evaluator', async () => {
    const manyFiles = Array.from({ length: 10 }, (_, i) => ({ name: `f${i}.js`, content: 'x' })); // > testConfig.maxFiles (3)
    const submission = await makeSubmission(studentAId, manyFiles);
    await service.createPendingEvaluation(submission.id);
    const claimed = await service.claimNext(5);
    const mine = claimed.find((c) => c.submissionId === submission.id)!;
    await service.processClaimed(mine.id, mine.submissionId);

    const row = await prisma.exerciseEvaluation.findUnique({ where: { submissionId: submission.id } });
    expect(row?.status).toBe('FAILED');
    expect(row?.failureReason).toMatch(/files, exceeding/);
    expect(evaluator.calls).toBe(0);
  });

  // 13. ContentVersion pinning: evaluation must use the submission's own pinned version, never whatever is currently published.
  it("pins evaluation to the submission's own ContentVersion, never the currently-published one", async () => {
    const submission = await makeSubmission(studentAId);
    const originalVersion = await prisma.contentVersion.findUniqueOrThrow({ where: { id: contentVersionId } });

    const newVersion = await prisma.contentVersion.create({
      data: {
        sessionId: originalVersion.sessionId,
        packageId: originalVersion.packageId,
        objective: 'COMPLETELY DIFFERENT OBJECTIVE FOR PINNING TEST',
        explanation: '',
        concepts: [],
        keyConcepts: [],
        examples: [],
        checkpoints: [],
        practice: {},
        exercise: {
          language: 'javascript',
          requirements: [],
          evaluationCriteria: [],
          edgeCases: [],
          objective: 'COMPLETELY DIFFERENT OBJECTIVE FOR PINNING TEST',
        },
        requiredActivities: [],
      },
    });

    let newPublicationId: string | undefined;
    try {
      await prisma.publication.updateMany({ where: { sessionId: originalVersion.sessionId, supersededAt: null }, data: { supersededAt: new Date() } });
      // Reuses the real Publication's own publisher (a permanent, non-test
      // User) rather than one of this suite's throwaway students — a
      // throwaway user referenced by an FK we don't clean up here would
      // block afterAll()'s user cleanup.
      const newPublication = await prisma.publication.create({
        data: { contentVersionId: newVersion.id, sessionId: originalVersion.sessionId, publishedById: stablePublisherId },
      });
      newPublicationId = newPublication.id;

      let receivedObjective: string | undefined;
      evaluator.behavior = async (input) => {
        receivedObjective = input.exercise.objective;
        return fakeOutput(50);
      };

      await service.createPendingEvaluation(submission.id);
      const claimed = await service.claimNext(5);
      const mine = claimed.find((c) => c.submissionId === submission.id)!;
      await service.processClaimed(mine.id, mine.submissionId);

      // Compare against the ORIGINAL version's exercise.objective (the
      // nested JSON field evaluate() actually reads) — not
      // ContentVersion.objective, a distinct top-level column for the
      // Learning section, which is not what's being pinned/tested here.
      const originalExerciseObjective = (originalVersion.exercise as { objective?: string } | null)?.objective;
      expect(receivedObjective).toBe(originalExerciseObjective);
      expect(receivedObjective).not.toContain('COMPLETELY DIFFERENT');
    } finally {
      // Fully delete the throwaway Publication/ContentVersion (not just
      // supersede) — they were never real content, and restore the
      // original Publication's live status regardless of assertion outcome.
      if (newPublicationId) {
        await prisma.publication.delete({ where: { id: newPublicationId } }).catch(() => {});
      }
      await prisma.publication.updateMany({
        where: { sessionId: originalVersion.sessionId, contentVersionId: originalVersion.id },
        data: { supersededAt: null },
      });
      await prisma.contentVersion.delete({ where: { id: newVersion.id } }).catch(() => {
        // Best-effort — if something still references it, leaving one orphaned test ContentVersion row is harmless and not worth failing the suite over.
      });
    }
  });

  // 14. Student cannot access another student's evaluation.
  it("does not allow a student to read another student's evaluation", async () => {
    const submission = await makeSubmission(studentAId);
    await service.createPendingEvaluation(submission.id);

    await expect(service.getEvaluationForStudent(sessionId, submission.id, studentBId)).rejects.toThrow(ForbiddenException);
    const mine = await service.getEvaluationForStudent(sessionId, submission.id, studentAId);
    expect(mine).toBeDefined();
  });
});
