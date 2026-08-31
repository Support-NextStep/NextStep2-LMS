import type { CriterionResult, EvaluationOutput, ExerciseSpec, SubmittedFile } from './evaluator.interface';

// ---------------------------------------------------------------------------
// Defensive JSON-shape helpers — same pattern as
// server/src/packages/content-version-data.ts (deliberately duplicated, not
// shared: no package boundary exists between modules for this to live in
// once, and the logic is small and pure). ContentVersion.exercise and
// ExerciseSubmission.files are both untyped `Json` columns; everything here
// tolerates a missing/malformed shape instead of throwing.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads the Exercise spec off the submission's own pinned ContentVersion — see EvaluationService.runEvaluation()'s doc comment for why this must never be re-resolved from "currently published." */
export function buildExerciseSpec(exercise: unknown): ExerciseSpec {
  const record = asRecord(exercise);
  return {
    objective: asString(record.objective),
    requirements: asStringArray(record.requirements),
    language: asString(record.language, 'javascript'),
    starterCode: asOptionalString(record.starterCode),
    scenario: asOptionalString(record.scenario),
    expectedBehaviour: asOptionalString(record.expectedBehaviour),
    evaluationCriteria: asStringArray(record.evaluationCriteria),
    edgeCases: asStringArray(record.edgeCases),
    submissionInstructions: asOptionalString(record.submissionInstructions),
  };
}

export function buildSubmittedFiles(files: unknown): SubmittedFile[] {
  if (!Array.isArray(files)) return [];
  return files
    .map((f) => asRecord(f))
    .map((f) => ({ name: asString(f.name), content: asString(f.content) }));
}

function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Never persist an evaluator's output directly (Slice 2 audit principle
 * #10: "do not automatically trust an AI-generated score without
 * validating the evaluator response") — clamp/repair anything usable,
 * throw on anything fundamentally unusable. A thrown error here routes the
 * evaluation to FAILED (see EvaluationService.runEvaluation()'s catch
 * block), never to a fabricated EVALUATED result. Deliberately exercised
 * against the fake evaluator's own well-formed output today; this is
 * exactly where a real AI provider's malformed/hallucinated response gets
 * caught in Slice 2.3, without EvaluationService itself needing to change.
 */
export function validateEvaluationOutput(output: unknown): EvaluationOutput {
  if (!output || typeof output !== 'object') {
    throw new Error('Evaluator returned a non-object result.');
  }
  const raw = output as Record<string, unknown>;

  const overallScore = clampScore(raw.overallScore);
  if (overallScore === null) {
    throw new Error('Evaluator returned an invalid overallScore.');
  }

  const criteriaResults: CriterionResult[] = Array.isArray(raw.criteriaResults)
    ? raw.criteriaResults
        .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object')
        .map((c) => ({
          criterion: asString(c.criterion, 'Unnamed criterion'),
          score: clampScore(c.score) ?? 0,
          passed: c.passed === true,
          feedback: asString(c.feedback),
        }))
    : [];
  if (criteriaResults.length === 0) {
    throw new Error('Evaluator returned no usable criteria results.');
  }

  return {
    overallScore,
    criteriaResults,
    strengths: asStringArray(raw.strengths),
    improvements: asStringArray(raw.improvements),
    feedback: asString(raw.feedback, 'Evaluation completed.'),
    providerName: asString(raw.providerName, 'unknown'),
  };
}
