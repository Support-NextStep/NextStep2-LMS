import { Injectable } from '@nestjs/common';
import type { EvaluationInput, EvaluationOutput, ExerciseEvaluator } from '../evaluator.interface';

// ---------------------------------------------------------------------------
// AI Exercise Evaluation Slice 2.1 — deterministic FAKE evaluator. Proves the
// evaluation lifecycle/API architecture before any real LLM is connected
// (Slice 2.3). No external call, no randomness, no wall-clock dependence in
// the scoring itself — the same (exercise, files) input always produces the
// same output, which is what makes the lifecycle/pinning tests in this slice
// meaningful. Deliberately NOT a real grader: the heuristics below are a
// simple, honest proxy (did the student submit anything real? did they
// change the starter code? do the authored requirements' own keywords show
// up in the code?) — not something anyone should mistake for real grading
// quality. Replaced wholesale in Slice 2.3 by swapping EvaluationModule's
// EXERCISE_EVALUATOR binding to a real provider; nothing here is imported by
// anything outside this file except through the ExerciseEvaluator interface.
// ---------------------------------------------------------------------------

const PROVIDER_NAME = 'fake-evaluator';

/** A requirement is "addressed" if any of its own significant (4+ letter) words shows up, case-insensitively, anywhere in the submitted code — a deliberately crude but deterministic proxy, not real understanding. */
function requirementIsAddressed(requirement: string, lowerCombinedCode: string): boolean {
  const words = requirement.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  return words.some((word) => lowerCombinedCode.includes(word));
}

@Injectable()
export class FakeEvaluatorService implements ExerciseEvaluator {
  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const combined = input.files.map((f) => f.content).join('\n');
    const trimmedCombined = combined.trim();
    const lowerCombined = trimmedCombined.toLowerCase();

    const criteriaResults: EvaluationOutput['criteriaResults'] = [];

    // 1. Was anything actually submitted?
    const hasContent = trimmedCombined.length > 0;
    criteriaResults.push({
      criterion: 'Submission received',
      score: hasContent ? 100 : 0,
      passed: hasContent,
      feedback: hasContent ? 'Submission contains student files.' : 'No non-empty file content was submitted.',
    });

    // 2. Did the student change anything from the provided starter code?
    if (input.exercise.starterCode && input.exercise.starterCode.trim().length > 0) {
      const unchanged = trimmedCombined === input.exercise.starterCode.trim();
      criteriaResults.push({
        criterion: 'Code differs from starter template',
        score: unchanged ? 0 : 100,
        passed: !unchanged,
        feedback: unchanged
          ? 'Submitted code is identical to the provided starter code.'
          : 'Submitted code has been modified from the starter template.',
      });
    }

    // 3. Deterministic proxy for "addresses authored requirements."
    const requirements = input.exercise.requirements.filter((r) => r.trim().length > 0);
    if (requirements.length > 0) {
      const matched = requirements.filter((r) => requirementIsAddressed(r, lowerCombined));
      const ratio = matched.length / requirements.length;
      criteriaResults.push({
        criterion: 'Addresses authored requirements',
        score: Math.round(ratio * 100),
        passed: ratio >= 0.5,
        feedback: `${matched.length} of ${requirements.length} authored requirement keyword(s) were found in the submission.`,
      });
    }

    const overallScore = Math.round(criteriaResults.reduce((sum, c) => sum + c.score, 0) / criteriaResults.length);

    const strengths: string[] = [];
    const improvements: string[] = [];
    if (hasContent) {
      strengths.push('Submission was received successfully.');
    } else {
      improvements.push('No code was submitted — write a solution before submitting.');
    }
    if (criteriaResults.some((c) => c.criterion === 'Addresses authored requirements' && c.passed)) {
      strengths.push('Submission appears to address most of the authored requirements.');
    }
    improvements.push('Detailed AI-driven feedback will be available once a real evaluator is connected.');

    return {
      overallScore,
      criteriaResults,
      strengths,
      improvements,
      feedback:
        'Demo evaluation completed successfully. This is a deterministic placeholder result — a real AI evaluator will replace it in a later slice.',
      providerName: PROVIDER_NAME,
    };
  }
}
