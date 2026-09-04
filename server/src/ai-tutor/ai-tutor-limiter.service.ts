import { Injectable, Logger } from '@nestjs/common';
import { AiTutorConfig } from './ai-tutor-config';

// ---------------------------------------------------------------------------
// AI Reliability/Security/Cost (Day 4) — AI Tutor rate limiting and
// concurrency control.
//
// Deliberately in-process, in-memory, no Redis/shared store: per Task 1's
// own inspection, this codebase has NO existing rate-limiting/throttling
// package (no @nestjs/throttler, no Redis, no Bull) and runs as a single
// backend process today (see EvaluationWorkerService's own doc comment —
// "deliberately NOT Redis/Kafka/BullMQ... a single polling loop living
// inside the same NestJS process"). A per-process Map/semaphore is the
// right-sized MVP tool for that architecture, matching the codebase's own
// established precedent rather than introducing new infrastructure Task 1
// says not to duplicate. Documented limitation: if this backend is ever
// horizontally scaled to multiple instances, these limits become
// PER-INSTANCE, not truly global/per-student-across-the-fleet — a student
// could get up to N-instances-times the intended rate/concurrency. Revisit
// with a shared store (Redis) if/when multiple instances are deployed; see
// this slice's own "Day 5 follow-up" note in the final report.
//
// Three independent controls, all enforced server-side, all keyed off the
// JWT-derived studentId (never anything client-supplied — the controller
// never passes anything else in):
//   1. Per-student rate limit — fixed window, resets every windowMs.
//   2. Per-student concurrency — at most maxStudentConcurrent in-flight
//      requests for that one student (blocks trivial multi-tab spam even
//      within the rate-limit window).
//   3. Global concurrency — a bounded semaphore across ALL students, with a
//      bounded wait queue (never unbounded pending requests) before giving
//      up and reporting capacity exhausted.
// ---------------------------------------------------------------------------

export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('AI Tutor rate limit exceeded.');
  }
}

export class StudentConcurrencyExceededError extends Error {
  constructor() {
    super('AI Tutor: this student already has a request in progress.');
  }
}

export class GlobalCapacityExceededError extends Error {
  constructor() {
    super('AI Tutor is at capacity.');
  }
}

type Waiter = { resolve: () => void };

@Injectable()
export class AiTutorLimiterService {
  private readonly logger = new Logger(AiTutorLimiterService.name);

  /** studentId -> request timestamps (ms) within the current window — trimmed lazily on each check, never grows unbounded per student (old entries are dropped, and a student with zero recent requests has no entry at all). */
  private readonly requestLog = new Map<string, number[]>();
  /** studentId -> count of this student's currently in-flight requests (0 or 1 under the current maxStudentConcurrent=1 default). */
  private readonly studentInFlight = new Map<string, number>();

  private globalActive = 0;
  private readonly globalWaitQueue: Waiter[] = [];

  constructor(private readonly config: AiTutorConfig) {}

  // --- Per-student rate limit (Task 2) --------------------------------------

  /** Throws RateLimitExceededError if this student has already made rateLimitMax requests within the current rateLimitWindowMs window. Records this request's timestamp only when allowed. */
  checkAndRecordRateLimit(studentId: string): void {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindowMs;
    const timestamps = (this.requestLog.get(studentId) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.config.rateLimitMax) {
      const oldestInWindow = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + this.config.rateLimitWindowMs - now) / 1000));
      throw new RateLimitExceededError(retryAfterSeconds);
    }

    timestamps.push(now);
    this.requestLog.set(studentId, timestamps);
  }

  // --- Per-student concurrency (Task 3) -------------------------------------

  acquireStudentSlot(studentId: string): void {
    const current = this.studentInFlight.get(studentId) ?? 0;
    if (current >= this.config.maxStudentConcurrent) {
      throw new StudentConcurrencyExceededError();
    }
    this.studentInFlight.set(studentId, current + 1);
  }

  releaseStudentSlot(studentId: string): void {
    const current = this.studentInFlight.get(studentId) ?? 0;
    if (current <= 1) this.studentInFlight.delete(studentId);
    else this.studentInFlight.set(studentId, current - 1);
  }

  // --- Global concurrency (Task 4) ------------------------------------------

  /**
   * Resolves once a global slot is acquired, or throws GlobalCapacityExceededError
   * immediately if the bounded wait queue is already full — this request
   * never joins an unbounded queue. A request that does queue waits at most
   * config.globalQueueWaitMs before giving up (rejecting rather than piling
   * up indefinitely behind a slow provider).
   */
  async acquireGlobalSlot(): Promise<void> {
    if (this.globalActive < this.config.maxGlobalConcurrent) {
      this.globalActive++;
      return;
    }
    if (this.globalWaitQueue.length >= this.config.globalQueueMax) {
      throw new GlobalCapacityExceededError();
    }

    let waiter: Waiter;
    const acquired = new Promise<void>((resolve) => {
      waiter = { resolve };
    });
    this.globalWaitQueue.push(waiter!);

    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), this.config.globalQueueWaitMs));
    const outcome = await Promise.race([acquired.then(() => 'acquired' as const), timeout]);

    if (outcome === 'timeout') {
      const idx = this.globalWaitQueue.indexOf(waiter!);
      // Already granted by a concurrent releaseGlobalSlot() between the
      // timer firing and this line running — honor that grant rather than
      // reject a request that actually got a slot.
      if (idx === -1) return;
      this.globalWaitQueue.splice(idx, 1);
      throw new GlobalCapacityExceededError();
    }
    // Woken by releaseGlobalSlot() below — the slot moved directly from the
    // releasing caller to this waiter, so globalActive is unchanged (one
    // released, one acquired in the same step, never dipping to "empty" and
    // never double-counted).
  }

  releaseGlobalSlot(): void {
    const next = this.globalWaitQueue.shift();
    if (next) {
      next.resolve();
    } else {
      this.globalActive--;
    }
  }

  /** Observability only (Day 4 Task 15) — never used for control flow. */
  getStats() {
    return {
      globalActive: this.globalActive,
      globalQueued: this.globalWaitQueue.length,
      distinctStudentsTracked: this.requestLog.size,
    };
  }
}
