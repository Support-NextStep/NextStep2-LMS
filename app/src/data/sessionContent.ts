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

import { getPublishedSessionContent } from "./publishedContent";

export type ActivityKey = "learning" | "videoCheck" | "practice" | "exercise";

export type VideoCheckpoint = {
  question: string;
  options: string[];
  correctIndex: number;
};

export type PracticeCheck = {
  label: string;
  passed: boolean;
};

export type AiHelpConfig = {
  quickPrompts: string[];
  replies: Record<string, string>;
  defaultReply: string;
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
  concepts: string[];
  keyConcepts: string[];
  examples: string[];
  videoCheckpoint: VideoCheckpoint;
  practice: {
    task: string;
    starterCode: string;
    /** Mock check results — a future version can swap this for a real per-language checker. */
    checklist: PracticeCheck[];
    /**
     * Which language this practice is written in — drives which OneCompiler
     * embed is loaded (see practiceExecution.ts). Kept as a plain string
     * rather than a closed union so new languages don't require a type
     * change here; unmapped values fall back to a sensible default in the
     * provider itself.
     */
    language: string;
  };
  aiHelp: AiHelpConfig;
  exercise: {
    objective: string;
    requirements: string[];
    /** Optional — populated into the OneCompiler embed via postMessage if present. */
    starterCode?: string;
    /** Drives which OneCompiler embed loads, same convention as practice.language. */
    language: string;
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
    videoCheckpoint: {
      question: "Which HTML element is used to collect user input?",
      options: ["<form>", "<div>", "<section>", "<span>"],
      correctIndex: 0,
    },
    practice: {
      task: "Create a simple HTML registration form containing: Name, Email, Password, and a Submit button.",
      starterCode: "<form>\n  \n</form>",
      checklist: [
        { label: "Form exists", passed: true },
        { label: "Name input exists", passed: true },
        { label: "Email input exists", passed: true },
        { label: "Password validation missing", passed: false },
      ],
      language: "html",
    },
    aiHelp: {
      quickPrompts: [
        "Explain this topic",
        "Explain more simply",
        "Give me an example",
        "Give me a hint",
        "Help me understand my mistake",
        "How would I ask AI to build this?",
        "Help me improve my prompt",
      ],
      replies: {
        "Explain this topic":
          "HTML forms collect input from users with elements like <input>, <label>, and <button>. Every field should have a label so people know what to enter.",
        "Explain more simply":
          "Think of a form like a paper form — each blank line is an input, and the label tells you what to write there.",
        "Give me an example":
          'For example: <label>Email</label><input type="email" name="email" /> connects the text "Email" to the input field.',
        "Give me a hint":
          "Check that every <input> has a matching <label> and the right type attribute — that's usually what's missing.",
        "Help me understand my mistake":
          "Your check flagged password validation — try adding type=\"password\" and a required attribute to that input.",
        "How would I ask AI to build this?":
          "Be specific: \"Write an HTML form with Name, Email, and Password fields, each with a label, and a Submit button.\" Clear requirements get better AI output.",
        "Help me improve my prompt":
          "Add constraints — mention accessibility (labels), input types, and validation, so the AI's answer actually matches what you need.",
      },
      defaultReply:
        "That's a great question! (This is a UI preview — AI responses aren't connected yet.)",
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
    concepts: [],
    keyConcepts: [sessionDescription],
    examples: [],
    videoCheckpoint: {
      question: `What is the main focus of ${sessionTitle}?`,
      options: ["Applying the concept", "Something unrelated", "A different topic", "None of the above"],
      correctIndex: 0,
    },
    practice: {
      task: sessionDescription,
      starterCode: "// Write your solution here",
      checklist: [{ label: "Task attempted", passed: true }],
      language: "javascript",
    },
    aiHelp: {
      quickPrompts: ["Explain this topic", "Explain more simply", "Give me an example", "Give me a hint"],
      replies: {},
      defaultReply:
        "That's a great question! (This is a UI preview — AI responses aren't connected yet.)",
    },
    exercise: {
      objective: `Apply what you learned in ${sessionTitle} independently.`,
      requirements: ["Apply the session concept independently"],
      language: "javascript",
    },
    requiredActivities: ["learning", "videoCheck", "practice", "exercise"],
  };
}

export function getSessionContent(
  sessionId: string,
  fallback: { title: string; description: string },
  courseId?: string,
  subjectId?: string
): SessionContent {
  const publishedOverride = courseId && subjectId ? getPublishedSessionContent(courseId, subjectId, sessionId) : null;
  const base = publishedOverride ?? SESSION_CONTENT[sessionId] ?? buildDefaultSessionContent(fallback.title, fallback.description);
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
