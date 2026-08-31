import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EvaluationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildExerciseSpec, buildSubmittedFiles, validateEvaluationOutput } from './evaluation-data';
import { EvaluationConfig } from './evaluation-config';
import { EXERCISE_EVALUATOR, PermanentEvaluationError, RetryableEvaluationError, type ExerciseEvaluator } from './evaluator.interface';

/** One row claimed off the queue — just enough for the worker to act on. */
export type ClaimedEvaluation = { id: string; submissionId: string };

export type QueueStats = Record<EvaluationStatus, number>;

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationConfig: EvaluationConfig,
    @Inject(EXERCISE_EVALUATOR) private readonly evaluator: ExerciseEvaluator
  ) {}

  /**
   * Exactly one ExerciseEvaluation per ExerciseSubmission, enforced by the
   * `submissionId @unique` constraint (Slice 2.0) — a retried/duplicate call
   * for the same submission is a safe no-op, never a second row. Called
   * synchronously from SubmissionsService.submit() right after the
   * ExerciseSubmission commits — this is the only part of evaluation that's
   * still on the request path; the actual evaluate() call happens later, in
   * the background, via EvaluationWorkerService claiming this PENDING row.
   */
  async createPendingEvaluation(submissionId: string): Promise<void> {
    try {
      await this.prisma.exerciseEvaluation.create({ data: { submissionId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return; // already exists for this submission — idempotent by design
      }
      throw err;
    }
  }

  /**
   * Atomically claims up to `limit` rows of due work — PENDING rows whose
   * `nextAttemptAt` has arrived (or was never set), OR EVALUATING rows whose
   * lease has gone stale (the worker that claimed them presumably crashed
   * mid-attempt, per staleMs). `FOR UPDATE SKIP LOCKED` inside a single
   * statement is what makes this safe under concurrent callers — including,
   * if this process is ever horizontally scaled later, multiple backend
   * instances polling the same table: two callers can never claim the same
   * row, one just skips past whatever the other already locked. This is the
   * entire "queue" — no separate table, no broker, just this row's own
   * status + timestamps claimed under a row lock.
   */
  async claimNext(limit: number): Promise<ClaimedEvaluation[]> {
    const staleCutoff = new Date(Date.now() - this.evaluationConfig.staleMs);
    const claimed = await this.prisma.$queryRaw<{ id: string; submission_id: string }[]>`
      UPDATE exercise_evaluations
      SET status = 'EVALUATING', attempted_at = now()
      WHERE id IN (
        SELECT id FROM exercise_evaluations
        WHERE (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
           OR (status = 'EVALUATING' AND attempted_at < ${staleCutoff})
        ORDER BY attempted_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, submission_id
    `;
    return claimed.map((r) => ({ id: r.id, submissionId: r.submission_id }));
  }

  /**
   * PENDING/EVALUATING -> EVALUATED, or, on failure, either back to PENDING
   * with a backoff delay (retryable, budget remaining) or straight to FAILED
   * (permanent, or retries exhausted). Never deletes or mutates the
   * ExerciseSubmission row — a failed evaluation is exclusively reflected on
   * ExerciseEvaluation. Called only by EvaluationWorkerService on a row it
   * just claimed via claimNext() — status is already EVALUATING by the time
   * this runs.
   *
   * CRITICAL (Slice 2 audit §G/§8): the Exercise spec is read from
   * `submission.contentVersion.exercise` — the exact immutable
   * ContentVersion this submission was pinned to at submit time — never
   * from ContentService's "currently published" resolution. A later
   * republish that changes the Exercise spec for this session must NEVER
   * change what an already-submitted attempt is graded against.
   */
  async processClaimed(evaluationId: string, submissionId: string): Promise<void> {
    const started = Date.now();
    // priorRetryCount defaults to 0 for the (extremely unlikely) case where
    // even the evaluation lookup itself fails — handleFailure still needs
    // some value to reason about, and 0 is the safe assumption (worst case,
    // one retry is "wasted" rather than lost).
    let priorRetryCount = 0;

    try {
      // Both lookups are now INSIDE the try block — a transient DB error
      // here must reach handleFailure() (retry/FAILED) exactly like an
      // evaluator error, never escape uncaught and leave the row stranded
      // at EVALUATING until the stale-reclaim threshold eventually notices
      // it (see the reliability slice's load-test report for the concrete
      // race this closes).
      const evaluation = await this.prisma.exerciseEvaluation.findUnique({ where: { id: evaluationId } });
      if (!evaluation) return;
      priorRetryCount = evaluation.retryCount;

      const submission = await this.prisma.exerciseSubmission.findUnique({
        where: { id: submissionId },
        include: { contentVersion: true },
      });
      // Defensive only — the FK guarantees a submission row exists for
      // every ExerciseEvaluation; this can't happen on any real code path.
      if (!submission) return;

      const files = buildSubmittedFiles(submission.files);
      this.assertWithinInputLimits(files);

      const exercise = buildExerciseSpec(submission.contentVersion.exercise);
      const rawResult = await this.evaluator.evaluate({ exercise, files });
      const result = validateEvaluationOutput(rawResult);

      await this.prisma.exerciseEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: 'EVALUATED',
          overallScore: result.overallScore,
          criteriaResults: result.criteriaResults as unknown as Prisma.InputJsonValue,
          strengths: result.strengths,
          improvements: result.improvements,
          feedback: result.feedback,
          providerName: result.providerName,
          evaluatedAt: new Date(),
        },
      });
      this.logger.log(
        `evaluation=${evaluationId} submission=${submissionId} status=EVALUATED attempt=${priorRetryCount + 1} durationMs=${Date.now() - started} provider=${result.providerName}`
      );
    } catch (err) {
      try {
        await this.handleFailure(evaluationId, submissionId, priorRetryCount, started, err);
      } catch (handleErr) {
        // handleFailure()'s own DB write failed (e.g. a genuine outage) —
        // nothing more this method can safely do; the stale-reclaim
        // threshold in claimNext() is the backstop that eventually
        // recovers this row once the outage clears.
        this.logger.error(
          `failed to record failure for evaluation=${evaluationId} submission=${submissionId}: ${handleErr instanceof Error ? handleErr.message : String(handleErr)}`
        );
      }
    }
  }

  /**
   * Never fabricates a passing score, never touches ExerciseSubmission.
   * Retryable errors (network/timeout/429/5xx — see evaluator.interface.ts)
   * go back to PENDING with a backoff delay, as long as retry budget
   * remains; anything else (PermanentEvaluationError, a schema-validation
   * failure from validateEvaluationOutput(), or any other thrown value) —
   * or a retryable error with no budget left — goes straight to FAILED with
   * a clear, non-fabricated reason.
   */
  private async handleFailure(evaluationId: string, submissionId: string, priorRetryCount: number, started: number, err: unknown): Promise<void> {
    const durationMs = Date.now() - started;
    const attempt = priorRetryCount + 1;
    const message = err instanceof Error ? err.message : 'Unknown evaluation error.';
    const isRetryable = err instanceof RetryableEvaluationError;
    const retriesLeft = attempt < this.evaluationConfig.maxRetries;

    if (isRetryable && retriesLeft) {
      const retryAfterMs = err instanceof RetryableEvaluationError ? err.retryAfterMs : undefined;
      const delayMs = retryAfterMs ?? this.evaluationConfig.backoffDelayMs(attempt);
      await this.prisma.exerciseEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: 'PENDING',
          retryCount: attempt,
          nextAttemptAt: new Date(Date.now() + delayMs),
          failureReason: `Retrying after transient error (attempt ${attempt}/${this.evaluationConfig.maxRetries}): ${message}`,
        },
      });
      this.logger.warn(
        `evaluation=${evaluationId} submission=${submissionId} status=PENDING(retry) attempt=${attempt} durationMs=${durationMs} retryInMs=${delayMs} category=retryable`
      );
      return;
    }

    await this.prisma.exerciseEvaluation.update({
      where: { id: evaluationId },
      data: {
        status: 'FAILED',
        retryCount: attempt,
        failureReason: isRetryable ? `Retries exhausted after ${attempt} attempts: ${message}` : message,
      },
    });
    this.logger.error(
      `evaluation=${evaluationId} submission=${submissionId} status=FAILED attempt=${attempt} durationMs=${durationMs} category=${isRetryable ? 'retries-exhausted' : 'permanent'}`
    );
  }

  /**
   * Enforced right before building the prompt — never after, and never by
   * silently truncating (which could produce misleading grading). An
   * oversized submission is a PermanentEvaluationError: retrying the same
   * oversized payload will never succeed, so it goes straight to FAILED
   * without consuming retry budget or ever reaching the LLM call.
   */
  private assertWithinInputLimits(files: { name: string; content: string }[]): void {
    if (files.length > this.evaluationConfig.maxFiles) {
      throw new PermanentEvaluationError(
        `Submission has ${files.length} files, exceeding the evaluator's limit of ${this.evaluationConfig.maxFiles}. Evaluation was not attempted.`
      );
    }
    const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);
    if (totalChars > this.evaluationConfig.maxTotalInputChars) {
      throw new PermanentEvaluationError(
        `Submission content is ${totalChars} characters, exceeding the evaluator's limit of ${this.evaluationConfig.maxTotalInputChars}. Evaluation was not attempted.`
      );
    }
  }

  /**
   * Student's own read of one submission's evaluation. Ownership is
   * re-checked here from the verified JWT subject, never from anything
   * client-supplied — same "not found vs. not yours" convention as
   * PackagesService.getOwnedPackage(): a submission that doesn't exist (or
   * isn't in the requested session) 404s; one that exists but belongs to a
   * different student 403s.
   */
  async getEvaluationForStudent(sessionId: string, submissionId: string, studentId: string) {
    const submission = await this.prisma.exerciseSubmission.findUnique({
      where: { id: submissionId },
      include: { evaluation: true },
    });
    if (!submission || submission.sessionId !== sessionId) {
      throw new NotFoundException('Submission not found.');
    }
    if (submission.studentId !== studentId) {
      throw new ForbiddenException('You do not own this submission.');
    }
    if (!submission.evaluation) {
      throw new NotFoundException('Evaluation not found for this submission.');
    }
    return submission.evaluation;
  }

  /**
   * Observability only (no Admin dashboard in this slice — see
   * EvaluationWorkerService, which logs this periodically). Counts by
   * status, always including every status even at zero, so a caller doesn't
   * need to special-case an absent key.
   */
  async getQueueStats(): Promise<QueueStats> {
    const rows = await this.prisma.exerciseEvaluation.groupBy({ by: ['status'], _count: { _all: true } });
    const stats = { PENDING: 0, EVALUATING: 0, EVALUATED: 0, FAILED: 0 } as QueueStats;
    for (const row of rows) stats[row.status] = row._count._all;
    return stats;
  }
}
