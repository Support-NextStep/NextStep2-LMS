// ---------------------------------------------------------------------------
// Content Team Session Authoring Workspace.
//
// Implements the document-first authoring model from
// NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md as an in-app workspace, per the
// left-sidebar UX in NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md.
//
// DOCUMENT EXTRACTION — real, as of Slice 2: uploaded .docx files are
// genuinely unzipped and their word/document.xml is genuinely read for real
// Heading-1/Heading-2 paragraph styles — see docxParser.ts, which implements
// NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md §9's strict-template-parsing
// decision exactly (deterministic, never AI, never rewords anything). This
// file's job is only to plug that parser's per-section extraction into the
// upload/save flow and the AuthoredSessionDraft shape below.
//
// PERSISTENCE: an AuthoredSessionDraft is not a new storage key. It is
// packaged into the EXISTING ContentPackageRecord shape (contentPackages.ts)
// — one course, one subject, one session — so every already-built piece of
// machinery (publishedContent.ts's resolution, ContentPackageDetail.tsx's
// review/approve/publish, Admin's content pages) keeps working completely
// unchanged for both old ZIP-imported packages and new authored ones, side
// by side, in the same array.
// ---------------------------------------------------------------------------

import { type ContentSessionContent } from "./contentPackages";
import {
  extractExerciseContent,
  extractLearningContent,
  extractPracticeContent,
  readDocx,
  type DocxParagraph,
  type ExerciseExtraction,
  type ExtractResult,
  type LearningExtraction,
  type PracticeExtraction,
} from "./docxParser";

// ---- Shared building blocks -------------------------------------------------

export type DocumentImportStatus = "none" | "uploading" | "extracting" | "success" | "error";

export type DocumentImportState = {
  status: DocumentImportStatus;
  fileName?: string;
  importedAt?: string;
  errors?: string[];
  /** Non-blocking — e.g. "this document contains N images that won't be shown to students." Extraction still succeeds. */
  warnings?: string[];
};

const EMPTY_IMPORT: DocumentImportState = { status: "none" };

/**
 * Shape intentionally matches sessionContent.ts's VideoCheckpoint field for
 * field, but is NOT imported from there — this is the authoring-draft
 * layer, a distinct concern from the published student-content layer even
 * though the shapes currently coincide. `continueImmediately` was removed
 * here (Video Checkpoint System Slice 1, §D) — it had no effect on student
 * behavior even before this slice, so it's gone rather than kept as a
 * config field that does nothing.
 */
export type AuthoredCheckpoint = {
  id: string;
  /** Stored as whole seconds — the UI displays/accepts mm:ss and converts. */
  timestampSeconds: number;
  question: string;
  options: string[];
  correctIndex: number;
  feedback: string;
  required: boolean;
};

export type LearningContentDraft = {
  import: DocumentImportState;
  objective: string;
  explanation: string;
  examples: string[];
  keyConcepts: string[];
  conceptTags: string[];
};

export type PracticeDraft = {
  import: DocumentImportState;
  task: string;
  language: string;
  starterCode: string;
  // No `selfCheck` field — Self-Check was retired from the active product
  // contract (see NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's
  // cleanup pass). docxParser.ts still recognizes the document's "Self-Check"
  // heading so its bullets don't corrupt adjacent field extraction, but
  // nothing extracts, stores, or reads that content any more.
};

export type ExerciseDraft = {
  import: DocumentImportState;
  title: string;
  objective: string;
  scenario: string;
  requirements: string[];
  expectedBehaviour: string;
  evaluationCriteria: string[];
  edgeCases: string[];
  submissionInstructions: string;
  language: string;
  starterCode: string;
};

export type AiHelpDraft = {
  suggestedPrompts: string[];
};

export type VideoDraft = {
  youtubeUrl: string;
  title: string;
};

