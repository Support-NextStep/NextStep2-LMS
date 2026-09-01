import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetryableEvaluationError, type EvaluationInput, type EvaluationOutput, type ExerciseEvaluator } from '../evaluator.interface';

// ---------------------------------------------------------------------------
// Slice 8 — Production Load, Concurrency & Scalability Validation.
//
// A temporary, load-test-only evaluator — same purpose and precedent as the
// AI Evaluation Reliability slice's own LoadTestMockEvaluatorService (see
// evaluation.module.ts's doc comment: "bound here only for the reliability
// slice's controlled 10/25/50/100-submission load test... removed along
// with that temporary binding" — this file and its binding follow the exact
// same pattern, and are removed the same way once this slice's load tests
// are done).
//
// Never calls a real network endpoint — Hugging Face is deliberately kept
// off the load-test path (see this slice's safety rule). Unlike
// FakeEvaluatorService (Slice 2.1), which resolves near-instantly and so
// can't exercise queue-depth/backlog/concurrency-ceiling behavior, this
// simulates a REALISTIC provider latency via a plain setTimeout, so
// EvaluationWorkerService's concurrency cap, polling, and retry logic are
// actually exercised the way they would be against the real Hugging Face
// call. Latency and simulated transient-failure rate are both
// controlled/configurable (never hidden magic numbers) and default to
// conservative, clearly-labeled values — see each env var below.
// ---------------------------------------------------------------------------

@Injectable()
export class LoadTestMockEvaluatorService implements ExerciseEvaluator {
  private readonly logger = new Logger(LoadTestMockEvaluatorService.name);
  private readonly latencyMs: number;
  private readonly jitterMs: number;
  private readonly transientFailureRate: number;

  constructor(config: ConfigService) {
    // Roughly matches observed real Hugging Face Qwen2.5-Coder-32B latency
    // for a single evaluation (see huggingface-evaluator.service.ts) —
    // realistic enough to make queue-depth/drain-time numbers meaningful,
    // without ever making a real network call.
    this.latencyMs = Number(config.get<string>('LOAD_TEST_EVAL_LATENCY_MS', '3000'));
    this.jitterMs = Number(config.get<string>('LOAD_TEST_EVAL_JITTER_MS', '1500'));
    // A small, deliberate rate of simulated RetryableEvaluationError — lets
    // Test 10/18's retry-recovery behavior be exercised under load without
    // waiting for a real transient failure to happen to occur.
    this.transientFailureRate = Number(config.get<string>('LOAD_TEST_EVAL_FAILURE_RATE', '0.03'));
    this.logger.warn(
      `LoadTestMockEvaluatorService is ACTIVE — no real evaluation is happening. ` +
        `latency=${this.latencyMs}±${this.jitterMs}ms simulatedFailureRate=${this.transientFailureRate}. ` +
        `This binding must be reverted to the real evaluator before/after load testing (see EvaluationModule).`
    );
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const delay = Math.max(0, this.latencyMs + (Math.random() * 2 - 1) * this.jitterMs);
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (Math.random() < this.transientFailureRate) {
      throw new RetryableEvaluationError('Simulated transient provider failure (load test).');
    }

    const combined = input.files.map((f) => f.content).join('\n').trim();
    const hasContent = combined.length > 0;
    const overallScore = hasContent ? 70 + Math.round(Math.random() * 30) : 0;

    return {
      overallScore,
      criteriaResults: input.exercise.evaluationCriteria.slice(0, 5).map((criterion) => ({
        criterion,
        score: overallScore,
        passed: overallScore >= 60,
        feedback: 'Simulated load-test evaluation — not a real grading result.',
      })),
      strengths: hasContent ? ['Submission received (simulated).'] : [],
      improvements: ['This result was produced by the load-test mock evaluator, not a real AI model.'],
      feedback: 'Simulated load-test evaluation result.',
      providerName: 'load-test-mock-evaluator',
    };
  }
}
