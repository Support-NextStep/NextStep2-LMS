import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "./Button";
import PracticeCodeEmbed from "./PracticeCodeEmbed";
import ExerciseCodeEmbed from "./ExerciseCodeEmbed";
import VideoCheckpointPlayer from "./VideoCheckpointPlayer";
import { getPracticeLanguageLabel, type CodeFile } from "../data/practiceExecution";
import type { CriterionResult, EvaluationDetail } from "../data/exerciseSubmissionsApi";
import {
  getLiveSessionState,
  type ActivityKey,
  type LiveSessionState,
  type SessionContent,
  type SessionDelivery,
} from "../data/sessionContent";
import { calculateSessionScore, type SessionActivitiesInput } from "../data/performance";
import { ApiError } from "../data/apiClient";
import type { TrackedActivityKey } from "../data/activityProgressApi";

// ---------------------------------------------------------------------------
// The actual Session Workspace UI — Learn / Video Check / Practice / Exercise
// / Complete, plus a persistent "Need Help?" AI assistance widget — shared
// verbatim between the real Student Session (SessionPage.tsx) and the
// Content Author/Reviewer's Draft Preview (ContentPreviewSession.tsx).
// Neither wrapper duplicates this UI; they only supply *where the content
// comes from* and *what happens on complete/submit*, via props.
//
// mode="student": every side effect (completeSession, recordSessionPerformance,
//   createSubmission) is real, wired up by the SessionPage.tsx wrapper.
// mode="preview": the wrapper passes no-op/in-memory versions of those same
//   callbacks — this component has no idea it's being previewed, it just
//   calls whatever callback it was given. That's what keeps preview
//   completely inert with respect to student records without this file
//   needing any "if preview" branches around persistence.
//
// STUDENT SESSION UI CLEANUP (see that slice's report):
//   - Practice is guided experimentation only — Self-Check and AI Hint were
//     removed from it. It's just task + starter code + the OneCompiler
//     editor (Run + output live inside that embed already).
//   - AI Help is no longer a third tab. Its content-authored data
//     (content.aiHelp — quickPrompts/replies/defaultReply, still authored by
//     the Content Team, still used by both this component's chat-reply logic
//     and by the Reviewer's read-only preview) is unchanged; only *how a
//     student reaches it* changed, from a tab to the floating "Need Help?"
//     widget rendered at the bottom of this component.
// ---------------------------------------------------------------------------

const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  learning: "Learning",
  videoCheck: "Video Check",
  practice: "Practice",
  exercise: "Exercise",
};

export type SubmissionSummary = {
  id: string;
  attemptNumber: number;
  submittedAt: string;
  evaluation?: { status: EvaluationDetail["status"]; overallScore: number | null } | null;
};

export type SessionWorkspaceProps = {
  mode: "student" | "preview";
  sessionId: string;
  content: SessionContent;
  courseTitle: string;
  subjectTitle: string;
  sessionTitle: string;
  sessionDescription: string;
  sessionNumber: number;
  totalSessions: number;
  progress: number;
  nextSessionId?: string;
  greetingName: string;
  initialSubmissions: SubmissionSummary[];
  /**
   * Server-Side Session Activity Progress slice — every Learning/Video
   * Check/Practice activity this student has already completed for this
   * session, per the real backend (see SessionPage.tsx). Restores
   * learningDone/videoCheckDone/practiceViewed's "done" state after a
   * refresh/logout-login/new device — see the sync effect below. Preview
   * never has any (always []), since nothing it does is persisted.
   */
  initialActivityProgress: TrackedActivityKey[];
  /**
   * Student Session Completion Persistence slice — this now calls the real
   * backend (see SessionPage.tsx) and its returned Promise only resolves
   * once completion is durably recorded server-side; it rejects (never
   * resolves) on a network failure or a backend-side rejection. See
   * handleCompleteSession below for how a rejection surfaces to the student.
   */
  onCompleteSession: (activities: SessionActivitiesInput) => Promise<void>;
  /**
   * Server-Side Session Activity Progress slice — persists one activity's
   * completion to the real backend (see SessionPage.tsx). Fired at most once
   * per activity per session mount, the moment that activity's existing,
   * unchanged local completion signal first becomes true (see the
   * persistence-triggering effects below) — never on a timer, never
   * per-tick during video playback. `answeredCheckpointIds` is only
   * meaningful for activityType="videoCheck". Failures are swallowed here
   * (fire-and-forget, matching this being a non-terminal, cosmetic signal —
   * unlike Complete Session, nothing in this component blocks or shows an
   * error on a failed activity-progress call; the worst case is simply that
   * a later Complete Session attempt correctly still sees it as incomplete).
   */
  onCompleteActivity: (activityType: TrackedActivityKey, payload?: { answeredCheckpointIds?: string[] }) => Promise<void>;
  onSubmitExercise: (files: CodeFile[], language: string) => Promise<SubmissionSummary>;
  /**
   * Student Exercise Evaluation UI — fetches one attempt's full result
   * (score/criteria/strengths/improvements/feedback). Only ever called for
   * a submission whose list entry already carries a truthy `evaluation`
   * (i.e. mode="student" — see the reset/poll effect below); the preview
   * wrapper's submissions never do, so this is never invoked there and can
   * safely be a stub.
   */
  onFetchEvaluation: (submissionId: string) => Promise<EvaluationDetail>;
  backHref: string;
  backLabel: string;
  getNextSessionHref: (nextSessionId: string) => string;
  exitHref: string;
  exitLabel: string;
  /** Rendered above the workspace — used by preview for the DRAFT banner. Never used by the student wrapper. */
  bannerSlot?: ReactNode;
};

/** Bounded polling while the latest attempt is PENDING/EVALUATING — a few seconds apart, stopping the moment a terminal status (EVALUATED/FAILED) is seen, and never running past MAX_EVALUATION_POLL_ATTEMPTS even if something is stuck server-side. */
const EVALUATION_POLL_INTERVAL_MS = 4000;
const MAX_EVALUATION_POLL_ATTEMPTS = 75; // ~5 minutes at the interval above