export const SECTION_KEYS = [
  "sessionInfo",
  "learning",
  "video",
  "checkpoints",
  "practice",
  "aiHelp",
  "exercise",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type SectionState = "complete" | "attention" | "not_started" | "skipped";

export type AuthoredSessionDraft = {
  packageId: string;
  courseId: string;
  courseTitle: string;
  subjectId: string;
  subjectTitle: string;
  sessionId: string;
  sessionTitle: string;
  sessionDescription: string;

  learning: LearningContentDraft;

  videoIncluded: boolean;
  video: VideoDraft;

  checkpointsIncluded: boolean;
  checkpoints: AuthoredCheckpoint[];

  practice: PracticeDraft;

  aiHelpIncluded: boolean;
  aiHelp: AiHelpDraft;

  exercise: ExerciseDraft;

  // Workflow status (DRAFT/READY_FOR_REVIEW/CHANGES_REQUESTED/APPROVED/
  // PUBLISHED) and review history live on the backend ContentPackage/
  // ContentReview rows now (see authoredSessionApi.ts/contentReviewApi.ts)
  // — this draft object only ever carries authored content, never workflow
  // state, so there's no `status`/`review` field here to keep in sync.
  authoredBy: string;
  createdAt: string;
  updatedAt: string;
};

// ---- Identity ---------------------------------------------------------------

export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "session"
  );
}

