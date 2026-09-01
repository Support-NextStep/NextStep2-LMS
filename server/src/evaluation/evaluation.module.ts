import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { EvaluationWorkerService } from './evaluation-worker.service';
import { EvaluationConfig } from './evaluation-config';
import { FakeEvaluatorService } from './evaluators/fake-evaluator.service';
import { RealAiEvaluatorService } from './evaluators/real-ai-evaluator.service';
import { HuggingFaceEvaluatorService } from './evaluators/huggingface-evaluator.service';
import { LoadTestMockEvaluatorService } from './evaluators/load-test-mock-evaluator.service';
import { EXERCISE_EVALUATOR } from './evaluator.interface';

// ---------------------------------------------------------------------------
// SLICE 8 LOAD TEST — TEMPORARY BINDING.
// EXERCISE_EVALUATOR is pointed at LoadTestMockEvaluatorService instead of
// HuggingFaceEvaluatorService for the duration of this slice's controlled
// load testing (see that file's doc comment, and evaluation.module.ts's own
// pre-existing comment documenting the identical pattern used by the AI
// Evaluation Reliability slice). MUST be reverted back to
// HuggingFaceEvaluatorService before this slice's real-Hugging-Face smoke
// test and before this slice is considered done.
// ---------------------------------------------------------------------------
const USE_LOAD_TEST_MOCK_EVALUATOR = true;

/**
 * AI Exercise Evaluation Slice 2.1 proved the evaluation lifecycle/API
 * plumbing with a deterministic FakeEvaluatorService. Slice 2.2 swapped in a
 * real evaluator (currently HuggingFaceEvaluatorService). The AI Evaluation
 * Reliability slice adds EvaluationWorkerService — the background worker
 * that actually calls evaluate() now, off the request path — and
 * EvaluationConfig (every retry/concurrency/timeout/limit tunable, one
 * place). Swapping providers is still the same one `provide` line below;
 * none of that plumbing needed to change for the reliability work.
 *
 * FakeEvaluatorService and RealAiEvaluatorService both stay registered
 * (unused by the live binding) — still useful for tests that shouldn't
 * depend on a real API key or network call, and they demonstrate that
 * EXERCISE_EVALUATOR really is swappable rather than hard-wired to
 * whichever provider is "current." (A third implementation,
 * LoadTestMockEvaluatorService, was bound here only for the reliability
 * slice's controlled 10/25/50/100-submission load test — see the slice's
 * report — and has been removed along with that temporary binding.)
 *
 * Exported so SubmissionsModule can inject EvaluationService to create the
 * PENDING row right after a new ExerciseSubmission is created — a one-way
 * dependency (Submissions -> Evaluation); EvaluationService itself never
 * depends on SubmissionsService, it reads ExerciseSubmission rows directly
 * via PrismaService (same "re-query directly" precedent SubmissionsService
 * already uses for resolving published content). SubmissionsService no
 * longer waits for evaluate() to finish — see its own doc comment.
 */
@Module({
  imports: [AuthModule], // for JwtAuthGuard's injected JwtService
  controllers: [EvaluationController],
  providers: [
    EvaluationConfig,
    EvaluationService,
    EvaluationWorkerService,
    FakeEvaluatorService,
    RealAiEvaluatorService,
    HuggingFaceEvaluatorService,
    LoadTestMockEvaluatorService,
    {
      provide: EXERCISE_EVALUATOR,
      useExisting: USE_LOAD_TEST_MOCK_EVALUATOR ? LoadTestMockEvaluatorService : HuggingFaceEvaluatorService,
    },
  ],
  exports: [EvaluationService, EvaluationConfig],
})
export class EvaluationModule {}
