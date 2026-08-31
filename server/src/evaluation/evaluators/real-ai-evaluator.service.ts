import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PermanentEvaluationError, RetryableEvaluationError, type EvaluationInput, type EvaluationOutput, type ExerciseEvaluator } from '../evaluator.interface';
import { EvaluationConfig } from '../evaluation-config';
import { EVALUATOR_SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { parseRetryAfterMs } from './retry-after';

// ---------------------------------------------------------------------------
// AI Exercise Evaluation Slice 2.2 — an Anthropic-backed ExerciseEvaluator.
// NOT currently bound live (EvaluationModule binds HuggingFaceEvaluatorService
// instead, since no ANTHROPIC_API_KEY is available in this environment) —
// kept in the codebase, fully working, as a second concrete proof that
// EXERCISE_EVALUATOR really is swappable, and ready to bind again the moment
// a key is available (see evaluation.module.ts).
//
// SECURITY / SCOPE, enforced structurally by what this file does NOT do:
//   - Never executes, imports, or requires student-submitted code. It is
//     sent to the model as inert text for review, never run.
//   - The model, provider, and prompt are fixed here, in platform code —
//     nothing here reads a Content-Author-authored field to choose them.
//   - ANTHROPIC_API_KEY is read server-side only via ConfigService, the
//     same convention as JWT_ACCESS_SECRET (auth.module.ts) — never sent to
//     the frontend, never logged.
//   - The model's raw output is never trusted directly: it is returned to
//     EvaluationService, which pipes ALL evaluator output through the same
//     validateEvaluationOutput() (evaluation-data.ts) before persistence.
// ---------------------------------------------------------------------------

const MODEL = 'claude-opus-5';
const PROVIDER_NAME = 'claude-opus-5';
const MAX_TOKENS = 4096;

const AiEvaluationResultSchema = z.object({
  overallScore: z.number().min(0).max(100).describe('Overall score for the submission, 0-100.'),
  criteriaResults: z
    .array(
      z.object({
        criterion: z.string().describe('The exact evaluation criterion text this result is for.'),
        score: z.number().min(0).max(100),
        passed: z.boolean(),
        feedback: z.string().describe('One or two sentences explaining this specific result.'),
      })
    )
    .min(1),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  feedback: z.string().describe('A concise, overall summary of the evaluation, written to the student.'),
});

@Injectable()
export class RealAiEvaluatorService implements ExerciseEvaluator {
  private readonly logger = new Logger(RealAiEvaluatorService.name);
  private readonly client: Anthropic | null;

  constructor(
    config: ConfigService,
    private readonly evaluationConfig: EvaluationConfig
  ) {
    // Explicit key only — deliberately does NOT fall back to ambient
    // ANTHROPIC_AUTH_TOKEN / `ant auth login` profiles a developer's
    // machine might have. A deployed backend service's credential should
    // come from its own explicit configuration, not whoever happens to run
    // it. See evaluate()'s own guard for what happens when this is unset.
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY is not set — every evaluation will fail (status FAILED) until it is configured.');
    }
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    if (!this.client) {
      throw new PermanentEvaluationError('AI evaluator is not configured: ANTHROPIC_API_KEY is not set.');
    }

    const userContent = buildUserPrompt(input.exercise, input.files);

    let response;
    try {
      response = await this.client.beta.messages.parse(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: EVALUATOR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
          output_format: betaZodOutputFormat(AiEvaluationResultSchema),
        },
        { timeout: this.evaluationConfig.timeoutMs }
      );
    } catch (err) {
      // Most-specific-first — never string-match error messages. See
      // shared/error-codes.md in the claude-api skill for this chain order
      // (APIConnectionError must be checked before the generic APIError,
      // since it is a subclass of it in this SDK).
      if (err instanceof Anthropic.AuthenticationError) {
        throw new PermanentEvaluationError('AI evaluator authentication failed — check the configured ANTHROPIC_API_KEY.');
      }
      if (err instanceof Anthropic.RateLimitError) {
        const retryAfterMs = parseRetryAfterMs(err.headers?.get?.('retry-after') ?? null);
        throw new RetryableEvaluationError('AI evaluator is rate-limited.', retryAfterMs);
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new RetryableEvaluationError('AI evaluator could not be reached — network error.');
      }
      if (err instanceof Anthropic.APIError) {
        const status = err.status;
        if (status !== undefined && status >= 500) {
          throw new RetryableEvaluationError(`AI evaluator's provider returned a server error (status ${status}).`);
        }
        throw new PermanentEvaluationError(`AI evaluator request failed (status ${status ?? 'unknown'}).`);
      }
      throw err;
    }

    if (response.stop_reason === 'refusal') {
      this.logger.warn(`AI evaluator refused to grade a submission (stop_reason: refusal).`);
      // A content-policy refusal generally won't change on an identical
      // retry — treated as permanent, matching the reliability slice's
      // "never endlessly retry a request the provider actively declined."
      throw new PermanentEvaluationError('AI evaluator declined to evaluate this submission.');
    }

    if (!response.parsed_output) {
      throw new PermanentEvaluationError('AI evaluator returned output that did not match the expected schema.');
    }

    const parsed = response.parsed_output;
    return {
      overallScore: parsed.overallScore,
      criteriaResults: parsed.criteriaResults,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      feedback: parsed.feedback,
      providerName: PROVIDER_NAME,
    };
  }
}