function generatePackageId(): string {
  return `authored-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Defaults / factory -------------------------------------------------

export function createEmptyDraft(opts: {
  courseId: string;
  courseTitle: string;
  subjectId: string;
  subjectTitle: string;
  sessionId: string;
  sessionTitle: string;
  sessionDescription?: string;
  authoredBy: string;
}): AuthoredSessionDraft {
  const now = new Date().toISOString();
  return {
    packageId: generatePackageId(),
    courseId: opts.courseId,
    courseTitle: opts.courseTitle,
    subjectId: opts.subjectId,
    subjectTitle: opts.subjectTitle,
    sessionId: opts.sessionId,
    sessionTitle: opts.sessionTitle,
    sessionDescription: opts.sessionDescription || "",

    learning: { import: { ...EMPTY_IMPORT }, objective: "", explanation: "", examples: [], keyConcepts: [], conceptTags: [] },

    videoIncluded: false,
    video: {
      youtubeUrl: "",
      title: "",
    },

    checkpointsIncluded: false,
    checkpoints: [],

    practice: {
      import: { ...EMPTY_IMPORT },
      task: "",
      language: "javascript",
      starterCode: "",
    },

    aiHelpIncluded: true,
    aiHelp: { suggestedPrompts: [] },

    exercise: {
      import: { ...EMPTY_IMPORT },
      title: "",
      objective: "",
      scenario: "",
      requirements: [],
      expectedBehaviour: "",
      evaluationCriteria: [],
      edgeCases: [],
      submissionInstructions: "",
      language: "javascript",
      starterCode: "",
    },

    authoredBy: opts.authoredBy,
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Section completeness --------------------------------------------------
//
// Authoring completeness only — never workflow/version status (draft,
// approved, published live entirely on the wrapping ContentPackageRecord's
// `status`, untouched by any of this).

// Tolerates non-string/undefined on purpose — see computeSectionState's own
// doc comment on why `draft` isn't always guaranteed fully-formed here.
function nonEmpty(v: string | undefined | null): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * `draft` is typed as a complete AuthoredSessionDraft, but every real caller
 * ultimately traces back to `ContentPackage.draftContent` fetched from the
 * backend — which is a genuinely empty `{}` for a package that was created
 * and then abandoned before the first Save Draft (see loadDraftForSession()
 * in authoredSessionApi.ts, and buildContentSessionContent()'s matching
 * comment above for the same underlying reason). ContentSessionAuthoring.tsx
 * already reconstructs a full, safe default draft for that case rather than
 * ever calling this with a bare `{}` — the optional-chaining/fallback
 * defaults below are a second, independent safety net, not the primary
 * fix: this function should never crash a whole page render just because
 * one section's data happens to be missing.
 */
export function computeSectionState(draft: AuthoredSessionDraft, section: SectionKey): SectionState {
  switch (section) {
    case "sessionInfo": {
      const fields = [draft.courseId, draft.subjectId, draft.sessionTitle, draft.sessionDescription];
      const filled = fields.filter((f) => nonEmpty(f)).length;
      if (filled === fields.length) return "complete";
      if (filled === 0) return "not_started";
      return "attention";
    }
    case "learning": {
      const learning = draft.learning;
      if (!learning) return "not_started";
      if (learning.import?.status === "error") return "attention";

      const hasObjective = nonEmpty(learning.objective);
      const hasExamples = (learning.examples ?? []).some((e) => nonEmpty(e));
      const hasKeyConcepts = (learning.keyConcepts ?? []).some((c) => nonEmpty(c));

      if (hasObjective && hasExamples && hasKeyConcepts) return "complete";
      if (!hasObjective && !hasExamples && !hasKeyConcepts) return "not_started";
      return "attention";
    }
    case "video": {
      if (!draft.videoIncluded) return "skipped";
      const video = draft.video;
      if (nonEmpty(video?.youtubeUrl) && nonEmpty(video?.title)) return "complete";
      if (nonEmpty(video?.youtubeUrl) || nonEmpty(video?.title)) return "attention";
      return "not_started";
    }
    case "checkpoints": {
      if (!draft.videoIncluded || !draft.checkpointsIncluded) return "skipped";
      const checkpoints = draft.checkpoints ?? [];
      if (checkpoints.length === 0) return "not_started";
      const allValid = checkpoints.every((c) => nonEmpty(c.question) && c.options.filter(nonEmpty).length >= 2);
      return allValid ? "complete" : "attention";
    }
    case "practice": {
      const practice = draft.practice;
      if (!practice) return "not_started";
      if (practice.import?.status === "error") return "attention";
      const mandatoryFilled = nonEmpty(practice.task) && nonEmpty(practice.language);
      if (!mandatoryFilled) {
        return nonEmpty(practice.task) ? "attention" : "not_started";
      }
      return "complete";
    }
    case "aiHelp": {
      return draft.aiHelpIncluded ? "complete" : "skipped";
    }
    case "exercise": {
      const exercise = draft.exercise;
      if (!exercise) return "not_started";
      if (exercise.import?.status === "error") return "attention";
      const mandatoryFilled =
        nonEmpty(exercise.objective) && (exercise.requirements ?? []).filter(nonEmpty).length > 0 && nonEmpty(exercise.language);
      if (!mandatoryFilled) {
        return nonEmpty(exercise.objective) ? "attention" : "not_started";
      }
      return (exercise.evaluationCriteria ?? []).filter(nonEmpty).length > 0 ? "complete" : "attention";
    }
  }
}

export const MANDATORY_SECTIONS: SectionKey[] = ["sessionInfo", "learning", "practice", "exercise"];

export function getIncompleteMandatorySections(draft: AuthoredSessionDraft): SectionKey[] {
  return MANDATORY_SECTIONS.filter((s) => computeSectionState(draft, s) !== "complete");
}

export function canSubmitForReview(draft: AuthoredSessionDraft): boolean {
  return getIncompleteMandatorySections(draft).length === 0;
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  sessionInfo: "Session Information",
  learning: "Learning Content",
  video: "Video",
  checkpoints: "Video Checkpoints",
  practice: "Practice",
  aiHelp: "AI Tutor",
  exercise: "Exercise",
};

/** Required Activities are never manually toggled — they're a direct reflection of what was actually authored, so they can never require an activity with no content behind it. */
export function deriveRequiredActivities(draft: AuthoredSessionDraft): ("learning" | "videoCheck" | "practice" | "exercise")[] {
  const activities: ("learning" | "videoCheck" | "practice" | "exercise")[] = ["learning", "practice", "exercise"];
  if (draft.videoIncluded && draft.checkpointsIncluded && (draft.checkpoints?.length ?? 0) > 0) {
    activities.splice(1, 0, "videoCheck");
  }
  return activities;
}

// ---- Document upload / real extraction -------------------------------------
//
// Validates file type/size, then hands the file to docxParser.ts for real,
// deterministic heading-based extraction — no mock content, no AI. See this
// file's header and NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md §9.

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB

function validateDocxFile(file: File): string[] {
  const errors: string[] = [];
  if (!file.name.toLowerCase().endsWith(".docx")) {
    errors.push(`"${file.name}" isn't a .docx file. Please upload a Word document using the official NextStep² session template.`);
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    errors.push(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB — please keep session documents under 5 MB.`);
  }
  return errors;
}

type UploadResult<T> =
  | { ok: true; fileName: string; importedAt: string; data: T; warnings: string[] }
  | { ok: false; errors: string[] };

async function runDocumentUpload<T>(file: File, extract: (paragraphs: DocxParagraph[]) => ExtractResult<T>): Promise<UploadResult<T>> {
  const typeErrors = validateDocxFile(file);
  if (typeErrors.length > 0) return { ok: false, errors: typeErrors };

  const read = await readDocx(file);
  if (!read.ok) return { ok: false, errors: [read.error] };

  const result = extract(read.paragraphs);
  if (!result.ok) return { ok: false, errors: result.errors };

  const warnings: string[] = [];
  if (read.imageCount > 0) {
    warnings.push(
      `This document contains ${read.imageCount} image${read.imageCount === 1 ? "" : "s"} that won't be shown to students — there is no image-rendering slot in the Student Session UI today.`
    );
  }

  return { ok: true, fileName: file.name, importedAt: new Date().toISOString(), data: result.data, warnings };
}

