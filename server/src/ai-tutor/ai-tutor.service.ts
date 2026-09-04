import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentService } from '../content/content.service';
import { parseRetryAfterMs } from '../evaluation/evaluators/retry-after';
import { AiTutorConfig } from './ai-tutor-config';
import { buildTutorLessonContext } from './ai-tutor-context';
import { AiTutorLimiterService, GlobalCapacityExceededError, RateLimitExceededError, StudentConcurrencyExceededError } from './ai-tutor-limiter.service';
import { AiTutorMetricsService } from './ai-tutor-metrics.service';
import { TUTOR_SYSTEM_PROMPT, buildTutorUserPrompt } from './prompt';

// ---------------------------------------------------------------------------
// AI Need Help / AI Tutor (Day 3, hardened Day 4) — calls the same Hugging
// Face Inference Providers router as HuggingFaceEvaluatorService (Day 2),
// directly via fetch, but is otherwise a fully separate service: no shared
// class, no shared config, no queue. This is a live request/response call
// the student is waiting on in the UI — a provider failure here is
// surfaced immediately as a safe error to that one request, never retried
// internally (Day 4 Task 6: "do not blindly retry... protect the provider
// from retry storms") and never given a fake/canned answer.
//
// Day 4 adds: per-student rate limiting, per-student and global concurrency
// bounds (AiTutorLimiterService), and safe aggregate usage metrics
// (AiTutorMetricsService) — see those files' own doc comments for the
// reasoning behind each configured limit.
//
// SECURITY / SCOPE, enforced structurally by what this file does NOT do:
//   - Never accepts a student-supplied studentId, model, or provider choice
//     (see AiTutorController — studentId comes from the JWT; model/provider
//     are fixed by this file's own configuration).
//   - The system prompt is fixed platform configuration (prompt.ts), never
//     something a student, Content Author, or request body can influence.
//   - HF_TOKEN and HF_MODEL are read server-side only via ConfigService —
//     never sent to the frontend, never logged, never hardcoded here.
//   - Provider error bodies/stack traces are never forwarded to the caller —
//     every failure path below throws a generic Nest exception with a safe,
//     student-appropriate message.
//   - Logging (see the catch/warn calls below) never includes the student's
//     message/the AI's answer/the HF_TOKEN — only session id, status/error
//     kind, and (on success, via AiTutorMetricsService) latency. Day 4
//     Task 10's own logging-safety requirement.
// ---------------------------------------------------------------------------

const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

type HfChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
  // Hugging Face's OpenAI-compatible router does include a `usage` object
  // (prompt_tokens/completion_tokens/total_tokens) on a successful response
  // for models that report it — recorded as safe aggregate metadata only
  // (see recordSuccess below); NOT a dollar cost. See this slice's own
  // report, Task 8: exact provider *cost* is NOT VERIFIED — HF's router
  // does not return a price, only token counts, and no cost-per-token table
  // for the configured model is available in this codebase to convert one
  // into the other without inventing a number.
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

@Injectable()
export class AiTutorService {
  private readonly logger = new Logger(AiTutorService.name);
  private readonly token: string | undefined;
  private readonly model: string | undefined;

  constructor(
    config: ConfigService,
    private readonly tutorConfig: AiTutorConfig,
    private readonly contentService: ContentService,
    private readonly limiter: AiTutorLimiterService,
    private readonly metrics: AiTutorMetricsService
  ) {
    this.token = config.get<string>('HF_TOKEN');
    this.model = config.get<string>('HF_MODEL');
    if (!this.token || !this.model) {
      this.logger.warn('HF_TOKEN and/or HF_MODEL is not set — every AI Tutor request will fail until both are configured.');
    }
  }

