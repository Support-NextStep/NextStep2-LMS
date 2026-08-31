// ---------------------------------------------------------------------------
// Content session content shape + the adapter that turns it into what
// SessionWorkspace.tsx actually renders (SessionContent, sessionContent.ts).
//
// HISTORY: this file used to also own the whole ContentPackageRecord
// domain model — status lifecycle, review/approve/publish, and
// localStorage persistence (upsertPackageRecord/loadContentPackages/
// findResumableAuthoredPackage/updatePackageState). All of that moved to
// the real backend (server/src/packages, server/src/review) as part of the
// content-authoring-backend phase — see authoredSessionApi.ts and
// contentReviewApi.ts for the replacements. What's left here is purely the
// authored-content SHAPE (ContentSessionContent) and the one real
// transformation (toPreviewSessionContent) that both the backend's
// ContentVersion-authoring path (server/src/packages/content-version-data.ts,
// which mirrors this shape) and the frontend's own Preview
// (ContentPreviewSession.tsx) still need.
//
// PRACTICE SELF-CHECK: retired from the active product contract (see
// NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's cleanup pass). It used
// to be authored as checklist LABELS, converted into a placeholder
// `{label, passed: true}[]` for Preview/Student, and never actually shown or
// scored — dead data through the whole pipeline. Practice now carries only
// task/starterCode/language; the DOCX Practice section's "Self-Check"
// heading is still recognized by docxParser.ts purely so its bullet list
// doesn't corrupt adjacent field extraction, but nothing extracts, stores,
// or reads its content any more.
// ---------------------------------------------------------------------------

import type { SessionContent, VideoCheckpoint } from "./sessionContent";

export type ActivityKey = "learning" | "videoCheck" | "practice" | "exercise";

export type ContentSessionContent = {
  objective: string;
  explanation: string;
  concepts: string[];
  keyConcepts: string[];
  examples: string[];
  video?: {
    youtubeUrl: string;
    title: string;
    durationSeconds?: number;
  };
  /**
   * See NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §A/§H — every authored
   * checkpoint, sorted by timestampSeconds, never just the first.
   */
  checkpoints?: VideoCheckpoint[];
  /**
   * @deprecated Pre-Video-Checkpoint-System single-checkpoint shape. No code
   * writes this any more — kept only so a package saved before that slice
   * (if one is still sitting in a browser's storage) doesn't lose its one
   * checkpoint. Read only by the compatibility adapter next to
   * toPreviewSessionContent() below; never read directly anywhere else.
   */
  videoCheckpoint?: {
    question: string;
    options: string[];
    correctIndex: number;
  };
  practice: {
    task: string;
    starterCode?: string;
    language: string;
  };
  aiHelp?: {
    suggestedPrompts: string[];
  };
  exercise: {
    objective: string;
    requirements: string[];
    starterCode?: string;
    language: string;
    /** The remainder of the authored Exercise contract — preserved end to end for a future evaluation pipeline; not rendered to students yet. */
    scenario?: string;
    expectedBehaviour?: string;
    evaluationCriteria?: string[];
    edgeCases?: string[];
    submissionInstructions?: string;
  };
  requiredActivities: ActivityKey[];
  projectConnection?: string;
};

/**
 * Compatibility adapter (Video Checkpoint System Slice 1 — see
 * NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §L). Prefers the real `checkpoints`
 * array; falls back to synthesizing a one-item array from the deprecated
 * singular `videoCheckpoint` field for any package saved before this slice.
 * Deliberately does not invent real historical data for fields the legacy
 * shape never had — `timestampSeconds`/`feedback` get honest, neutral
 * defaults, `required` defaults to `true` (the safer assumption for a
 * checkpoint that predates the concept of being optional).
 */
function resolveCheckpoints(draft: ContentSessionContent): VideoCheckpoint[] {
  if (draft.checkpoints && draft.checkpoints.length > 0) return draft.checkpoints;
  if (draft.videoCheckpoint) {
    return [
      {
        id: "legacy-checkpoint",
        timestampSeconds: 0,
        question: draft.videoCheckpoint.question,
        options: draft.videoCheckpoint.options,
        correctIndex: draft.videoCheckpoint.correctIndex,
        feedback: "",
        required: true,
      },
    ];
  }
  return [];
}

/**
 * Adapts a draft session's authored content into the shape the real
 * SessionWorkspace component expects (SessionContent from sessionContent.ts).
 * The one real transformation left here is checkpoint compatibility
 * (resolveCheckpoints() above) — everything else is a direct passthrough.
 * Never writes back into sessionContent.ts or ContentSessionContent.
 */
export function toPreviewSessionContent(draft: ContentSessionContent): SessionContent {
  return {
    objective: draft.objective,
    explanation: draft.explanation,
    concepts: draft.concepts,
    keyConcepts: draft.keyConcepts,
    examples: draft.examples,
    video: draft.video,
    checkpoints: resolveCheckpoints(draft),
    practice: {
      task: draft.practice.task,
      starterCode: draft.practice.starterCode ?? "",
      language: draft.practice.language,
    },
    aiHelp: draft.aiHelp,
    exercise: {
      objective: draft.exercise.objective,
      requirements: draft.exercise.requirements,
      starterCode: draft.exercise.starterCode,
      language: draft.exercise.language,
      scenario: draft.exercise.scenario,
      expectedBehaviour: draft.exercise.expectedBehaviour,
      evaluationCriteria: draft.exercise.evaluationCriteria,
      edgeCases: draft.exercise.edgeCases,
      submissionInstructions: draft.exercise.submissionInstructions,
    },
    requiredActivities: draft.requiredActivities,
    projectConnection: draft.projectConnection,
    // delivery (live sessions) is intentionally not part of the authoring
    // contract — see NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md §23.
  };
}
