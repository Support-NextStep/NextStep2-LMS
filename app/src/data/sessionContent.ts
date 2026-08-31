// ---------------------------------------------------------------------------
// Session Workspace content model.
//
// SessionPage.tsx is a generic renderer — it should never need session-specific
// UI branches. Everything a session teaches/asks/checks lives here, keyed by
// session id. A future session is added by adding an entry to SESSION_CONTENT
// (or, once real content authoring exists, fetching the equivalent shape from
// an API) — not by editing the page component.
//
// Sessions without a curated entry fall back to buildDefaultSessionContent()
// so every session route still renders something reasonable.
//
// Title/description are intentionally NOT duplicated here — they live once,
// on the routing Session record in mock.ts, so every screen (My Course,
// Subject, Session) reads the same string for the same session id. This file
// only owns *how the session is taught*.
// ---------------------------------------------------------------------------

import { getCachedBackendPublishedContent } from "./backendPublishedContent";

export type ActivityKey = "learning" | "videoCheck" | "practice" | "exercise";

/**
 * One authored video checkpoint — see NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md
 * §A. `SessionContent.checkpoints` is always a resolved array of these
 * (never the deprecated singular shape a pre-Slice-1 record might still
 * have on disk — see ContentSessionContent.videoCheckpoint in
 * contentPackages.ts and the compatibility adapter next to
 * toPreviewSessionContent() there, which is the one place that shape ever
 * gets converted into this one).
 *
 * `continueImmediately` from the old per-checkpoint authoring data is
 * intentionally not part of this shape — see §D of the design doc: it had
 * no effect even before this slice, so it was removed rather than kept as
 * a config field that does nothing.
 */
export type VideoCheckpoint = {
  id: string;
  /** Whole seconds from the start of the video. */
  timestampSeconds: number;
  question: string;
  options: string[];
  correctIndex: number;
  /** Shown to the student after they answer, right or wrong. */
  feedback: string;
  /** See §C — must be *answered* (not necessarily correctly) before it's resolved; gates session completion. Blocking playback/seeking on this is a future playback-slice concern, not implemented yet. */
  required: boolean;
};

export type AiHelpConfig = {
  suggestedPrompts: string[];
};

export type SessionFormat = "recorded" | "live";

export type SessionDelivery = {
  format: SessionFormat;
  /** ISO datetime — only meaningful when format is "live". */
  scheduledAt?: string;
  /** Only meaningful when format is "live". Defaults to 60 if omitted. */
  durationMinutes?: number;
};

export type SessionContent = {
  objective: string;
  explanation: string;
  concepts: string[];
  keyConcepts: string[];
  examples: string[];
  /**
   * Present whenever the session has a real configured video — previously
   * dropped before reaching this type (see the Video + Video Checkpoints
   * audit); now a first-class field so a future playback slice can render
   * the real YouTube video for students, not only in Preview.
   */
  video?: { youtubeUrl: string; title: string };
  /**
   * Always a resolved array (possibly empty) — never the deprecated
   * singular shape. See the VideoCheckpoint doc comment above.
   */
  checkpoints: VideoCheckpoint[];
  practice: {
    task: string;
    starterCode: string;
    /**
     * Which language this practice is written in — drives which OneCompiler
     * embed is loaded (see practiceExecution.ts). Kept as a plain string
     * rather than a closed union so new languages don't require a type
     * change here; unmapped values fall back to a sensible default in the
     * provider itself.
     */
    language: string;
    // No `checklist`/Self-Check field — retired from the active product
    // contract (see NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's
    // cleanup pass). It was authored, extracted, persisted, and converted
    // through the whole pipeline but never shown to students and never
    // meaningfully scored. Practice completion is "the student opened
    // Practice" — see SessionWorkspace.tsx — and contributes no score.
  };
  aiHelp?: AiHelpConfig;
  exercise: {
    objective: string;
    requirements: string[];
    /** Optional — populated into the OneCompiler embed via postMessage if present. */
    starterCode?: string;
    /** Drives which OneCompiler embed loads, same convention as practice.language. */
    language: string;
    /**
     * The remainder of the authored Exercise contract — previously dropped
     * silently by buildContentSessionContent()/toPreviewSessionContent()
     * before reaching this type (see the data contract audit's §15
     * finding). Not rendered anywhere yet — preserved so a future
     * evaluation/grading pipeline has something real to consume. All
     * optional since curated/generated fallback content never authors them.
     */
    scenario?: string;
    expectedBehaviour?: string;
    /** Written as statements checkable true/false — drives future AI-assisted evaluation. */
    evaluationCriteria?: string[];
    edgeCases?: string[];
    submissionInstructions?: string;
  };
  /** Which activities must be done before the session can be marked complete. */
  requiredActivities: ActivityKey[];
  /**
   * Subtle, optional line connecting this session's skill to the eventual
   * final project. No project system exists yet — this is just the model
   * leaving room for that relationship to be authored later.
   */
  projectConnection?: string;
  /**
   * How this session is delivered. Omitted (or format: "recorded") means the
   * existing pre-recorded video flow — every session behaves exactly as
   * before unless explicitly marked "live" here. Kept as a separate override
   * map (SESSION_DELIVERY below) rather than baked into SESSION_CONTENT, so a
   * session can be marked live before or independently of having curated
   * Learn content authored for it.
   */
  delivery?: SessionDelivery;
};