  /**
   * sessionId comes from the route, studentId from the authenticated JWT
   * (AiTutorController — never client-supplied), studentMessage from the
   * validated DTO. Rate limit and per-student concurrency are checked (and,
   * on success, released in `finally`) BEFORE anything touches the network —
   * a student who is over their limit never even reaches the provider or
   * the global semaphore. Ownership/authentication is already enforced one
   * layer up by JwtAuthGuard + Roles(STUDENT); this method's only
   * "authorization" concern is content, not identity — a session with
   * nothing currently published must behave exactly like it doesn't exist,
   * for a student the same as for anyone else.
   */
  async ask(sessionId: string, studentId: string, studentMessage: string): Promise<{ answer: string }> {
    this.metrics.recordRequest();

    try {
      this.limiter.checkAndRecordRateLimit(studentId);
    } catch (err) {
      if (err instanceof RateLimitExceededError) {
        this.metrics.recordRateLimited();
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many AI Tutor requests. Please wait a moment before asking again.',
            retryAfterSeconds: err.retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw err;
    }

    try {
      this.limiter.acquireStudentSlot(studentId);
    } catch (err) {
      if (err instanceof StudentConcurrencyExceededError) {
        this.metrics.recordConcurrencyRejected();
        throw new HttpException('You already have an AI Tutor request in progress. Please wait for it to finish.', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw err;
    }

    try {
      return await this.askInternal(sessionId, studentMessage);
    } finally {
      this.limiter.releaseStudentSlot(studentId);
    }
  }

  private async askInternal(sessionId: string, studentMessage: string): Promise<{ answer: string }> {
    const content = await this.contentService.getPublishedContentForSession(sessionId);
    if (!content) {
      throw new NotFoundException('No published content for this session.');
    }
    const session = await this.contentService.getSessionWithBreadcrumb(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found.');
    }

    if (!this.token || !this.model) {
      throw new InternalServerErrorException('AI Tutor is not available right now. Please try again later.');
    }

    try {
      await this.limiter.acquireGlobalSlot();
    } catch (err) {
      if (err instanceof GlobalCapacityExceededError) {
        this.metrics.recordConcurrencyRejected();
        throw new ServiceUnavailableException('AI Tutor is at capacity right now. Please try again in a moment.');
      }
      throw err;
    }

    const startedAt = Date.now();
    try {
      const lessonContext = buildTutorLessonContext(content, session);
      const userContent = buildTutorUserPrompt(lessonContext, studentMessage);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.tutorConfig.timeoutMs);

      let res: Response;
      try {
        res = await fetch(HF_ROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: this.tutorConfig.maxResponseTokens,
            temperature: 0.4, // a tutor benefits from slightly more natural phrasing than the grader's 0.2
            messages: [
              { role: 'system', content: TUTOR_SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          this.logger.warn(`AI Tutor request timed out for session=${sessionId}`);
          this.metrics.recordFailure('timeout');
          throw new GatewayTimeoutException("The AI Tutor didn't respond in time. Please try again.");
        }
        this.logger.warn(`AI Tutor could not reach the provider for session=${sessionId}: ${err instanceof Error ? err.message : 'network error'}`);
        this.metrics.recordFailure('provider_error');
        throw new BadGatewayException('AI Tutor is temporarily unavailable. Please try again.');
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        // 429 gets its own path: never retried internally (Task 6 — "do not
        // blindly retry a failed request... protect the provider from retry
        // storms"), and the provider's own Retry-After (if given) is passed
        // through to the student so their client can back off sensibly,
        // without exposing any other provider detail.
        if (res.status === 429) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
          this.logger.warn(`AI Tutor provider rate-limited this request for session=${sessionId}`);
          this.metrics.recordFailure('provider_error');
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: 'The AI Tutor is busy right now. Please try again shortly.',
              ...(retryAfterMs !== undefined ? { retryAfterSeconds: Math.ceil(retryAfterMs / 1000) } : {}),
            },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
        // Never forward the provider's own status text/body to the student —
        // logged server-side only, and never with the token (it's not in
        // this response at all — HF_TOKEN is a request header, never
        // echoed back).
        this.logger.warn(`AI Tutor provider returned status ${res.status} for session=${sessionId}`);
        this.metrics.recordFailure('provider_error');
        throw new BadGatewayException('AI Tutor is temporarily unavailable. Please try again.');
      }

      const body = (await res.json()) as HfChatCompletionResponse;
      const answer = body.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        this.logger.warn(`AI Tutor provider returned an empty response for session=${sessionId}`);
        this.metrics.recordFailure('provider_error');
        throw new BadGatewayException('AI Tutor is temporarily unavailable. Please try again.');
      }

      const latencyMs = Date.now() - startedAt;
      this.metrics.recordSuccess(latencyMs);
      // Safe aggregate metadata only — token counts, never the prompt/answer
      // text itself (Task 8/10: never log full prompts/responses; token
      // counts are the closest thing to "usage" HF's router exposes, and
      // are NOT a dollar cost — see HfChatCompletionResponse's own comment).
      if (body.usage) {
        this.logger.log(
          `AI Tutor request succeeded session=${sessionId} latencyMs=${latencyMs} promptTokens=${body.usage.prompt_tokens ?? 'n/a'} completionTokens=${body.usage.completion_tokens ?? 'n/a'}`
        );
      } else {
        this.logger.log(`AI Tutor request succeeded session=${sessionId} latencyMs=${latencyMs}`);
      }

      return { answer };
    } finally {
      this.limiter.releaseGlobalSlot();
    }
  }
}
