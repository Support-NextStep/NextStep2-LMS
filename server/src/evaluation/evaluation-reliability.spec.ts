import { randomUUID } from 'crypto';
import { createConnection } from 'net';
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
//
// PRECONDITION, now enforced (not just documented): the real backend's
// EvaluationWorkerService must not be running while this suite runs — it
// polls this same exercise_evaluations table in the background and can
// claim/process this suite's own rows with the real evaluator instead of
// ControllableEvaluator. beforeAll() below refuses to proceed if anything
// is listening on the backend's port, rather than risk the intermittent
// "expected FAILED, got EVALUATED" failure that motivated this guard — see
// assertNoLiveBackendServer()'s own comment for the full mechanism.
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Root-cause guard for a real, previously-observed intermittent failure in
 * this file (the "becomes FAILED once retries are exhausted" test): if the
 * REAL backend (with its REAL EvaluationWorkerService, which polls
 * exercise_evaluations every ~2s by default — see evaluation-config.ts's
 * pollIntervalMs) is still running, it claims and processes real rows in
 * the exact same table this suite creates rows in, using the REAL
 * evaluator instead of this file's ControllableEvaluator. That retry test
 * specifically sleeps ~2020ms waiting for its own backoff to become due —
 * almost exactly one real poll interval — so a still-running worker can
 * (rarely, but non-deterministically) claim and successfully evaluate the
 * test's own PENDING row during that window, flipping it to EVALUATED
 * before the test's retry-exhaustion logic ever gets to reprocess it. This
 * reproduced exactly once, and never again across 12 clean runs once the
 * dev server was confirmed stopped — consistent with genuine external
 * interference, not a flaw in the retry logic itself (which every isolated
 * and full-file run has otherwise passed deterministically).
 *
 * Rather than leave that as a rare, confusing, hard-to-reproduce flake,
 * this checks the precondition this whole file's header comment already
 * assumes — "no live worker touching the same rows" — and fails the ENTIRE
 * suite immediately and unambiguously if it's violated, before creating any
 * test data. This is a test-only safety net: it changes no timing, no
 * retry/backoff behavior, and no production code.
 */
function assertNoLiveBackendServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const fail = () => {
      socket.destroy();
      reject(
        new Error(
          `A live server is already listening on port ${port}. This looks like the real backend ` +
            `(and its background EvaluationWorkerService) still running — it polls exercise_evaluations ` +
            `every ~${2_000}ms by default and WILL intermittently race this suite for the same rows, ` +
            `occasionally flipping a test's PENDING row to EVALUATED before its own retry logic can run. ` +
            `Stop the dev server (and confirm no orphaned child process is still bound to this port — ` +
            `"taskkill /F" on the parent nest-cli watcher does not always kill its spawned "node dist/src/main" ` +
            `child on Windows) before running this integration suite.`
        )
      );
    };
    socket.setTimeout(300);
    socket.on('connect', fail);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(); // nothing answered within the timeout — safe to proceed
    });
    socket.on('error', () => resolve()); // ECONNREFUSED etc. — nothing listening — safe to proceed
  });
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
    await assertNoLiveBackendServer(Number(process.env.PORT) || 3000);

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
        // 500ms, not the original 10ms this was written with — a 10ms
        // backoff window is shorter than a single real Postgres round trip
        // on this machine, so the "not due yet" assertion below flaked
        // (sometimes the row was already due by the time claimNext() ran
        // again). 500ms gives real margin while keeping the whole suite
        // fast (a few hundred ms added, once, across the whole file).
        AI_EVALUATION_RETRY_BASE_DELAY_MS: '500',
        AI_EVALUATION_RETRY_MAX_DELAY_MS: '2000',
        AI_EVALUATION_STALE_MS: '3000',
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
  // Explicit timeout: this loop can sleep up to retryMaxDelayMs (2000ms) per
  // iteration across up to maxRetries+1 iterations, comfortably exceeding
  // Jest's default 5000ms per-test timeout.
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
  }, 20_000);

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