const SESSION_CONTENT: Record<string, SessionContent> = {
  // Prototype example — "HTML Forms" — used to demonstrate the Session
  // Workspace concept. Not tied to the real curriculum.
  "components-and-state": {
    objective: "By the end of this lesson you'll be able to build a working HTML form.",
    explanation: "",
    concepts: ["form", "input", "label", "type", "validation"],
    keyConcepts: [
      "The <form> element wraps all input fields.",
      "Each input should have a matching <label>.",
      "The type attribute controls what kind of input is collected.",
    ],
    examples: [
      "Example: <label>Name</label><input type=\"text\" name=\"name\" />",
      "Example: <input type=\"email\" name=\"email\" required />",
      "Example: <button type=\"submit\">Submit</button>",
    ],
    checkpoints: [
      {
        id: "components-and-state-checkpoint-1",
        timestampSeconds: 0,
        question: "Which HTML element is used to collect user input?",
        options: ["<form>", "<div>", "<section>", "<span>"],
        correctIndex: 0,
        feedback: "Right — <form> is the container every input, label, and submit button belongs inside.",
        required: true,
      },
    ],
    practice: {
      task: "Create a simple HTML registration form containing: Name, Email, Password, and a Submit button.",
      starterCode: "<form>\n  \n</form>",
      language: "html",
    },
    aiHelp: {
      suggestedPrompts: [
        "Explain this topic",
        "Explain more simply",
        "Give me an example",
        "Give me a hint",
        "Help me understand my mistake",
        "How would I ask AI to build this?",
        "Help me improve my prompt",
      ],
    },
    exercise: {
      objective: "Build a registration form independently.",
      requirements: ["Name", "Email", "Password", "Submit button", "Basic validation"],
      starterCode: "<!-- Build your registration form here -->\n<form>\n\n</form>",
      language: "html",
    },
    requiredActivities: ["learning", "videoCheck", "practice", "exercise"],
    projectConnection:
      "This concept will later be used when you build the user registration feature of your full-stack project.",
  },
};

// ---------------------------------------------------------------------------
// Live session delivery overrides.
//
// Most sessions are pre-recorded (the default). A small number — like an
// orientation/kickoff — can instead be scheduled as live. This is kept as a
// separate map (rather than a field inside SESSION_CONTENT) so marking a
// session live doesn't require it to already have curated Learn content.
// ---------------------------------------------------------------------------
const SESSION_DELIVERY: Record<string, SessionDelivery> = {
  "routing-and-forms": {
    format: "live",
    scheduledAt: "2026-08-25T10:00:00.000Z",
    durationMinutes: 60,
  },
};

export function getSessionDelivery(sessionId: string): SessionDelivery | undefined {
  return SESSION_DELIVERY[sessionId];
}

export type LiveSessionState = "upcoming" | "live" | "ended";

/** Pure function — given a live session's schedule and a point in time, which state is it in? */
export function getLiveSessionState(delivery: SessionDelivery, now: Date = new Date()): LiveSessionState {
  if (!delivery.scheduledAt) return "upcoming";
  const start = new Date(delivery.scheduledAt).getTime();
  const end = start + (delivery.durationMinutes ?? 60) * 60_000;
  const t = now.getTime();
  if (t < start) return "upcoming";
  if (t <= end) return "live";
  return "ended";
}

function buildDefaultSessionContent(sessionTitle: string, sessionDescription: string): SessionContent {
  // Generic fallback for sessions without curated content yet.
  return {
    objective: sessionDescription,
    explanation: "",
    concepts: [],
    keyConcepts: [sessionDescription],
    examples: [],
    checkpoints: [
      {
        id: "default-checkpoint",
        timestampSeconds: 0,
        question: `What is the main focus of ${sessionTitle}?`,
        options: ["Applying the concept", "Something unrelated", "A different topic", "None of the above"],
        correctIndex: 0,
        feedback: "That's the focus of this session.",
        required: true,
      },
    ],
    practice: {
      task: sessionDescription,
      starterCode: "// Write your solution here",
      language: "javascript",
    },
    aiHelp: {
      suggestedPrompts: ["Explain this topic", "Explain more simply", "Give me an example", "Give me a hint"],
    },
    exercise: {
      objective: `Apply what you learned in ${sessionTitle} independently.`,
      requirements: ["Apply the session concept independently"],
      language: "javascript",
    },
    requiredActivities: ["learning", "videoCheck", "practice", "exercise"],
  };
}

export function getSessionContent(sessionId: string, fallback: { title: string; description: string }): SessionContent {
  // Precedence: the real backend's canonical published-content resolution
  // (see backendPublishedContent.ts's header) first — this is now the only
  // published-content source; the Content Author/Reviewer workflow writes
  // through the same backend (authoredSessionApi.ts/contentReviewApi.ts),
  // so there is no longer a separate local-published-content layer to fall
  // back to here. Then the curated demo entry; then the generated fallback.
  // undefined (not fetched yet) and null (backend confirmed nothing
  // published) both fall through here exactly the same way.
  const backendOverride = getCachedBackendPublishedContent(sessionId);
  const base = backendOverride ?? SESSION_CONTENT[sessionId] ?? buildDefaultSessionContent(fallback.title, fallback.description);
  const delivery = getSessionDelivery(sessionId);
  if (!delivery) return base;

  // A live session has no pre-recorded video to quiz against, so "Video
  // Check" isn't a meaningful requirement for it — every other requirement
  // (Practice/Exercise) is unaffected.
  const requiredActivities =
    delivery.format === "live"
      ? base.requiredActivities.filter((a) => a !== "videoCheck")
      : base.requiredActivities;

  return { ...base, delivery, requiredActivities };
}