export async function uploadLearningContentDocument(file: File): Promise<UploadResult<LearningExtraction>> {
  return runDocumentUpload(file, extractLearningContent);
}

export async function uploadPracticeDocument(file: File): Promise<UploadResult<PracticeExtraction>> {
  return runDocumentUpload(file, extractPracticeContent);
}

export async function uploadExerciseDocument(file: File): Promise<UploadResult<ExerciseExtraction>> {
  return runDocumentUpload(file, extractExerciseContent);
}

// ---- Conversion for Preview/Publish ----------------------------------------
//
// Reuses the exact existing ContentSessionContent shape (contentPackages.ts)
// so the already-built preview/publish pipeline (toPreviewSessionContent,
// SessionWorkspace) renders authored drafts with zero changes to either.

/**
 * `draft` is typed as a complete AuthoredSessionDraft, but its one real
 * caller (ContentPreviewSession.tsx) gets it back from the backend as
 * `ContentPackage.draftContent` — JSON that starts life as a genuinely
 * empty `{}` the moment a package is created (see PackagesService.
 * createPackage()), before the author has ever clicked Save Draft. A crash
 * here on that legitimate, reachable state (rather than the friendly
 * "can't be previewed" message the caller already has ready) is the actual
 * bug this guards against — the same defensive treatment already applied
 * to draftContent's other consumer, server/src/packages/content-version-data.ts,
 * for the identical reason (untrusted-shape JSON crossing a fetch boundary,
 * not a value known-complete in memory).
 */
function emptyLearningDraft(): LearningContentDraft {
  return { import: { status: "none" }, objective: "", explanation: "", examples: [], keyConcepts: [], conceptTags: [] };
}
function emptyPracticeDraft(): PracticeDraft {
  return { import: { status: "none" }, task: "", language: "javascript", starterCode: "" };
}
function emptyExerciseDraft(): ExerciseDraft {
  return {
    import: { status: "none" },
    title: "",
    objective: "",
    scenario: "",
    requirements: [],
    expectedBehaviour: "",
    evaluationCriteria: [],
    edgeCases: [],
    submissionInstructions: "",
    language: "javascript",
    starterCode: "",
  };
}

