import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// AI Need Help / AI Tutor (Day 3) — every tunable in one place, same
// "read once via ConfigService, never a magic number scattered around"
// convention as EvaluationConfig. Deliberately its own small config rather
// than reusing EvaluationConfig: this is a live, student-is-waiting request/
// response call (no queue, no retries, no background worker), not a
// background job — the two features share the HF router endpoint pattern
// but nothing about their tuning (message size vs. code-file size, response
// tokens vs. evaluation-JSON tokens, timeout budget for an interactive chat
// vs. a queued batch job) should be coupled. Changing one can never change
// the other.
// ---------------------------------------------------------------------------

function num(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

@Injectable()
export class AiTutorConfig {
  /** Hard ceiling on one provider call. Shorter than evaluation's 45s default — this is a synchronous request a student is actively waiting on in the UI, not a background job with retries to fall back on. */
  readonly timeoutMs: number;
  /** Max characters accepted in the student's own message (DTO-enforced too — this is the defense-in-depth copy, same convention as EvaluationConfig.maxTotalInputChars vs CreateSubmissionDto's per-file limit). */
  readonly maxMessageChars: number;
  /** Upper bound on the model's own output for one answer — an LMS tutor reply, not an essay. */
  readonly maxResponseTokens: number;

  // --- AI Reliability/Security/Cost (Day 4) — rate limiting & concurrency ---
  /** Per-student fixed-window rate limit: at most this many /ask requests per rateLimitWindowMs. 10/minute is a deliberate, not-arbitrary choice: Day 3's real-provider tests observed 2-13s per real answer, so a legitimate student asking one question at a time cannot plausibly need more than ~10/minute even at their fastest realistic reading/typing pace, while still comfortably blocking a scripted-spam pattern (see this slice's own report for the reasoning — there is no provider-published per-second limit to size this against instead, since HF Inference Providers' router does not publish one; this is sized off this app's own observed usage pattern). */
  readonly rateLimitMax: number;
  readonly rateLimitWindowMs: number;
  /** At most this many of THIS student's own requests may be in flight at once. 1 matches the existing UI (one chat widget, one question at a time) and blocks trivial multi-tab/multi-request abuse from a single student without touching the UI. */
  readonly maxStudentConcurrent: number;
  /** At most this many AI Tutor requests (across ALL students) may be calling the provider at once. Deliberately the same conservative value as EvaluationConfig.concurrency's own default (5) — both features share the same underlying HF account/rate limits, and Day 2's own report already documents that real-provider throughput beyond 5 concurrent calls has not been load-tested; this mirrors that same, still-untested-beyond-5 caution rather than picking an independent, equally-unverified number. */
  readonly maxGlobalConcurrent: number;
  /** Bounded wait queue for requests arriving while all global slots are busy — never unbounded. A request that can't even get a queue slot is rejected immediately (503) rather than piling up. */
  readonly globalQueueMax: number;
  /** How long a queued request waits for a global slot before giving up (503) rather than waiting indefinitely behind a slow/stuck provider call. */
  readonly globalQueueWaitMs: number;

  constructor(config: ConfigService) {
    this.timeoutMs = num(config, 'AI_TUTOR_TIMEOUT_MS', 30_000);
    this.maxMessageChars = num(config, 'AI_TUTOR_MAX_MESSAGE_CHARS', 2_000);
    this.maxResponseTokens = num(config, 'AI_TUTOR_MAX_RESPONSE_TOKENS', 700);
    this.rateLimitMax = num(config, 'AI_TUTOR_RATE_LIMIT_MAX', 10);
    this.rateLimitWindowMs = num(config, 'AI_TUTOR_RATE_LIMIT_WINDOW_MS', 60_000);
    this.maxStudentConcurrent = num(config, 'AI_TUTOR_MAX_STUDENT_CONCURRENT', 1);
    this.maxGlobalConcurrent = num(config, 'AI_TUTOR_MAX_GLOBAL_CONCURRENT', 5);
    this.globalQueueMax = num(config, 'AI_TUTOR_GLOBAL_QUEUE_MAX', 20);
    this.globalQueueWaitMs = num(config, 'AI_TUTOR_GLOBAL_QUEUE_WAIT_MS', 20_000);
  }
}
