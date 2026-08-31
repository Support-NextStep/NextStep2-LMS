import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// AI Evaluation Reliability slice — every tunable in one place, read once
// via ConfigService (same convention as JWT_ACCESS_SECRET/HF_TOKEN
// elsewhere), never a magic number scattered across the worker/evaluators.
// All defaults are deliberately conservative for a ~100-student target on a
// single process talking to a third-party-routed open model — see each
// field's own comment for the reasoning, and the reliability slice's report
// for what was actually measured vs. just chosen defensively.
// ---------------------------------------------------------------------------

function num(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** How much longer staleMs must be than timeoutMs before we consider it safe. A genuinely in-flight (not crashed) attempt can legitimately take up to ~timeoutMs to fail, plus real DB/network overhead around it — staleMs must clear that with real margin, or claimNext() can reclaim (and hand to a second concurrent worker) a row whose original attempt is still honestly running. See EvaluationConfig's own constructor warning and the reliability slice's load-test report for the concrete failure this constant exists to catch. */
const MIN_STALE_TO_TIMEOUT_RATIO = 1.5;

@Injectable()
export class EvaluationConfig {
  private readonly logger = new Logger(EvaluationConfig.name);

  /** Max evaluations in flight at once, across the whole process. Conservative default: Inference Providers routes to a third-party's own rate limits, which we don't control and haven't load-tested against the real provider (see the load-test report — only the mock evaluator was used for concurrency testing). Raise once real-provider throughput is actually measured. */
  readonly concurrency: number;
  /** How often the worker checks for new/due work when it isn't already at full concurrency. Short enough to feel responsive, long enough to not hammer Postgres with empty polls. */
  readonly pollIntervalMs: number;
  /** Hard ceiling on one provider call. Matches the value already proven live in Slice 2.2's HuggingFace evaluator; now configurable instead of a hardcoded constant. */
  readonly timeoutMs: number;
  /** Bounded retry count for transient failures (network/timeout/429/5xx) — never applied to permanent failures (bad config, invalid JSON, schema validation). */
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  /** An EVALUATING row older than this is assumed abandoned (worker crashed mid-attempt) and becomes eligible for reclaim by the same claim query used for PENDING work. Comfortably larger than timeoutMs + normal DB/network overhead so a merely-slow-but-alive attempt is never falsely reclaimed. */
  readonly staleMs: number;
  /** Defense-in-depth file-count cap enforced again at evaluation time, independent of CreateSubmissionDto's own @ArrayMaxSize — protects the LLM call specifically, not just the write path. */
  readonly maxFiles: number;
  /** Combined character count across all submitted files' content, enforced right before building the prompt. A submission can pass DTO validation (per-file up to 200k chars, up to 50 files) yet still be far too large to respond to safely/affordably — this catches that case rather than silently truncating code in a way that could produce misleading grading. */
  readonly maxTotalInputChars: number;

  constructor(config: ConfigService) {
    this.concurrency = num(config, 'EVALUATION_CONCURRENCY', 5);
    this.pollIntervalMs = num(config, 'EVALUATION_POLL_INTERVAL_MS', 2_000);
    this.timeoutMs = num(config, 'AI_EVALUATION_TIMEOUT_MS', 45_000);
    this.maxRetries = num(config, 'AI_EVALUATION_MAX_RETRIES', 3);
    this.retryBaseDelayMs = num(config, 'AI_EVALUATION_RETRY_BASE_DELAY_MS', 2_000);
    this.retryMaxDelayMs = num(config, 'AI_EVALUATION_RETRY_MAX_DELAY_MS', 30_000);
    this.staleMs = num(config, 'AI_EVALUATION_STALE_MS', 120_000);
    this.maxFiles = num(config, 'AI_EVALUATION_MAX_FILES', 50);
    this.maxTotalInputChars = num(config, 'AI_EVALUATION_MAX_TOTAL_INPUT_CHARS', 50_000);

    if (this.staleMs < this.timeoutMs * MIN_STALE_TO_TIMEOUT_RATIO) {
      this.logger.warn(
        `AI_EVALUATION_STALE_MS (${this.staleMs}ms) is not comfortably larger than AI_EVALUATION_TIMEOUT_MS (${this.timeoutMs}ms) — ` +
          `a genuinely in-flight (not crashed) evaluation can be reclaimed and processed twice concurrently. ` +
          `Recommended: staleMs >= ${Math.ceil(this.timeoutMs * MIN_STALE_TO_TIMEOUT_RATIO)}ms.`
      );
    }
  }

  /** Exponential backoff with a small jitter, capped at retryMaxDelayMs — used only when the provider didn't give us a more authoritative Retry-After. */
  backoffDelayMs(retryCount: number): number {
    const exp = this.retryBaseDelayMs * Math.pow(2, Math.max(0, retryCount - 1));
    const jitter = exp * 0.2 * Math.random();
    return Math.min(this.retryMaxDelayMs, Math.round(exp + jitter));
  }
}
