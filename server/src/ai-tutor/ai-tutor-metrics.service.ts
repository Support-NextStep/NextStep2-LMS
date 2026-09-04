import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// AI Reliability/Security/Cost (Day 4) Task 15 — minimum useful AI Tutor
// operational visibility. Deliberately NOT a metrics/analytics platform
// (Prometheus, Datadog, etc. — none of that infrastructure exists in this
// codebase per Task 1's inspection): a small in-process counter object,
// safe to log periodically or expose to an internal caller, holding only
// aggregate numbers — no student ids, no message content, no answers.
// Resets on process restart, same as EvaluationWorkerService's own
// in-memory activeCount/tickCount — acceptable for MVP-scale observability,
// not a durable metrics store.
// ---------------------------------------------------------------------------

export type AiTutorMetricsSnapshot = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  rateLimitedCount: number;
  concurrencyRejectedCount: number;
  timeoutCount: number;
  providerErrorCount: number;
  /** Milliseconds, successful requests only — a timed-out/failed call has no meaningful "how long did the answer take." */
  observedLatenciesMs: number[];
};

@Injectable()
export class AiTutorMetricsService {
  private requestCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private rateLimitedCount = 0;
  private concurrencyRejectedCount = 0;
  private timeoutCount = 0;
  private providerErrorCount = 0;
  /** Bounded ring buffer — never grows unbounded under sustained traffic. Large enough to compute a meaningful recent average without needing every request ever made. */
  private readonly latencies: number[] = [];
  private static readonly MAX_LATENCY_SAMPLES = 200;

  recordRequest(): void {
    this.requestCount++;
  }

  recordSuccess(latencyMs: number): void {
    this.successCount++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > AiTutorMetricsService.MAX_LATENCY_SAMPLES) this.latencies.shift();
  }

  recordFailure(kind: 'timeout' | 'provider_error' | 'other'): void {
    this.failureCount++;
    if (kind === 'timeout') this.timeoutCount++;
    else if (kind === 'provider_error') this.providerErrorCount++;
  }

  recordRateLimited(): void {
    this.rateLimitedCount++;
  }

  recordConcurrencyRejected(): void {
    this.concurrencyRejectedCount++;
  }

  getSnapshot(): AiTutorMetricsSnapshot {
    return {
      requestCount: this.requestCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      rateLimitedCount: this.rateLimitedCount,
      concurrencyRejectedCount: this.concurrencyRejectedCount,
      timeoutCount: this.timeoutCount,
      providerErrorCount: this.providerErrorCount,
      observedLatenciesMs: [...this.latencies],
    };
  }

  getAverageLatencyMs(): number | null {
    if (this.latencies.length === 0) return null;
    return Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length);
  }
}
