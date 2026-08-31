import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EvaluationConfig } from './evaluation-config';
import { EvaluationService, type ClaimedEvaluation } from './evaluation.service';

// ---------------------------------------------------------------------------
// AI Evaluation Reliability slice — the in-process background worker.
//
// Deliberately NOT a separate process/deployment, NOT Redis/Kafka/BullMQ:
// per the slice's own scope ("smallest reliable architecture... no
// microservices/Kubernetes/Kafka/distributed infrastructure"), this is a
// single polling loop living inside the same NestJS process, claiming work
// from the ExerciseEvaluation table itself (see EvaluationService.claimNext,
// a single atomic `UPDATE ... FOR UPDATE SKIP LOCKED` statement). That one
// SQL statement is what makes every reliability property below true even
// though there is no separate broker:
//   - persists work safely: the row itself, in Postgres, is the queue entry
//   - survives backend restart: state lives in the DB, not in memory —
//     PENDING rows and reclaimed stale EVALUATING rows are picked up again
//     the moment this service starts polling
//   - prevents duplicate processing: SKIP LOCKED means two claim attempts
//     (two ticks of this loop, or, if ever horizontally scaled, two
//     processes) can never claim the same row
//   - controlled concurrency: `activeCount` never exceeds
//     EvaluationConfig.concurrency; `polling` prevents two ticks from racing
//     the same claim decision
// ---------------------------------------------------------------------------

@Injectable()
export class EvaluationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvaluationWorkerService.name);
  private activeCount = 0;
  private polling = false;
  private stopped = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private tickCount = 0;

  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly config: EvaluationConfig
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    this.scheduleNextPoll(0); // pick up any PENDING/stale work left over from before a restart immediately, not after one poll interval
  }

  /**
   * Stops scheduling new polls. Does NOT wait for in-flight evaluations to
   * drain — an abrupt shutdown mid-evaluation is exactly the "worker
   * crashes while EVALUATING" case the stale-lease reclaim in claimNext()
   * is built to recover from on the next start, so there is nothing unsafe
   * about not blocking shutdown on it.
   */
  onModuleDestroy(): void {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  /** Exposed for tests: current in-flight count, never above config.concurrency. */
  getActiveCount(): number {
    return this.activeCount;
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => {
      this.pollTick().catch((err) => {
        this.logger.error(`poll tick failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, delayMs);
  }

  /**
   * `polling` serializes the read-availableSlots -> claim -> increment
   * sequence across every tick (the scheduled interval AND the extra ticks
   * runOne() triggers when a slot frees up) — without it, two ticks could
   * both read a stale `activeCount` across the `await claimNext(...)` and
   * transiently overshoot the configured concurrency. With it, concurrency
   * is a hard ceiling, never just an approximate target.
   */
  private async pollTick(): Promise<void> {
    if (this.stopped || this.polling) return;
    this.polling = true;
    try {
      const availableSlots = this.config.concurrency - this.activeCount;
      if (availableSlots > 0) {
        const claimed = await this.evaluationService.claimNext(availableSlots);
        for (const item of claimed) {
          this.activeCount++;
          void this.runOne(item);
        }
        this.tickCount++;
        // Log queue depth whenever there was something to claim, and
        // periodically even when idle, so a genuinely stuck queue (e.g.
        // every evaluation permanently FAILING) is visible in logs without
        // needing a dashboard.
        if (claimed.length > 0 || this.tickCount % 15 === 0) {
          this.logQueueStats();
        }
      }
    } finally {
      this.polling = false;
      this.scheduleNextPoll(this.config.pollIntervalMs);
    }
  }

  private async runOne(item: ClaimedEvaluation): Promise<void> {
    try {
      await this.evaluationService.processClaimed(item.id, item.submissionId);
    } catch (err) {
      // EvaluationService.processClaimed() already catches evaluator/
      // validation errors internally and persists FAILED — this only
      // guards against something unexpected in the plumbing itself (e.g. a
      // transient DB error updating the row), which must never crash the
      // worker loop or leave activeCount permanently inflated.
      this.logger.error(`unexpected error processing evaluation=${item.id} submission=${item.submissionId}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.activeCount--;
      // Reuse the freed slot immediately under sustained load, rather than
      // waiting up to pollIntervalMs for the next scheduled tick.
      void this.pollTick();
    }
  }

  private logQueueStats(): void {
    this.evaluationService
      .getQueueStats()
      .then((stats) => {
        this.logger.log(
          `queue stats: pending=${stats.PENDING} evaluating=${stats.EVALUATING} evaluated=${stats.EVALUATED} failed=${stats.FAILED} activeWorkers=${this.activeCount}/${this.config.concurrency}`
        );
      })
      .catch(() => {
        // Stats are observability-only — never let a stats query failure affect the worker loop.
      });
  }
}