type ChatMessage = { id: number; role: "user" | "ai"; text: string };
type VideoState = "idle" | "playing" | "checkpoint" | "answered" | "finished";
type WorkspaceView = "practice" | "exercise" | "complete";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/**
 * Student Exercise Evaluation UI — one row per authored evaluation
 * criterion, exactly as returned by the evaluator (never modified or
 * reworded). Passed/failed is signaled by icon + label text as well as
 * color, never color alone.
 */
function CriterionRow({ criterion }: { criterion: CriterionResult }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-navy-500">{criterion.criterion}</p>
        <span className="shrink-0 text-xs font-semibold text-navy-500/60">{criterion.score}/100</span>
      </div>
      <p
        className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold ${
          criterion.passed ? "text-brand-600" : "text-error"
        }`}
      >
        {criterion.passed ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
        {criterion.passed ? "Passed" : "Needs improvement"}
      </p>
      {criterion.feedback && <p className="mt-1.5 text-xs leading-relaxed text-navy-500/60">{criterion.feedback}</p>}
    </li>
  );
}

/** The lightweight per-attempt status shown in "Exercise Attempts" — uses only the list endpoint's {status, overallScore}, never the full detail fetch (that's only fetched for the current/latest attempt — see the polling effect). */
function AttemptStatusBadge({ evaluation }: { evaluation: SubmissionSummary["evaluation"] }) {
  if (!evaluation) return <span className="text-xs font-medium text-navy-500/40">Submitted</span>;
  switch (evaluation.status) {
    case "PENDING":
      return <span className="text-xs font-medium text-navy-500/50">Queued</span>;
    case "EVALUATING":
      return <span className="text-xs font-medium text-navy-500/50">Evaluating&hellip;</span>;
    case "EVALUATED":
      return (
        <span className="inline-flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-500">{evaluation.overallScore ?? 0}/100</span>
          <span className="text-xs font-medium text-navy-500/40">Evaluated</span>
        </span>
      );
    case "FAILED":
      return <span className="text-xs font-medium text-error">Not evaluated</span>;
  }
}

/**
 * The full result for the current/latest attempt — the one place all of
 * PENDING/EVALUATING/EVALUATED/FAILED are rendered for a student. Never
 * shows provider/internal details (no failureReason text, no AI provider
 * name) — see EvaluationDetail's own doc comment for what's deliberately
 * not even fetched.
 */
function EvaluationStateBody({ detail, fallbackStatus }: { detail: EvaluationDetail | null; fallbackStatus: EvaluationDetail["status"] }) {
  const status = detail?.status ?? fallbackStatus;

  if (status === "PENDING") {
    return (
      <div className="flex items-center gap-3">
        <Spinner className="h-5 w-5 text-navy-500/40" />
        <div>
          <p className="text-sm font-semibold text-navy-500">Evaluation queued</p>
          <p className="text-xs text-navy-500/50">Your submission has been received and is waiting to be evaluated.</p>
        </div>
      </div>
    );
  }

  if (status === "EVALUATING") {
    return (
      <div className="flex items-center gap-3">
        <Spinner className="h-5 w-5 text-brand-500" />
        <p className="text-sm font-semibold text-navy-500">Evaluating your submission&hellip;</p>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div>
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-error">
          <XIcon className="h-4 w-4" />
          Evaluation could not be completed.
        </p>
        <p className="mt-1.5 text-xs text-navy-500/50">You can submit another attempt.</p>
      </div>
    );
  }

  // status === "EVALUATED" — detail may still be loading for a brief moment
  // right after a page reload, OR right after the student selects a
  // different (already-evaluated) attempt in "Exercise Attempts" — the list
  // already knows the status before the fresh per-attempt detail fetch
  // resolves. Show a quiet loading state rather than nothing, a crash, or
  // (critically) the PREVIOUSLY selected attempt's score/criteria.
  if (!detail) {
    return (
      <div className="flex items-center gap-3 text-navy-500/40">
        <Spinner className="h-4 w-4" />
        <p className="text-sm">Loading evaluation&hellip;</p>
      </div>
    );
  }

  const criteria = detail.criteriaResults ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-1.5">
        <p className="text-3xl font-bold text-navy-500">{detail.overallScore ?? 0}</p>
        <p className="text-sm font-medium text-navy-500/40">/ 100</p>
      </div>

      {criteria.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">Criteria</p>
          <ul className="mt-2 flex flex-col gap-2">
            {criteria.map((c, i) => (
              <CriterionRow key={`${i}-${c.criterion}`} criterion={c} />
            ))}
          </ul>
        </div>
      )}

      {detail.strengths.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">What you did well</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {detail.strengths.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-navy-500/70">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.improvements.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">What to improve</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {detail.improvements.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-navy-500/70">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.feedback && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">Feedback</p>
          <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-navy-500/70">{detail.feedback}</p>
        </div>
      )}

      <p className="text-xs text-navy-500/40">Evaluation generated with AI based on the exercise criteria.</p>
    </div>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18h6m-5.25 3h4.5M12 3a6 6 0 00-3.5 10.89c.47.34.75.9.75 1.49v.12a.5.5 0 00.5.5h4.5a.5.5 0 00.5-.5v-.12c0-.6.28-1.15.75-1.49A6 6 0 0012 3z"
      />
    </svg>
  );
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 ${className}`}>{children}</div>;
}

function formatScheduledAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The live-session equivalent of the recorded "Session Video" block. No real
 * video-conferencing integration exists yet — "Join Session" opens a mock
 * placeholder standing in for where that would embed, and "Mark as Attended"
 * is the live equivalent of finishing the recorded video.
 */
