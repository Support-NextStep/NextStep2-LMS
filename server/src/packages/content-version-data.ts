import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Converts a stored AuthoredSessionDraft-shaped `draftContent` JSON blob into
// the flat column data a new ContentVersion row needs. Server-side mirror of
// app/src/data/authoredSession.ts's buildContentSessionContent() — same
// mapping, retargeted at ContentVersion's actual columns (objective/
// explanation/concepts/keyConcepts/examples as real columns; video/
// checkpoints/practice/aiHelp/exercise/delivery as JSON, exactly as
// authored) instead of the frontend's ContentSessionContent shape.
//
// Only called from PackagesService.submit() — the one moment a draft's
// mutable JSON gets frozen into an immutable, reviewable snapshot. Written
// defensively (draftContent is untrusted-shape JSON in principle, even
// though only ever populated by the owning author) so a malformed field
// degrades to a safe default instead of throwing mid-transaction.
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

type CheckpointOut = {
  id: string;
  timestampSeconds: number;
  question: string;
  options: string[];
  correctIndex: number;
  feedback: string;
  required: boolean;
};

function buildCheckpoints(draft: Record<string, unknown>): CheckpointOut[] {
  if (draft.checkpointsIncluded !== true) return [];
  const raw = Array.isArray(draft.checkpoints) ? draft.checkpoints : [];
  return raw
    .map((c) => asRecord(c))
    .map(
      (c): CheckpointOut => ({
        id: asString(c.id),
        timestampSeconds: typeof c.timestampSeconds === 'number' ? c.timestampSeconds : 0,
        question: asString(c.question),
        options: asStringArray(c.options),
        correctIndex: typeof c.correctIndex === 'number' ? c.correctIndex : 0,
        feedback: asString(c.feedback),
        required: c.required === true,
      })
    )
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

/** deriveRequiredActivities() from authoredSession.ts, ported: reflects what was actually authored, never manually toggled. */
function deriveRequiredActivities(draft: Record<string, unknown>): string[] {
  const activities = ['learning', 'practice', 'exercise'];
  if (draft.videoIncluded === true && draft.checkpointsIncluded === true && buildCheckpoints(draft).length > 0) {
    activities.splice(1, 0, 'videoCheck');
  }
  return activities;
}

export function buildContentVersionCreateData(
  sessionId: string,
  packageId: string,
  draftContent: unknown
): Prisma.ContentVersionUncheckedCreateInput {
  const draft = asRecord(draftContent);
  const learning = asRecord(draft.learning);
  const practice = asRecord(draft.practice);
  const exercise = asRecord(draft.exercise);
  const video = asRecord(draft.video);
  const aiHelp = asRecord(draft.aiHelp);

  const videoJson =
    draft.videoIncluded === true && asOptionalString(video.youtubeUrl)
      ? { youtubeUrl: asString(video.youtubeUrl), title: asString(video.title) }
      : Prisma.JsonNull;

  const aiHelpJson =
    draft.aiHelpIncluded === true ? { suggestedPrompts: asStringArray(aiHelp.suggestedPrompts) } : Prisma.JsonNull;

  return {
    sessionId,
    packageId,
    objective: asString(learning.objective),
    explanation: asString(learning.explanation),
    concepts: asStringArray(learning.conceptTags),
    keyConcepts: asStringArray(learning.keyConcepts),
    examples: asStringArray(learning.examples),
    video: videoJson,
    checkpoints: buildCheckpoints(draft) as unknown as Prisma.InputJsonValue,
    practice: {
      task: asString(practice.task),
      starterCode: asOptionalString(practice.starterCode),
      language: asString(practice.language, 'javascript'),
    },
    aiHelp: aiHelpJson,
    exercise: {
      objective: asString(exercise.objective),
      requirements: asStringArray(exercise.requirements),
      language: asString(exercise.language, 'javascript'),
      starterCode: asOptionalString(exercise.starterCode),
      scenario: asOptionalString(exercise.scenario),
      expectedBehaviour: asOptionalString(exercise.expectedBehaviour),
      evaluationCriteria: asStringArray(exercise.evaluationCriteria),
      edgeCases: asStringArray(exercise.edgeCases),
      submissionInstructions: asOptionalString(exercise.submissionInstructions),
    },
    requiredActivities: deriveRequiredActivities(draft),
    projectConnection: asOptionalString(draft.projectConnection) ?? null,
    delivery: Prisma.JsonNull,
  };
}
