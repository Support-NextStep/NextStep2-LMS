// ---------------------------------------------------------------------------
// The swap point for AI Exercise Evaluation Slice 2.3. FakeEvaluatorService
// (Slice 2.1) implements this today; a real AI-backed implementation
// replaces it later by changing only EvaluationModule's provider binding
// (EXERCISE_EVALUATOR below) — EvaluationService, the database model, and
// the student submission flow never need to change. Mirrors the
// PracticeExecutionProvider pattern already established on the frontend
// (app/src/data/practiceExecution.ts): one interface, one concrete
// implementation, one binding — never branching on "which evaluator" inside
// application logic.
// ---------------------------------------------------------------------------

/**
 * The authoritative grading contract, read from the exact ContentVersion an
 * ExerciseSubmission is pinned to — never from "whatever is currently
 * published." See EvaluationService.runEvaluation()'s own doc comment.
 */
export type ExerciseSpec = {
  objective: string;
  requirements: string[];
  language: string;
  starterCode?: string;
  scenario?: string;
  expectedBehaviour?: string;
  evaluationCriteria: string[];
  edgeCases: string[];
  submissionInstructions?: string;
};

export type SubmittedFile = { name: string; content: string };

export type EvaluationInput = {
  exercise: ExerciseSpec;
  files: SubmittedFile[];
};

export type CriterionResult = {
  criterion: string;
  score: number;
  passed: boolean;
  feedback: string;
};

export type EvaluationOutput = {
  overallScore: number;
  criteriaResults: CriterionResult[];
  strengths: string[];
  improvements: string[];
  feedback: string;
  providerName: string;
};

/**
 * Any implementation is trusted to try; nothing downstream trusts its
 * output blindly — see evaluation-data.ts's validateEvaluationOutput(),
 * which every EvaluationOutput passes through before persistence.
 *
 * AI Evaluation Reliability slice: an implementation SHOULD throw
 * RetryableEvaluationError or PermanentEvaluationError (defined below)
 * rather than a bare Error, so EvaluationWorkerService can decide retry vs.
 * immediate FAILED without string-matching error messages. A bare Error (or
 * any other thrown value) is still handled safely — EvaluationService
 * treats anything not explicitly RetryableEvaluationError as permanent —
 * but won't get the benefit of a bounded retry for what might have been a
 * transient blip.
 */
export interface ExerciseEvaluator {
  evaluate(input: EvaluationInput): Promise<EvaluationOutput>;
}

/** DI token — see EvaluationModule for the current binding. */
export const EXERCISE_EVALUATOR = Symbol('EXERCISE_EVALUATOR');

/**
 * A failure that is plausibly transient — network blip, request timeout,
 * provider rate limit, provider 5xx. Worth retrying within the bounded
 * retry policy (never endlessly). `retryAfterMs`, when the provider told us
 * explicitly (e.g. a 429's `Retry-After` header), lets the worker honor that
 * instead of guessing via exponential backoff.
 */
export class RetryableEvaluationError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableEvaluationError';
  }
}

/**
 * A failure that will not fix itself on retry — bad/missing configuration,
 * authentication failure, invalid JSON from the model, output that fails
 * schema validation, a request rejected as malformed. Per the reliability
 * slice's explicit requirement: never retry these, no matter how much retry
 * budget remains — go straight to FAILED with a clear reason.
 */
export class PermanentEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentEvaluationError';
  }
}
