import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "./Button";
import PracticeCodeEmbed from "./PracticeCodeEmbed";
import ExerciseCodeEmbed from "./ExerciseCodeEmbed";
import { getPracticeLanguageLabel, type CodeFile } from "../data/practiceExecution";
import {
  getLiveSessionState,
  type ActivityKey,
  type LiveSessionState,
  type SessionContent,
  type SessionDelivery,
} from "../data/sessionContent";
import type { SessionActivitiesInput } from "../data/performance";

// ---------------------------------------------------------------------------
// The actual Session Workspace UI — Learn / Video Check / Practice / AI Help
// / Exercise / Complete — shared verbatim between the real Student Session
// (SessionPage.tsx) and the Content Manager's Draft Preview
// (ContentPreviewSession.tsx). Neither wrapper duplicates this UI; they only
// supply *where the content comes from* and *what happens on
// complete/submit*, via props.
//
// mode="student": every side effect (completeSession, recordSessionPerformance,
//   createSubmission) is real, wired up by the SessionPage.tsx wrapper.
// mode="preview": the wrapper passes no-op/in-memory versions of those same
//   callbacks — this component has no idea it's being previewed, it just
//   calls whatever callback it was given. That's what keeps preview
//   completely inert with respect to student records without this file
//   needing any "if preview" branches around persistence.
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
  /** Only meaningful in preview — the live student SessionContent type has no video field (see sessionContent.ts). */
  video?: { youtubeUrl: string; title: string };
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
  onSubmitExercise: (files: CodeFile[], language: string) => SubmissionSummary;
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
type WorkspaceView = "default" | "practice" | "ai-help" | "exercise" | "complete";

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

