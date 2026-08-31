// ---------------------------------------------------------------------------
// Server-side mirror of app/src/data/authoredSession.ts's
// computeSectionState() / getIncompleteMandatorySections() / MANDATORY_SECTIONS
// — deliberately duplicated, not shared (no package boundary exists between
// app/ and server/ for this to live in once, and the logic is small and
// pure). Re-validated here because POST /packages/:id/submit is the one
// moment a client's own "Submit for Review is enabled" button state must
// not be the only thing standing between an incomplete draft and
// READY_FOR_REVIEW — never trust client-side validation for a state
// transition that matters.
//
// Kept intentionally narrow: only the 4 mandatory sections
// (sessionInfo/learning/practice/exercise) are checked here, exactly
// matching MANDATORY_SECTIONS on the frontend. Video/checkpoints/aiHelp
// stay optional there and here. draftContent arrives as opaque JSON (it's
// only ever written by the owning author via PUT /packages/:id/draft, but
// still treated defensively — every accessor below tolerates a missing or
// malformed shape instead of throwing).
// ---------------------------------------------------------------------------

export type MandatorySection = 'sessionInfo' | 'learning' | 'practice' | 'exercise';

export const MANDATORY_SECTIONS: MandatorySection[] = ['sessionInfo', 'learning', 'practice', 'exercise'];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyString(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => nonEmptyString(item));
}

/** A section whose import failed is never "complete," even if stale field values are still sitting in the draft from before the failed import. */
function importFailed(section: Record<string, unknown>): boolean {
  return asRecord(section.import).status === 'error';
}

function isSessionInfoComplete(draft: Record<string, unknown>): boolean {
  return (
    nonEmptyString(draft.courseId) &&
    nonEmptyString(draft.subjectId) &&
    nonEmptyString(draft.sessionTitle) &&
    nonEmptyString(draft.sessionDescription)
  );
}

function isLearningComplete(draft: Record<string, unknown>): boolean {
  const learning = asRecord(draft.learning);
  if (importFailed(learning)) return false;
  return nonEmptyString(learning.objective) && hasNonEmptyString(learning.examples) && hasNonEmptyString(learning.keyConcepts);
}

function isPracticeComplete(draft: Record<string, unknown>): boolean {
  const practice = asRecord(draft.practice);
  if (importFailed(practice)) return false;
  return nonEmptyString(practice.task) && nonEmptyString(practice.language);
}

function isExerciseComplete(draft: Record<string, unknown>): boolean {
  const exercise = asRecord(draft.exercise);
  if (importFailed(exercise)) return false;
  return (
    nonEmptyString(exercise.objective) &&
    hasNonEmptyString(exercise.requirements) &&
    nonEmptyString(exercise.language) &&
    hasNonEmptyString(exercise.evaluationCriteria)
  );
}

const SECTION_CHECKS: Record<MandatorySection, (draft: Record<string, unknown>) => boolean> = {
  sessionInfo: isSessionInfoComplete,
  learning: isLearningComplete,
  practice: isPracticeComplete,
  exercise: isExerciseComplete,
};

export function getIncompleteMandatorySections(draftContent: unknown): MandatorySection[] {
  const draft = asRecord(draftContent);
  return MANDATORY_SECTIONS.filter((section) => !SECTION_CHECKS[section](draft));
}