export function buildContentSessionContent(draft: AuthoredSessionDraft): ContentSessionContent {
  const learning = draft.learning ?? emptyLearningDraft();
  const practice = draft.practice ?? emptyPracticeDraft();
  const exercise = draft.exercise ?? emptyExerciseDraft();
  const video = draft.video ?? { youtubeUrl: "", title: "" };
  const aiHelp = draft.aiHelp ?? { suggestedPrompts: [] };
  const checkpoints = draft.checkpoints ?? [];

  return {
    objective: learning.objective,
    explanation: learning.explanation,
    concepts: learning.conceptTags,
    keyConcepts: learning.keyConcepts,
    examples: learning.examples,
    video: draft.videoIncluded && video.youtubeUrl ? { youtubeUrl: video.youtubeUrl, title: video.title } : undefined,
    // Every authored checkpoint survives here now, sorted by timestamp — see
    // NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §A/§H. This function never writes
    // the deprecated singular `videoCheckpoint` field; that field only ever
    // exists on packages saved before this slice.
    checkpoints: draft.checkpointsIncluded
      ? [...checkpoints]
          .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
          .map((c) => ({
            id: c.id,
            timestampSeconds: c.timestampSeconds,
            question: c.question,
            options: c.options,
            correctIndex: c.correctIndex,
            feedback: c.feedback,
            required: c.required,
          }))
      : [],
    practice: {
      task: practice.task,
      starterCode: practice.starterCode || undefined,
      language: practice.language,
      // No `checklist` — Self-Check was retired from the active product
      // contract (see NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md).
    },
    ...(draft.aiHelpIncluded ? { aiHelp: { suggestedPrompts: aiHelp.suggestedPrompts } } : {}),
    exercise: {
      objective: exercise.objective,
      requirements: exercise.requirements,
      language: exercise.language,
      starterCode: exercise.starterCode || undefined,
      scenario: exercise.scenario || undefined,
      expectedBehaviour: exercise.expectedBehaviour || undefined,
      evaluationCriteria: exercise.evaluationCriteria,
      edgeCases: exercise.edgeCases,
      submissionInstructions: exercise.submissionInstructions || undefined,
    },
    requiredActivities: deriveRequiredActivities(draft),
  };
}

// ---- Checkpoint timestamp helpers (mm:ss <-> seconds) ----------------------
//
// Manual entry only for this slice — the existing app has no YouTube IFrame
// Player API integration (no enablejsapi, no player object) for a "pause and
// capture the current time" interaction to hook into. See the final report.

export function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function parseTimestamp(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function generateCheckpointId(): string {
  return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createEmptyCheckpoint(): AuthoredCheckpoint {
  return {
    id: generateCheckpointId(),
    timestampSeconds: 0,
    question: "",
    options: ["", ""],
    correctIndex: 0,
    feedback: "",
    required: true,
  };
}

// ---- Persistence ------------------------------------------------------------
//
// Backed by the real backend now (see authoredSessionApi.ts) — a package's
// full course/subject/session/content tree used to be reconstructed here
// (buildCourseTree/toPackageRecord) purely so the localStorage
// ContentPackageRecord shape had somewhere for preview/publish resolution
// to read from. That reconstruction no longer exists: the backend already
// knows a package's session via a real FK (ContentPackage.sessionId), and
// content-session-content resolution reads ContentVersion directly (see
// content.service.ts) — nothing here needs to fabricate the old nested
// ContentCourseFull tree any more. buildContentSessionContent() itself is
// unchanged and still used — server/src/packages/content-version-data.ts
// is its backend-side mirror, applied at submit time.

export {
  createPackageForDraft,
  loadDraftForSession,
  loadDraftByPackageId,
  saveDraft,
  submitForReview,
  getPackageDetail,
  listMyPackages,
} from "./authoredSessionApi";