/** Extracts a YouTube video id from any of the supported URL shapes, for building an embed src. */
function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/i);
  return match ? match[1] : null;
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
  video,
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

  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("default");

  const [chat, setChat] = useState<ChatMessage[]>([
    { id: 0, role: "ai", text: "Hi! I'm your AI Learning Assistant. Ask me anything about this session." },
  ]);
  const [chatInput, setChatInput] = useState("");

  const [hintVisible, setHintVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  const [exerciseSubmitted, setExerciseSubmitted] = useState(false);
  const [exerciseFiles, setExerciseFiles] = useState<CodeFile[]>([]);
  const [exerciseSubmitPhase, setExerciseSubmitPhase] = useState<"idle" | "confirming" | "success">("idle");
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>(initialSubmissions);
  const [lastSubmission, setLastSubmission] = useState<SubmissionSummary | null>(null);

  const [liveJoined, setLiveJoined] = useState(false);
  const [attended, setAttended] = useState(false);

  // Reset all local workspace state whenever a different session is opened.
  useEffect(() => {
    setVideoState("idle");
    setCheckpointSeen(false);
    setCheckpointAnswer(null);
    setWorkspaceView("default");
    setChat([{ id: 0, role: "ai", text: "Hi! I'm your AI Learning Assistant. Ask me anything about this session." }]);
    setChatInput("");
    setHintVisible(false);
    setChecked(false);
    setExerciseSubmitted(false);
    setExerciseFiles([]);
    setExerciseSubmitPhase("idle");
    setLastSubmission(null);
    setSubmissions(initialSubmissions);
    setLiveJoined(false);
    setAttended(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (videoState !== "playing") return;
    const timer = setTimeout(() => {
      setVideoState(checkpointSeen ? "finished" : "checkpoint");
    }, 1400);
    return () => clearTimeout(timer);
  }, [videoState, checkpointSeen]);

  function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userId = Date.now();
    setChat((c) => [...c, { id: userId, role: "user", text: trimmed }]);
    setChatInput("");
    const reply = content.aiHelp.replies[trimmed] ?? content.aiHelp.defaultReply;
    setTimeout(() => {
      setChat((c) => [...c, { id: userId + 1, role: "ai", text: reply }]);
    }, 500);
  }

  function reviewSession() {
    setWorkspaceView("default");
    setVideoState("idle");
  }

  function handleConfirmExerciseSubmit() {
    const filesToSubmit: CodeFile[] =
      exerciseFiles.length > 0
        ? exerciseFiles
        : content.exercise.starterCode
        ? [{ name: "starter", content: content.exercise.starterCode }]
        : [];

    const submission = onSubmitExercise(filesToSubmit, content.exercise.language);
    setSubmissions((prev) => [...prev, submission]);
    setLastSubmission(submission);
    setExerciseSubmitted(true);
    setExerciseSubmitPhase("success");
  }

  const checkpointCorrect = checkpointAnswer === content.videoCheckpoint.correctIndex;

  function handleCompleteSession() {
    onCompleteSession({
      learning: { completed: videoState === "finished" },
      videoCheck: { completed: checkpointSeen, correct: checkpointSeen ? checkpointCorrect : null },
      practice: {
        completed: checked,
        passedCount: content.practice.checklist.filter((c) => c.passed).length,
        totalCount: content.practice.checklist.length,
      },
      exercise: { completed: exerciseSubmitted },
    });
    setWorkspaceView("complete");
  }

  const isLive = content.delivery?.format === "live";
  const liveState = isLive && content.delivery ? getLiveSessionState(content.delivery) : null;
  const youtubeId = video ? extractYouTubeId(video.youtubeUrl) : null;

  const activityDone: Record<ActivityKey, boolean> = {
    learning: isLive ? attended : videoState === "finished",
    videoCheck: checkpointSeen,
    practice: checked,
    exercise: exerciseSubmitted,
  };
  const requirements = content.requiredActivities.map((key) => ({
    key,
    label: ACTIVITY_LABEL[key],
    done: activityDone[key],
  }));
  const isSessionReady = requirements.every((r) => r.done);

  const practicePassed = content.practice.checklist.filter((r) => r.passed).length;
  const practicePercent =
    content.practice.checklist.length === 0 ? 0 : Math.round((practicePassed / content.practice.checklist.length) * 100);
  const checkpointPercent = checkpointCorrect ? 100 : 50;
  const performancePercent = Math.round((practicePercent + checkpointPercent) / 2);

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
                : videoState === "finished" && (
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
            ) : video && youtubeId ? (
              <div className="mt-4">
                <p className="text-sm font-semibold text-navy-500">{video.title || "Session Video"}</p>
                <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <iframe
                    title={video.title || "Session video"}
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    className="absolute inset-0 h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* A real embedded video can't be scripted to pause mid-playback, so
                    Video Check renders as its own block underneath instead of the
                    in-video overlay the mock player uses. */}
                {content.videoCheckpoint.question && (
                  <div className="mt-4 flex flex-col gap-4 rounded-xl bg-navy-500 p-5 sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Video Check</p>
                    <p className="font-medium text-white">{content.videoCheckpoint.question}</p>

                    {!checkpointSeen ? (
                      <div className="flex flex-col gap-2">
                        {content.videoCheckpoint.options.map((option, i) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setCheckpointAnswer(i);
                              setCheckpointSeen(true);
                            }}
                            className="rounded-lg border border-white/20 bg-white/5 px-3.5 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/15"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p
                        className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                          checkpointCorrect ? "text-brand-300" : "text-white"
                        }`}
                      >
                        {checkpointCorrect ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                        {checkpointCorrect
                          ? "Correct!"
                          : `Not quite — the answer is ${content.videoCheckpoint.options[content.videoCheckpoint.correctIndex]}.`}
                      </p>
                    )}
                  </div>
                )}
              </div>
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

                  {(videoState === "checkpoint" || videoState === "answered") && (
                    <div className="flex w-full flex-col gap-4 rounded-xl bg-navy-500 p-5 sm:p-6">
                      <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Quick Check</p>
                      <p className="font-medium text-white">{content.videoCheckpoint.question}</p>

                      {videoState === "checkpoint" && (
                        <div className="flex flex-col gap-2">
                          {content.videoCheckpoint.options.map((option, i) => (
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
                            {checkpointCorrect
                              ? "Correct!"
                              : `Not quite — the answer is ${content.videoCheckpoint.options[content.videoCheckpoint.correctIndex]}.`}
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
            <p className="text-sm font-semibold text-navy-500">About this lesson</p>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-500/60">{content.objective}</p>

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
                  { key: "ai-help", label: "AI Help" },
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
              {workspaceView === "default" && (
                <div>
                  <h2 className="text-lg font-bold text-navy-500">Practice what you&apos;re learning</h2>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-brand-50/40 p-4">
                    <p className="text-sm text-navy-500/70">{content.practice.task}</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button type="button" className="!w-auto px-6" onClick={() => setWorkspaceView("practice")}>
                      Start Practice
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!w-auto px-6"
                      onClick={() => setWorkspaceView("ai-help")}
                    >
                      Ask AI
                    </Button>
                  </div>
                </div>
              )}

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

                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <Button type="button" variant="secondary" className="!w-auto px-6" onClick={() => setChecked(true)}>
                      Self-Check
                    </Button>
                    <button
                      type="button"
                      onClick={() => setHintVisible(true)}
                      className="text-sm font-semibold text-brand-500 hover:text-brand-600"
                    >
                      AI Hint
                    </button>
                  </div>

                  {!checked && (
                    <p className="mt-3 text-xs text-navy-500/40">
                      Compare your work against this reference checklist once you&apos;re done — it&apos;s a
                      self-review guide, not an automatic grade of the code you wrote above.
                    </p>
                  )}

                  {checked && (
                    <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-medium text-navy-500/50">
                        Reference checklist — review this yourself against your code above. It isn&apos;t an
                        automatic evaluation of what you wrote.
                      </p>
                      {content.practice.checklist.map((item) => (
                        <p
                          key={item.label}
                          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                            item.passed ? "text-brand-600" : "text-error"
                          }`}
                        >
                          {item.passed ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                          {item.label}
                        </p>
                      ))}
                    </div>
                  )}

                  {hintVisible && (
                    <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-navy-500/70">
                      {content.aiHelp.replies["Give me a hint"] ?? content.aiHelp.defaultReply}
                    </p>
                  )}

                  {content.projectConnection && (
                    <p className="mt-4 flex items-start gap-1.5 text-xs text-navy-500/40">
                      <ArrowIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {content.projectConnection}
                    </p>
                  )}
                </div>
              )}

              {workspaceView === "ai-help" && (
                <div>
                  <h2 className="text-lg font-bold text-navy-500">AI Learning Assistant</h2>

                  <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-navy-500/50">
                    <span>{courseTitle}</span>
                    <span>&rsaquo;</span>
                    <span>{subjectTitle}</span>
                    <span>&rsaquo;</span>
                    <span className="font-medium text-navy-500/70">{sessionTitle}</span>
                  </div>
                  {content.concepts.length > 0 && (
                    <p className="mt-2 text-xs text-navy-500/40">Concepts: {content.concepts.join(", ")}</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {content.aiHelp.quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => sendChat(prompt)}
                        className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-navy-500/70 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex max-h-64 flex-col gap-2.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    {chat.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
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
                      placeholder="Ask something about this session..."
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                    />
                    <Button type="submit" className="shrink-0 basis-auto !w-auto px-6">
                      Ask AI
                    </Button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setWorkspaceView("default")}
                    className="mt-4 text-sm font-semibold text-brand-500 hover:text-brand-600"
                  >
                    &larr; Return to learning
                  </button>
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
                      <div className="mt-3 flex gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="!w-auto px-6"
                          onClick={() => setExerciseSubmitPhase("idle")}
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

                    <p className="mt-5 text-2xl font-bold text-brand-500">{performancePercent}%</p>
                    <p className="text-xs font-medium uppercase tracking-wide text-navy-500/50">Performance</p>
                  </div>

                  <div className="mt-6 flex flex-col gap-2 text-sm">
                    {requirements.map((req) => (
                      <div key={req.key} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                        <span className="text-navy-500/60">{req.label}</span>
                        <span className="inline-flex items-center gap-1.5 font-medium text-brand-600">
                          <CheckIcon className="h-3.5 w-3.5" />
                          {req.key === "videoCheck" ? (checkpointCorrect ? "Correct" : "Attempted") : "Completed"}
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
                      <p className="mt-1.5 text-sm text-navy-500/60">Review the areas the practice check flagged.</p>
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
    </div>
  );
}
