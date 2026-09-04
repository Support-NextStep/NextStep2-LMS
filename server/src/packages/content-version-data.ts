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

/**
 * Day 5 follow-up (Issue 2): the authoring StringListEditor for a
 * checkpoint's options can leave trailing empty/whitespace-only slots
 * (its own default is two empty strings, and "+ Add option" adds another
 * empty one each click) — persisting those verbatim is what let
 * VideoCheckpointPlayer.tsx render blank, clickable answer buttons to
 * students. Blanks are dropped here, at the one point a draft freezes into
 * an immutable ContentVersion, so no submitted checkpoint's `options` array
 * ever contains one — `correctIndex` is remapped to the surviving option's
 * new position (falling back to 0 if the author's chosen correct option was
 * itself blank, which the authoring UI's own "Correct Answer" dropdown
 * already discourages by listing options, not indices).
 */
function buildCheckpoints(draft: Record<string, unknown>): CheckpointOut[] {
  if (draft.checkpointsIncluded !== true) return [];
  const raw = Array.isArray(draft.checkpoints) ? draft.checkpoints : [];
  return raw
    .map((c) => asRecord(c))
    .map((c): CheckpointOut => {
      const rawOptions = asStringArray(c.options);
      const rawCorrectIndex = typeof c.correctIndex === 'number' ? c.correctIndex : 0;
      const correctOptionText = rawOptions[rawCorrectIndex];

      const options = rawOptions.filter((o) => o.trim().length > 0);
      const remappedCorrectIndex = correctOptionText?.trim() ? options.indexOf(correctOptionText) : -1;

      return {
        id: asString(c.id),
        timestampSeconds: typeof c.timestampSeconds === 'number' ? c.timestampSeconds : 0,
        question: asString(c.question),
        options,
        correctIndex: remappedCorrectIndex >= 0 ? remappedCorrectIndex : 0,
        feedback: asString(c.feedback),
        required: c.required === true,
      };
    })
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
    // Day 5 follow-up (Issue 1): captured here (mandatory before Submit for
    // Review, per draft-completeness.ts) so ReviewService.publish() has a
    // real, immutable, version-pinned value to propagate to Session.title/
    // description — see that method's own doc comment.
    sessionTitle: asString(draft.sessionTitle),
    sessionDescription: asString(draft.sessionDescription),
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
