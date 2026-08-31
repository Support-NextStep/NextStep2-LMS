import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermanentEvaluationError, RetryableEvaluationError, type EvaluationInput, type EvaluationOutput, type ExerciseEvaluator } from '../evaluator.interface';
import { EvaluationConfig } from '../evaluation-config';
import { EVALUATOR_SYSTEM_PROMPT, JSON_ONLY_INSTRUCTION, buildUserPrompt } from './prompt';
import { parseRetryAfterMs } from './retry-after';

// ---------------------------------------------------------------------------
// AI Exercise Evaluation Slice 2.2 — Hugging Face Inference Providers-backed
// ExerciseEvaluator. Bound live in EvaluationModule (see EXERCISE_EVALUATOR)
// as a development/testing-phase stand-in for RealAiEvaluatorService
// (Anthropic), which stays in the codebase, unbound, until an Anthropic key
// is available — swapping back is a one-line change in evaluation.module.ts,
// nothing here or in EvaluationService needs to change either way.
//
// Calls the HF-hosted OpenAI-compatible chat-completions router directly via
// fetch — no HF SDK dependency added; the router is documented as a
// "drop-in OpenAI replacement" and this file needs nothing beyond a single
// POST (see https://huggingface.co/docs/inference-providers). HF_MODEL
// selects both the model AND (optionally, via a ":provider" or ":fastest"/
// ":cheapest" suffix baked into the same string) which underlying Inference
// Provider serves it — see HF's own docs for that suffix syntax. This is
// Inference PROVIDERS (a routed, serverless call to someone else's hosted
// model) — never a dedicated HF Inference Endpoint, and no model
// infrastructure is deployed or managed by this codebase.
//
// SECURITY / SCOPE, enforced structurally by what this file does NOT do:
//   - Never executes, imports, or requires student-submitted code.
//   - The model/provider/prompt are fixed by platform configuration
//     (HF_MODEL, an env var), never by anything a Content Author authors.
//   - HF_TOKEN and HF_MODEL are read server-side only via ConfigService —
//     never sent to the frontend, never logged, never hardcoded here.
//   - Open models are far less reliable at strict structured output than a
//     first-party provider's native schema-constrained mode — this file
//     does NOT trust its own JSON parsing to be the last line of defense.
//     Whatever it returns (even if imperfectly shaped) is still piped
//     through EvaluationService's validateEvaluationOutput() before
//     anything is persisted, exactly like every other evaluator.
// ---------------------------------------------------------------------------

const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const MAX_TOKENS = 2048;

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    overallScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Overall score on a 0-100 integer scale (100 = fully meets the specification). Never 0-1 or 0-10.',
    },
    criteriaResults: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          score: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Score for this one criterion, 0-100 integer scale. Never 0-1 or 0-10.',
          },
          passed: { type: 'boolean' },
          feedback: { type: 'string' },
        },
        required: ['criterion', 'score', 'passed', 'feedback'],
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'string' },
  },
  required: ['overallScore', 'criteriaResults', 'strengths', 'improvements', 'feedback'],
} as const;

type HfChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
};

/**
 * Not every provider behind the router honors `response_format` perfectly
 * on every open model — the JSON-only system-prompt instruction is a second
 * line of defense, and this is the third: strip a markdown code fence if
 * the model wrapped its JSON in one, then fall back to the first
 * `{`...last `}` substring, before giving up. Never throws itself — returns
 * `null` on failure, which the caller turns into a clear evaluation error.
 */
function extractJson(rawText: string): unknown {
  const attempts = [rawText.trim()];

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());

  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) attempts.push(rawText.slice(firstBrace, lastBrace + 1).trim());

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next fallback
    }
  }
  return null;
}

@Injectable()
export class HuggingFaceEvaluatorService implements ExerciseEvaluator {
  private readonly logger = new Logger(HuggingFaceEvaluatorService.name);
  private readonly token: string | undefined;
  private readonly model: string | undefined;

  constructor(
    config: ConfigService,
    private readonly evaluationConfig: EvaluationConfig
  ) {
    this.token = config.get<string>('HF_TOKEN');
    this.model = config.get<string>('HF_MODEL');
    if (!this.token || !this.model) {
      this.logger.warn('HF_TOKEN and/or HF_MODEL is not set — every evaluation will fail (status FAILED) until both are configured.');
    }
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    if (!this.token || !this.model) {
      throw new PermanentEvaluationError('AI evaluator is not configured: HF_TOKEN and/or HF_MODEL is not set.');
    }

    const userContent = buildUserPrompt(input.exercise, input.files);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.evaluationConfig.timeoutMs);

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
          max_tokens: MAX_TOKENS,
          temperature: 0.2, // grading benefits from consistency over creativity
          messages: [
            { role: 'system', content: `${EVALUATOR_SYSTEM_PROMPT}\n\n${JSON_ONLY_INSTRUCTION}` },
            { role: 'user', content: userContent },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'exercise_evaluation', schema: RESPONSE_JSON_SCHEMA, strict: true },
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new RetryableEvaluationError('AI evaluator timed out.');
      }
      throw new RetryableEvaluationError(`AI evaluator could not be reached: ${err instanceof Error ? err.message : 'network error'}.`);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new PermanentEvaluationError('AI evaluator authentication failed — check the configured HF_TOKEN.');
      }
      if (res.status === 429) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        throw new RetryableEvaluationError('AI evaluator is rate-limited.', retryAfterMs);
      }
      if (res.status >= 500) {
        throw new RetryableEvaluationError(`AI evaluator's provider returned a server error (status ${res.status}).`);
      }
      // Other 4xx (400 bad request, etc.) — the request itself was rejected;
      // retrying the exact same payload will not produce a different result.
      throw new PermanentEvaluationError(`AI evaluator request failed (status ${res.status}).`);
    }

    const body = (await res.json()) as HfChatCompletionResponse;
    const rawText = body.choices?.[0]?.message?.content;
    if (!rawText) {
      throw new PermanentEvaluationError('AI evaluator returned an empty response.');
    }

    const parsed = extractJson(rawText);
    if (!parsed) {
      // Explicitly permanent per the reliability slice's requirement: never
      // endlessly retry invalid AI JSON — a malformed response is treated
      // as a modeling/prompt problem, not a transient one.
      throw new PermanentEvaluationError('AI evaluator returned output that was not valid JSON.');
    }

    // Not independently validated/clamped here — every evaluator's raw
    // output (this one included) is piped through EvaluationService's
    // validateEvaluationOutput() before persistence, which is exactly where
    // an imperfectly-shaped open-model response gets caught. providerName
    // is set here, never taken from the model's own output.
    return {
      ...(parsed as object),
      providerName: `huggingface:${this.model}`,
    } as EvaluationOutput;
  }
}
