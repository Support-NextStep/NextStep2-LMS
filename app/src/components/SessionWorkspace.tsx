import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "./Button";
import PracticeCodeEmbed from "./PracticeCodeEmbed";
import ExerciseCodeEmbed from "./ExerciseCodeEmbed";
import VideoCheckpointPlayer from "./VideoCheckpointPlayer";
import { getPracticeLanguageLabel, type CodeFile } from "../data/practiceExecution";
import {
  getLiveSessionState,
  type ActivityKey,
  type LiveSessionState,
  type SessionContent,
  type SessionDelivery,
} from "../data/sessionContent";
import { calculateSessionScore, type SessionActivitiesInput } from "../data/performance";

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

export type SubmissionSummary = { id: string; attemptNumber: number; submittedAt: string };

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
  onCompleteSession: (activities: SessionActivitiesInput) => void;
  onSubmitExercise: (files: CodeFile[], language: string) => Promise<SubmissionSummary>;
  backHref: string;
  backLabel: string;
  getNextSessionHref: (nextSessionId: string) => string;
  exitHref: string;
  exitLabel: string;
  /** Rendered above the workspace — used by preview for the DRAFT banner. Never used by the student wrapper. */
  bannerSlot?: ReactNode;
};

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
  onCompleteSession,
  onSubmitExercise,
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

  const [exerciseSubmitted, setExerciseSubmitted] = useState(false);
  const [exerciseFiles, setExerciseFiles] = useState<CodeFile[]>([]);
  const [exerciseSubmitPhase, setExerciseSubmitPhase] = useState<"idle" | "confirming" | "success">("idle");
  const [exerciseSubmitError, setExerciseSubmitError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>(initialSubmissions);
  const [lastSubmission, setLastSubmission] = useState<SubmissionSummary | null>(null);

  const [liveJoined, setLiveJoined] = useState(false);
  const [attended, setAttended] = useState(false);

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
    setExerciseSubmitted(false);
    setExerciseFiles([]);
    setExerciseSubmitPhase("idle");
    setExerciseSubmitError(null);
    setLastSubmission(null);
    setSubmissions(initialSubmissions);
    setLiveJoined(false);
    setAttended(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // initialSubmissions now arrives from a real backend fetch (SessionPage.tsx),
  // which resolves *after* this component's first render for the session —
  // the reset effect above only re-syncs `submissions` when sessionId itself
  // changes, so this effect re-syncs whenever the parent hands us a freshly-
  // fetched array. Safe against clobbering an optimistic local append (see
  // handleConfirmExerciseSubmit) because the parent never re-fetches after a
  // submit — initialSubmissions' reference only changes on a real session change.
  useEffect(() => {
    setSubmissions(initialSubmissions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubmissions]);

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
      setSubmissions((prev) => [...prev, submission]);
      setLastSubmission(submission);
      setExerciseSubmitted(true);
      setExerciseSubmitPhase("success");
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
  const learningDone = isLive ? attended : hasRealVideo ? videoEnded : videoState === "finished";
  const videoCheckDone = hasRealVideo ? requiredCheckpoints.every((c) => videoAnswers[c.id] !== undefined) : checkpointSeen;
  const videoCheckCorrect = hasRealVideo
    ? requiredCheckpoints.length === 0
      ? null
      : requiredCheckpoints.every((c) => videoAnswers[c.id] === true)
    : checkpointSeen
    ? checkpointCorrect
    : null;

  const handleVideoEnded = useCallback(() => setVideoEnded(true), []);
  const handleVideoAnswersChange = useCallback((answers: Record<string, boolean>) => setVideoAnswers(answers), []);

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
    practice: { completed: practiceViewed },
    exercise: { completed: exerciseSubmitted },
  };
  const performanceScore = calculateSessionScore(activities);

  function handleCompleteSession() {
    onCompleteSession(activities);
    setWorkspaceView("complete");
  }

  const activityDone: Record<ActivityKey, boolean> = {
    learning: learningDone,
    videoCheck: videoCheckDone,
    practice: practiceViewed,
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

                  {exerciseSubmitPhase === "success" && lastSubmission ? (
                    <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-5">
                      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                        <CheckIcon className="h-4 w-4" />
                        Exercise Submitted
                      </p>
                      <p className="mt-1.5 text-sm text-navy-500/70">
                        Attempt #{lastSubmission.attemptNumber} submitted successfully.
                      </p>
                      <p className="mt-1 text-xs text-navy-500/50">
                        {isPreview
                          ? "This was a preview submission — no student record was created."
                          : "Your submission has been recorded. This exercise has not been automatically graded yet."}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-3 !w-auto px-6"
                        onClick={() => setExerciseSubmitPhase("idle")}
                      >
                        Continue
                      </Button>
                    </div>
                  ) : exerciseSubmitPhase === "confirming" ? (
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
                      Submit Exercise
                    </Button>
                  )}

                  {submissions.length > 0 && exerciseSubmitPhase === "idle" && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">
                        Previous submissions
                      </p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {submissions.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm"
                          >
                            <span className="font-medium text-navy-500">Attempt #{s.attemptNumber}</span>
                            <span className="text-xs text-navy-500/50">
                              {new Date(s.submittedAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </li>
                        ))}
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
                    <p className="mt-1 text-sm text-navy-500/60">Nice progress, {greetingName}!</p>
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
                {isSessionReady ? (
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
                  disabled={!isSessionReady}
                  className="!w-auto px-6 sm:ml-auto"
                  onClick={handleCompleteSession}
                >
                  Complete Session &rarr;
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