function LiveSessionBlock({
  delivery,
  state,
  joined,
  attended,
  onJoin,
  onMarkAttended,
}: {
  delivery: SessionDelivery;
  state: LiveSessionState;
  joined: boolean;
  attended: boolean;
  onJoin: () => void;
  onMarkAttended: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-1 text-xs font-semibold text-error">
          <span className="h-1.5 w-1.5 rounded-full bg-error" />
          Live Session
        </span>
        <span className="text-xs font-medium text-navy-500/50">
          {state === "upcoming" && "Upcoming"}
          {state === "live" && "Happening now"}
          {state === "ended" && "Ended"}
        </span>
      </div>

      <div className="mt-3 flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
        {delivery.scheduledAt && (
          <p className="text-sm font-medium text-navy-500">{formatScheduledAt(delivery.scheduledAt)}</p>
        )}

        {state === "upcoming" && (
          <>
            <p className="text-sm text-navy-500/60">
              This session hasn&apos;t started yet. Come back at the scheduled time to join.
            </p>
            <Button type="button" disabled className="!w-auto px-6">
              Join Session
            </Button>
          </>
        )}

        {state === "live" && !joined && (
          <>
            <p className="text-sm text-navy-500/60">This session is live now.</p>
            <Button type="button" className="!w-auto px-6" onClick={onJoin}>
              Join Session
            </Button>
          </>
        )}

        {state === "live" && joined && !attended && (
          <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-navy-500 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">You&apos;re in the session</p>
            <p className="text-sm text-white/70">This is a placeholder for where a real video call would be embedded.</p>
            <Button type="button" className="!w-auto px-6" onClick={onMarkAttended}>
              Mark as Attended
            </Button>
          </div>
        )}

        {attended && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50">
              <CheckIcon className="h-5 w-5 text-brand-500" />
            </div>
            <p className="text-sm font-medium text-navy-500/60">Attendance recorded</p>
          </div>
        )}

        {state === "ended" && !attended && (
          <>
            <p className="text-sm text-navy-500/60">
              This live session has ended. If you attended, you can still mark it complete.
            </p>
            <Button type="button" variant="secondary" className="!w-auto px-6" onClick={onMarkAttended}>
              Mark as Attended
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SessionWorkspace({
  mode,
  sessionId,
  content,
  courseTitle,
  subjectTitle,
  sessionTitle,
  sessionDescription,
  sessionNumber,
  totalSessions,
  progress,
  nextSessionId,
  greetingName,
  initialSubmissions,
  initialActivityProgress,
  onCompleteSession,
  onCompleteActivity,
  onSubmitExercise,
  onFetchEvaluation,
  backHref,
  backLabel,
  getNextSessionHref,
  exitHref,
  exitLabel,
  bannerSlot,
}: SessionWorkspaceProps) {
  const isPreview = mode === "preview";
  const navigate = useNavigate();

  const [videoState, setVideoState] = useState<VideoState>("idle");
  const [checkpointSeen, setCheckpointSeen] = useState(false);
  const [checkpointAnswer, setCheckpointAnswer] = useState<number | null>(null);

  // Real-video state (only relevant when content.video is set — see
  // hasRealVideo below). Owned here, not inside VideoCheckpointPlayer,
  // because completion/performance logic needs to read it.
  const [videoAnswers, setVideoAnswers] = useState<Record<string, boolean>>({});
  const [videoEnded, setVideoEnded] = useState(false);

  // Starts on "practice" directly — no separate landing/"Start Practice"
  // card. See the effect below: opening the Practice tab is what marks the
  // Practice activity viewed, so this also means Practice counts as opened
  // the moment the session loads (there is no longer a distinct "not yet
  // opened" landing state to sit in first).
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("practice");

  const [chat, setChat] = useState<ChatMessage[]>([
    { id: 0, role: "ai", text: "Hi! I'm your AI Learning Assistant. Ask me anything about this session." },
  ]);
  const [chatInput, setChatInput] = useState("");

  // Practice is guided experimentation, not evaluation — "completed" just
  // means the student opened Practice at least once, never a Self-Check
  // correctness signal (there is no more Self-Check). See handleCompleteSession.
  const [practiceViewed, setPracticeViewed] = useState(false);

  // The "Need Help?" floating widget's open/closed state — independent of
  // workspaceView, since it must stay reachable no matter which tab (or the
  // pre-tab default view, or the completion screen) is currently showing.
  const [helpOpen, setHelpOpen] = useState(false);

  // Student Session Completion Persistence slice — tracks the in-flight
  // backend call handleCompleteSession() below makes. completeSessionError
  // is shown next to the Complete Session button (same treatment as
  // exerciseSubmitError) rather than ever showing the completion screen for
  // a completion the backend didn't actually accept.
  const [completingSession, setCompletingSession] = useState(false);
  const [completeSessionError, setCompleteSessionError] = useState<string | null>(null);

  const [exerciseFiles, setExerciseFiles] = useState<CodeFile[]>([]);
  const [exerciseSubmitPhase, setExerciseSubmitPhase] = useState<"idle" | "confirming">("idle");
  const [exerciseSubmitError, setExerciseSubmitError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>(initialSubmissions);
  // The Exercise required-activity is "has the student successfully
  // submitted at least one attempt" — nothing about evaluation status.
  // Derived straight from `submissions` (the same backend-persisted history
  // the Exercise Attempts list renders) rather than a separate ephemeral
  // flag, so it's correct immediately after a fresh submit (setSubmissions
  // above), correct on first load once initialSubmissions arrives (the sync
  // effect below updates `submissions`), and correct after any
  // remount/refresh/navigation-away-and-back — all from one source of
  // truth, with no window where it can fall out of sync with what the
  // Attempts list itself shows. Deliberately independent of `evaluation`/
  // its status (PENDING/EVALUATING/EVALUATED/FAILED all count) — see
  // activityDone below.
  const exerciseSubmitted = submissions.length > 0;
  // Which attempt's evaluation is currently being viewed — distinct from
  // "the latest attempt": defaults to latest on load/after a fresh submit,
  // but a student can click any past attempt to view its own evaluation
  // without that selection being silently overridden back to latest (the
  // bug this state was introduced to fix — see the attempt-list buttons
  // below, and handleConfirmExerciseSubmit()). `null` means "not decided
  // yet" (before submissions has loaded) or "no submissions exist."
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  // The full result (score/criteria/strengths/improvements/feedback) for
  // whichever attempt is currently SELECTED (not necessarily the latest —
  // see selectedSubmissionId above); fetched/polled by the effect below.
  // Previous attempts' lightweight {status, overallScore} still live on
  // `submissions` itself (AttemptStatusBadge) — never overwritten by
  // another attempt's evaluation, since each is keyed by its own
  // submission id and this detail is always refetched fresh on selection.
  const [evaluationDetail, setEvaluationDetail] = useState<EvaluationDetail | null>(null);

  const [liveJoined, setLiveJoined] = useState(false);
  const [attended, setAttended] = useState(false);

  // Server-Side Session Activity Progress slice — Learning/Video Check/
  // Practice activities this student has ALREADY completed for this
  // session, per the real backend (initialActivityProgress, fetched by
  // SessionPage.tsx). ORed into learningDone/videoCheckDone/practiceDone
  // below alongside the existing, unchanged local-interaction-derived
  // signals — this is what makes "already completed" survive a refresh,
  // exactly mirroring the same pattern `exerciseSubmitted` already uses for
  // Exercise (submissions.length > 0, backend-sourced + locally-appended).
  const [persistedActivities, setPersistedActivities] = useState<Set<TrackedActivityKey>>(new Set());

  // Reset all local workspace state whenever a different session is opened.
  useEffect(() => {
    setVideoState("idle");
    setCheckpointSeen(false);
    setCheckpointAnswer(null);
    setVideoAnswers({});
    setVideoEnded(false);
    setWorkspaceView("practice");
    setChat([{ id: 0, role: "ai", text: "Hi! I'm your AI Learning Assistant. Ask me anything about this session." }]);
    setChatInput("");
    setHelpOpen(false);
    setPracticeViewed(false);
    setCompletingSession(false);
    setCompleteSessionError(null);
    setExerciseFiles([]);
    setExerciseSubmitPhase("idle");
    setExerciseSubmitError(null);
    setSubmissions(initialSubmissions);
    setSelectedSubmissionId(null);
    setEvaluationDetail(null);
    setLiveJoined(false);
    setAttended(false);
    setPersistedActivities(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // initialActivityProgress arrives from a real backend fetch (SessionPage.tsx),
  // which resolves *after* this component's first render for the session —
  // same timing story as initialSubmissions just below. Safe to just
  // overwrite `persistedActivities` wholesale on every change: this array's
  // reference only changes on a real session change or the parent's own
  // fetch resolving, never as a side effect of anything in this component.
  useEffect(() => {
    setPersistedActivities(new Set(initialActivityProgress));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialActivityProgress]);

  // initialSubmissions now arrives from a real backend fetch (SessionPage.tsx),
  // which resolves *after* this component's first render for the session —
  // the reset effect above only re-syncs `submissions` when sessionId itself
  // changes, so this effect re-syncs whenever the parent hands us a freshly-
  // fetched array. Safe against clobbering an optimistic local append (see
  // handleConfirmExerciseSubmit) because the parent never re-fetches after a
  // submit — initialSubmissions' reference only changes on a real session change.
  //
  // Defaults the viewed attempt to the latest one the first time history
  // arrives (selectedSubmissionId is still null at that point, from the
  // reset above) — but never overrides a selection the student already
  // made by clicking a past attempt.
  useEffect(() => {
    setSubmissions(initialSubmissions);
    setSelectedSubmissionId((prev) => prev ?? (initialSubmissions.length > 0 ? initialSubmissions[initialSubmissions.length - 1].id : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubmissions]);

  const latestSubmission = submissions.length > 0 ? submissions[submissions.length - 1] : null;
  const selectedSubmission = submissions.find((s) => s.id === selectedSubmissionId) ?? latestSubmission;

  // Bounded polling for the SELECTED attempt's evaluation (not necessarily
  // the latest — see selectedSubmissionId above) — fetches once immediately
  // (covers "already EVALUATED/FAILED from a page reload/reselection" in a
  // single request) and keeps polling only while the result is still
  // PENDING/EVALUATING, stopping the moment a terminal status is seen, when
  // the student selects a different attempt (cleanup below re-runs this
  // effect for the new id — the old attempt's polling loop is torn down,
  // never left running in the background), when the student leaves the
  // page, or after MAX_EVALUATION_POLL_ATTEMPTS — never forever, and never
  // more than one polling loop at a time. `evaluation` is only ever present
  // on a real (mode="student") submission — preview's fabricated summaries
  // carry none, so this never calls onFetchEvaluation in preview mode.
  useEffect(() => {
    setEvaluationDetail(null);
    const submissionId = selectedSubmission?.id;
    if (!submissionId || !selectedSubmission?.evaluation) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    async function poll() {
      if (cancelled) return;
      attempts += 1;
      try {
        const detail = await onFetchEvaluation(submissionId!);
        if (cancelled) return;
        setEvaluationDetail(detail);
        // Keep the "Exercise Attempts" list (driven by `submissions`, not
        // `evaluationDetail`) in sync as this attempt's status/score
        // changes — without this, the list would keep showing whatever
        // status the initial fetch/submit response had (e.g. "Queued")
        // even after this same polling loop discovers it's EVALUATED.
        setSubmissions((prev) =>
          prev.map((s) => (s.id === submissionId ? { ...s, evaluation: { status: detail.status, overallScore: detail.overallScore } } : s))
        );
        if ((detail.status === "PENDING" || detail.status === "EVALUATING") && attempts < MAX_EVALUATION_POLL_ATTEMPTS) {
          timer = setTimeout(poll, EVALUATION_POLL_INTERVAL_MS);
        }
      } catch {
        // A transient fetch error shouldn't spam retries forever — bounded
        // by the same attempts counter as a normal poll, then give up
        // quietly (the student can still reload to try again).
        if (!cancelled && attempts < MAX_EVALUATION_POLL_ATTEMPTS) {
          timer = setTimeout(poll, EVALUATION_POLL_INTERVAL_MS);
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubmission?.id]);

  useEffect(() => {
    if (videoState !== "playing") return;
    const timer = setTimeout(() => {
      // A session with a video but no authored checkpoints (or none marked
      // included) has nothing to pause for — go straight to finished rather
      // than showing an empty checkpoint card.
      setVideoState(checkpointSeen || content.checkpoints.length === 0 ? "finished" : "checkpoint");
    }, 1400);
    return () => clearTimeout(timer);
  }, [videoState, checkpointSeen, content.checkpoints.length]);

  // Opening Practice at all is the only "completion" signal now that
  // Self-Check is gone — deliberately not tied to running code or any
  // correctness check (see the file header note on the Practice cleanup).
  useEffect(() => {
    if (workspaceView === "practice") setPracticeViewed(true);
  }, [workspaceView]);

  function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userId = Date.now();
    setChat((c) => [...c, { id: userId, role: "user", text: trimmed }]);
    setChatInput("");
    const reply = `I am a future AI Tutor. Real conversational responses are not yet integrated, but I've received your message: "${trimmed}"`;
    setTimeout(() => {
      setChat((c) => [...c, { id: userId + 1, role: "ai", text: reply }]);
    }, 500);
  }

  function reviewSession() {
    setWorkspaceView("practice");
    setVideoState("idle");
  }

  async function handleConfirmExerciseSubmit() {
    const filesToSubmit: CodeFile[] =
      exerciseFiles.length > 0
        ? exerciseFiles
        : content.exercise.starterCode
        ? [{ name: "starter", content: content.exercise.starterCode }]
        : [];

    setExerciseSubmitError(null);
    try {
      const submission = await onSubmitExercise(filesToSubmit, content.exercise.language);
      // No separate transient "submitted!" toast — the persistent "Your
      // Submission" block below picks this submission up immediately and
      // shows exactly the "received -> queued -> evaluating -> evaluated"
      // progression itself, via the polling effect above. A fresh submit
      // always takes over the selection (even if the student was
      // currently viewing an older attempt) — clearing evaluationDetail in
      // the same batch avoids ever flashing the previously-selected
      // attempt's result under the new attempt's heading for a frame.
      setSubmissions((prev) => [...prev, submission]);
      setSelectedSubmissionId(submission.id);
      setEvaluationDetail(null);
      setExerciseSubmitPhase("idle");
    } catch (err) {
      // Stay in "confirming" so Submit is one click away again, rather than
      // silently dropping the student back to the plain "Submit Exercise"
      // button as if nothing happened.
      setExerciseSubmitError(err instanceof Error ? err.message : "Couldn't submit your exercise. Please try again.");
    }
  }

  // Used only by the no-video mock-playback fallback below (content.video
  // absent) — the real-video path's checkpoint state lives in
  // VideoCheckpointPlayer/useVideoCheckpoints and is reported up via
  // videoAnswers/videoEnded instead. content.checkpoints is always an array
  // now (possibly empty), never the old singular field.
  const activeCheckpoint = content.checkpoints[0];
  const checkpointCorrect = activeCheckpoint != null && checkpointAnswer === activeCheckpoint.correctIndex;

  const isLive = content.delivery?.format === "live";
  const liveState = isLive && content.delivery ? getLiveSessionState(content.delivery) : null;
  const hasRealVideo = Boolean(content.video);
  const requiredCheckpoints = content.checkpoints.filter((c) => c.required);

  // Unified completion signals — branch once, here, on hasRealVideo instead
  // of scattering "if there's a real video" checks through every place that
  // needs to know whether the lesson/video-check is done. See
  // NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §J: reuse SessionActivitiesInput
  // verbatim, "completed" = every required checkpoint answered, "correct" =
  // every required checkpoint answered correctly (null if none required).
  //
  // "Locally" here means "derived purely from this mount's own interaction"
  // — exactly the same rule as before this slice, completely unchanged.
  // Server-Side Session Activity Progress slice: the actually-used
  // learningDone/videoCheckDone below also OR in persistedActivities (see
  // above), so an activity already completed in an earlier visit still
  // reads as done after a refresh — without that OR, these would silently
  // regress to "incomplete" on every fresh mount. The *Locally variants are
  // kept separate specifically to drive the persistence-triggering effects
  // further below: they must fire only on a genuine NEW local completion,
  // never merely because the persisted flag caught up asynchronously.
  const learningDoneLocally = isLive ? attended : hasRealVideo ? videoEnded : videoState === "finished";
  const videoCheckDoneLocally = hasRealVideo ? requiredCheckpoints.every((c) => videoAnswers[c.id] !== undefined) : checkpointSeen;
  const learningDone = learningDoneLocally || persistedActivities.has("learning");
  const videoCheckDone = videoCheckDoneLocally || persistedActivities.has("videoCheck");
  const practiceDone = practiceViewed || persistedActivities.has("practice");
  const videoCheckCorrect = hasRealVideo
    ? requiredCheckpoints.length === 0
      ? null
      : requiredCheckpoints.every((c) => videoAnswers[c.id] === true)
    : checkpointSeen
    ? checkpointCorrect
    : null;

  const handleVideoEnded = useCallback(() => setVideoEnded(true), []);
  const handleVideoAnswersChange = useCallback((answers: Record<string, boolean>) => setVideoAnswers(answers), []);

  // Server-Side Session Activity Progress slice — persists each activity to
  // the real backend at most once per genuine new local completion (never
  // re-fired just because persistedActivities caught up, and never on a
  // timer/per-tick during playback — see onCompleteActivity's own doc
  // comment on SessionWorkspaceProps). Fire-and-forget: a failure here is
  // not shown to the student directly, since this is a non-terminal,
  // cosmetic signal — Complete Session (which DOES surface errors) is the
  // one place a real rejection actually matters, and it independently
  // re-checks the backend's own StudentActivityProgress rows regardless of
  // what this component believes locally.
  useEffect(() => {
    if (learningDoneLocally) onCompleteActivity("learning").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningDoneLocally]);

  useEffect(() => {
    if (!videoCheckDoneLocally) return;
    // The real video player tracks answers per checkpoint id (videoAnswers);
    // the no-video mock fallback only ever has one single checkpoint
    // (content.checkpoints[0], tracked by the simpler checkpointSeen flag —
    // see activeCheckpoint above), so its answered-id list is just that one
    // checkpoint's own id once seen.
    const answeredCheckpointIds = hasRealVideo ? Object.keys(videoAnswers) : activeCheckpoint ? [activeCheckpoint.id] : [];
    onCompleteActivity("videoCheck", { answeredCheckpointIds }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoCheckDoneLocally]);

  useEffect(() => {
    if (practiceViewed) onCompleteActivity("practice").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceViewed]);

  // Single source of truth for both the persisted performance record and the
  // on-screen Complete-screen percentage — see
  // NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's Performance
  // unification cleanup. Practice never contributes a score (completion-only
  // — Self-Check was retired); only Video Check currently can. Both readers
  // below call calculateSessionScore() on this exact object, so they can
  // never disagree.
  const activities: SessionActivitiesInput = {
    learning: { completed: learningDone },
    videoCheck: { completed: videoCheckDone, correct: videoCheckCorrect },
    practice: { completed: practiceDone },
    exercise: { completed: exerciseSubmitted },
  };
  const performanceScore = calculateSessionScore(activities);

  // Student Session Completion Persistence slice: onCompleteSession now
  // calls the real backend and only resolves once completion is durably
  // recorded there — this only shows the completion screen AFTER that
  // succeeds, never optimistically. A rejection (network failure, or the
  // backend's own validation, e.g. a missing required Exercise submission)
  // surfaces as completeSessionError instead, exactly like
  // exerciseSubmitError above; the session stays on its current view so the
  // student can retry.
  async function handleCompleteSession() {
    setCompleteSessionError(null);
    setCompletingSession(true);
    try {
      await onCompleteSession(activities);
      setWorkspaceView("complete");
    } catch (err) {
      // Only an ApiError carries a real, backend-authored rejection reason
      // (e.g. "this session requires an Exercise submission first") worth
      // showing verbatim — anything else (a network failure, an aborted
      // request, an unreachable server) surfaces the same generic, honest
      // message rather than a raw browser/fetch error string like "Failed
      // to fetch".
      setCompleteSessionError(
        err instanceof ApiError ? err.message : "Unable to save your session completion. Please try again."
      );
    } finally {
      setCompletingSession(false);
    }
  }

  const activityDone: Record<ActivityKey, boolean> = {
    learning: learningDone,
    videoCheck: videoCheckDone,
    practice: practiceDone,
    exercise: exerciseSubmitted,
  };
  const requirements = content.requiredActivities.map((key) => ({
    key,
    label: ACTIVITY_LABEL[key],
    done: activityDone[key],
  }));
  const isSessionReady = requirements.every((r) => r.done);

  return (
    <div className="mx-auto flex flex-col gap-6">
      {bannerSlot}

      {/* Header */}
      <div>
        <p className="text-sm font-medium text-navy-500/50">
          {subjectTitle} &middot; Session {sessionNumber} of {totalSessions}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-500 sm:text-3xl">{sessionTitle}</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-navy-500/60">{sessionDescription}</p>

        <div className="mt-5 max-w-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-navy-500/60">Progress</span>
            <span className="font-semibold text-brand-500">{progress}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* ONE SESSION WORKSPACE — Learn (left) / Do (right) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* LEFT — LEARN */}
        <div className="flex flex-col gap-5">
          <SectionCard>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-500">Learn</h2>
              {isLive
                ? attended && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                      <CheckIcon className="h-3.5 w-3.5" />
                      Attended
                    </span>
                  )
                : learningDone && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                      <CheckIcon className="h-3.5 w-3.5" />
                      Lesson watched
                    </span>
                  )}
            </div>

            {isLive && content.delivery && liveState ? (
              <LiveSessionBlock
                delivery={content.delivery}
                state={liveState}
                joined={liveJoined}
                attended={attended}
                onJoin={() => setLiveJoined(true)}
                onMarkAttended={() => setAttended(true)}
              />
            ) : content.video ? (
              // The real YouTube player + sequential checkpoint playback —
              // see NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §E/F/G/K and
              // VideoCheckpointPlayer.tsx. `key={sessionId}` fully remounts
              // this (fresh player, fresh checkpoint state) whenever a
              // different session is opened, rather than resetting an
              // existing instance in place — see useVideoCheckpoints.ts's
              // header comment.
              <VideoCheckpointPlayer
                key={sessionId}
                video={content.video}
                checkpoints={content.checkpoints}
                onEnded={handleVideoEnded}
                onAnswersChange={handleVideoAnswersChange}
              />
            ) : isPreview ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm font-medium text-navy-500">No video configured for this session.</p>
                <p className="text-xs text-navy-500/50">Video is recommended but not required.</p>
              </div>
            ) : (
              <>
                <p className="mt-4 text-sm font-semibold text-navy-500">Session Video</p>
                <div
                  className={`relative mt-2 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 ${
                    videoState === "checkpoint" || videoState === "answered" ? "min-h-[16rem]" : "aspect-video overflow-hidden"
                  }`}
                >
                  {videoState === "idle" && (
                    <button
                      type="button"
                      aria-label="Play session video"
                      onClick={() => setVideoState("playing")}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm transition-colors hover:bg-brand-600"
                    >
                      <PlayIcon className="ml-1 h-6 w-6" />
                    </button>
                  )}

                  {videoState === "playing" && (
                    <div className="flex flex-col items-center gap-2 text-navy-500/50">
                      <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <p className="text-sm font-medium">Lesson playing&hellip;</p>
                    </div>
                  )}

                  {/* activeCheckpoint is guaranteed non-null whenever videoState reaches
                      "checkpoint"/"answered" (the timer above only transitions here when
                      content.checkpoints is non-empty) — the check below is TS narrowing,
                      not a real runtime possibility. */}
                  {activeCheckpoint && (videoState === "checkpoint" || videoState === "answered") && (
                    <div className="flex w-full flex-col gap-4 rounded-xl bg-navy-500 p-5 sm:p-6">
                      <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Quick Check</p>
                      <p className="font-medium text-white">{activeCheckpoint.question}</p>

                      {videoState === "checkpoint" && (
                        <div className="flex flex-col gap-2">
                          {activeCheckpoint.options.map((option, i) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setCheckpointAnswer(i);
                                setCheckpointSeen(true);
                                setVideoState("answered");
                              }}
                              className="rounded-lg border border-white/20 bg-white/5 px-3.5 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/15"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}

                      {videoState === "answered" && (
                        <div className="flex flex-col gap-4">
                          <p
                            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                              checkpointCorrect ? "text-brand-300" : "text-white"
                            }`}
                          >
                            {checkpointCorrect ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                            {checkpointCorrect ? "Correct!" : `Not quite — the answer is ${activeCheckpoint.options[activeCheckpoint.correctIndex]}.`}
                          </p>
                          <Button type="button" className="!w-auto self-start px-6" onClick={() => setVideoState("playing")}>
                            Continue Video
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {videoState === "finished" && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50">
                        <CheckIcon className="h-5 w-5 text-brand-500" />
                      </div>
                      <p className="text-sm font-medium text-navy-500/60">Lesson complete</p>
                      <button
                        type="button"
                        onClick={() => setVideoState("idle")}
                        className="text-sm font-semibold text-brand-500 hover:text-brand-600"
                      >
                        Watch Again
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard>
            <h3 className="text-lg font-bold text-navy-500">About this lesson</h3>
            
            <p className="mt-4 text-sm font-semibold text-navy-500">Learning Objective</p>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-500/60">{content.objective}</p>

            {content.explanation && (
              <>
                <p className="mt-5 text-sm font-semibold text-navy-500">Explanation</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-navy-500/60">
                  {content.explanation}
                </p>
              </>
            )}

            {content.keyConcepts.length > 0 && (
              <>
                <p className="mt-5 text-sm font-semibold text-navy-500">Key Concepts</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {content.keyConcepts.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-navy-500/70">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {content.examples.length > 0 && (
              <>
                <p className="mt-5 text-sm font-semibold text-navy-500">Examples</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {content.examples.map((item) => (
                    <li
                      key={item}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs text-navy-500/70"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>
        </div>

        {/* RIGHT — DO */}
        <div className="lg:sticky lg:top-24">
          <SectionCard className="!p-0">
            <div className="flex flex-wrap gap-1 border-b border-slate-100 px-6 py-4 sm:px-8">
              {(
                [
                  { key: "practice", label: "Practice" },
                  { key: "exercise", label: "Exercise" },
                ] as { key: WorkspaceView; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setWorkspaceView(tab.key)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    workspaceView === tab.key ? "bg-brand-500 text-white" : "text-navy-500/60 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6 sm:p-8">
              {workspaceView === "practice" && (
                <div>
                  <h2 className="text-lg font-bold text-navy-500">Practice</h2>
                  <p className="mt-1.5 text-sm text-navy-500/60">Try what you just learned.</p>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-brand-50/40 p-4">
                    <p className="text-sm font-semibold text-navy-500">Task</p>
                    <p className="mt-1.5 text-sm text-navy-500/70">{content.practice.task}</p>
                  </div>

                  {content.practice.starterCode && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">
                        Starter code — copy this into the editor below to begin
                      </p>
                      <pre className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-navy-500 px-4 py-3 font-mono text-xs text-white">
                        {content.practice.starterCode}
                      </pre>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy-500">Code Editor</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-500/50">
                      {getPracticeLanguageLabel(content.practice.language)}
                    </span>
                  </div>
                  <PracticeCodeEmbed language={content.practice.language} />
                  <p className="mt-2 text-xs text-navy-500/40">
                    Write and run your code above — powered by OneCompiler. Output appears in the same panel.
                  </p>

                  {content.projectConnection && (
                    <p className="mt-4 flex items-start gap-1.5 text-xs text-navy-500/40">
                      <ArrowIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {content.projectConnection}
                    </p>
                  )}
                </div>
              )}

              {workspaceView === "exercise" && (
                <div>
                  <h2 className="text-lg font-bold text-navy-500">Exercise</h2>
                  <p className="mt-1.5 text-sm text-navy-500/60">
                    Now apply the concept independently — no checklist or hints this time.
                  </p>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-brand-50/40 p-4">
                    <p className="text-sm font-semibold text-navy-500">Objective</p>
                    <p className="mt-1.5 text-sm text-navy-500/70">{content.exercise.objective}</p>
                  </div>

                  <p className="mt-5 text-sm font-semibold text-navy-500">Requirements</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {content.exercise.requirements.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-navy-500/70">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center gap-2">
                    <p className="text-sm font-semibold text-navy-500">Code Editor</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-500/50">
                      {getPracticeLanguageLabel(content.exercise.language)}
                    </span>
                  </div>
                  <ExerciseCodeEmbed
                    language={content.exercise.language}
                    starterCode={content.exercise.starterCode}
                    onCodeChange={setExerciseFiles}
                  />
                  <p className="mt-2 text-xs text-navy-500/40">
                    Write and run your solution above — powered by OneCompiler. Your code is captured automatically
                    as you write it.
                  </p>

                  {isPreview && (
                    <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-navy-500/60">
                      Preview Mode — submissions here are simulated and will not create a student record.
                    </p>
                  )}

                  {exerciseSubmitPhase === "confirming" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <p className="text-sm font-semibold text-navy-500">Submit Exercise</p>
                      <p className="mt-1.5 text-sm text-navy-500/70">
                        Your current code will be submitted as Attempt #{submissions.length + 1}.
                      </p>
                      <p className="mt-1 text-xs text-navy-500/50">You can continue working after submission.</p>
                      {exerciseSubmitError && (
                        <p className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">
                          {exerciseSubmitError}
                        </p>
                      )}
                      <div className="mt-3 flex gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="!w-auto px-6"
                          onClick={() => {
                            setExerciseSubmitError(null);
                            setExerciseSubmitPhase("idle");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button type="button" className="!w-auto px-6" onClick={handleConfirmExerciseSubmit}>
                          Submit
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" className="mt-4 !w-auto px-6" onClick={() => setExerciseSubmitPhase("confirming")}>
                      {submissions.length > 0 ? "Submit Another Attempt" : "Submit Exercise"}
                    </Button>
                  )}

                  {/* Your Submission — the SELECTED attempt's evaluation
                      (received -> queued -> evaluating -> evaluated/failed),
                      driven by the polling effect above. Defaults to the
                      latest attempt, but a student can click any attempt
                      below to view its own result instead — see
                      selectedSubmissionId. Never shown in preview
                      (fabricated preview submissions carry no `evaluation`,
                      so this block never renders there). */}
                  {selectedSubmission && selectedSubmission.evaluation && (
                    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-5 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">Your Submission</p>
                        <p className="text-sm font-semibold text-navy-500">Attempt #{selectedSubmission.attemptNumber}</p>
                      </div>
                      <div className="p-5">
                        <EvaluationStateBody detail={evaluationDetail} fallbackStatus={selectedSubmission.evaluation.status} />
                      </div>
                    </div>
                  )}

                  {submissions.length > 0 && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">Exercise Attempts</p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {submissions.map((s) => {
                          const isSelected = s.id === selectedSubmission?.id;
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isSelected) return;
                                  // Clear the previous attempt's detail in
                                  // the same batch as the selection change
                                  // so its result is never shown — even
                                  // for a single frame — under the newly
                                  // selected attempt's heading while the
                                  // fresh fetch is in flight (the polling
                                  // effect's own reset would otherwise only
                                  // apply on its next run, after this
                                  // render commits).
                                  setSelectedSubmissionId(s.id);
                                  setEvaluationDetail(null);
                                }}
                                aria-current={isSelected ? "true" : undefined}
                                className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                                  isSelected ? "border-brand-200 bg-brand-50/40" : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5 font-medium text-navy-500">
                                  Attempt #{s.attemptNumber}
                                  {isSelected && <span className="text-xs font-semibold text-brand-600">(viewing)</span>}
                                </span>
                                <AttemptStatusBadge evaluation={s.evaluation} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {content.projectConnection && (
                    <p className="mt-4 flex items-start gap-1.5 text-xs text-navy-500/40">
                      <ArrowIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {content.projectConnection}
                    </p>
                  )}
                </div>
              )}

              {workspaceView === "complete" && (
                <div>
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                      <CheckIcon className="h-7 w-7 text-brand-500" />
                    </div>
                    <h2 className="mt-4 text-xl font-bold text-navy-500">Session Complete</h2>
                    <p className="mt-1 text-sm text-navy-500/60">Nice progress{greetingName ? `, ${greetingName}` : ""}!</p>
                    {isPreview && (
                      <p className="mt-1.5 text-xs font-medium text-navy-500/40">
                        Preview only — no student progress or performance record was created.
                      </p>
                    )}
                    {!nextSessionId && (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                        <CheckIcon className="h-3.5 w-3.5" />
                        You&apos;ve completed {subjectTitle}!
                      </p>
                    )}

                    {performanceScore !== null ? (
                      <p className="mt-5 text-2xl font-bold text-brand-500">{performanceScore}%</p>
                    ) : (
                      <p className="mt-5 text-2xl font-bold text-navy-500/40">Not scored yet</p>
                    )}
                    <p className="text-xs font-medium uppercase tracking-wide text-navy-500/50">Performance</p>
                  </div>

                  <div className="mt-6 flex flex-col gap-2 text-sm">
                    {requirements.map((req) => (
                      <div key={req.key} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                        <span className="text-navy-500/60">{req.label}</span>
                        <span className="inline-flex items-center gap-1.5 font-medium text-brand-600">
                          <CheckIcon className="h-3.5 w-3.5" />
                          {req.key === "videoCheck" ? (videoCheckCorrect ? "Correct" : "Attempted") : "Completed"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-navy-500">What you did well</p>
                      <p className="mt-1.5 text-sm text-navy-500/60">Good understanding of the core concept.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-navy-500">What to improve</p>
                      <p className="mt-1.5 text-sm text-navy-500/60">Revisit the Video Check question if anything felt uncertain.</p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {nextSessionId ? (
                      <Button type="button" className="!w-auto px-6" onClick={() => navigate(getNextSessionHref(nextSessionId))}>
                        Continue to Next Session
                      </Button>
                    ) : (
                      <Button type="button" className="!w-auto px-6" onClick={() => navigate(exitHref)}>
                        {exitLabel}
                      </Button>
                    )}
                    <Button type="button" variant="secondary" className="!w-auto px-6" onClick={reviewSession}>
                      Review Session
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {workspaceView !== "complete" && (
              <div className="flex flex-col gap-2.5 border-t border-slate-100 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                {completeSessionError ? (
                  <p className="rounded-lg bg-error/10 px-3 py-2 text-xs font-medium text-error">{completeSessionError}</p>
                ) : isSessionReady ? (
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-500/50">
                    <CheckIcon className="h-3.5 w-3.5 text-brand-500" />
                    You&apos;re ready to complete this session.
                  </p>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-300"
                        style={{ width: `${(requirements.filter((r) => r.done).length / requirements.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-navy-500/35">
                      Still building this session
                      {requirements.some((r) => !r.done) && (
                        <> &mdash; {requirements.filter((r) => !r.done).map((r) => r.label).join(", ")} left</>
                      )}
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  variant={isSessionReady ? "primary" : "secondary"}
                  disabled={!isSessionReady || completingSession}
                  className="!w-auto px-6 sm:ml-auto"
                  onClick={handleCompleteSession}
                >
                  {completingSession ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="h-4 w-4" />
                      Saving&hellip;
                    </span>
                  ) : (
                    <>Complete Session &rarr;</>
                  )}
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <div>
        <Link to={backHref} className="text-sm font-semibold text-brand-500 hover:text-brand-600">
          &larr; {backLabel}
        </Link>
      </div>

      {/* Persistent "Need Help?" widget — AI Help's global contextual entry
          point (see the file header note). Fixed-position so it stays
          reachable while learning, practicing, or working the exercise,
          without occupying any permanent space in the flow above. */}
      {content.aiHelp && (
        <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
        {helpOpen && (
          <div
            role="dialog"
            aria-label="Need Help"
            className="flex max-h-[70vh] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-navy-500">Need Help?</p>
              <button
                type="button"
                aria-label="Close help"
                onClick={() => setHelpOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-navy-500/50 hover:bg-slate-50 hover:text-navy-500"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-xs text-navy-500/50">
                {courseTitle} &rsaquo; {subjectTitle} &rsaquo; <span className="font-medium text-navy-500/70">{sessionTitle}</span>
              </p>
              {content.concepts.length > 0 && (
                <p className="mt-1.5 text-xs text-navy-500/40">Concepts: {content.concepts.join(", ")}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {content.aiHelp.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendChat(prompt)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-navy-500/70 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex max-h-48 flex-col gap-2.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                {chat.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user" ? "ml-auto bg-brand-500 text-white" : "border border-slate-200 bg-white text-navy-500/80"
                    }`}
                  >
                    {m.text}
                  </div>
                ))}
              </div>

              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat(chatInput);
                }}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask something..."
                  aria-label="Ask something about this session"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
                <Button type="submit" className="shrink-0 basis-auto !w-auto px-4">
                  Ask
                </Button>
              </form>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          className="flex items-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-brand-600"
        >
          <LightbulbIcon className="h-4 w-4" />
          Need Help?
        </button>
      </div>
      )}
    </div>
  );
}
