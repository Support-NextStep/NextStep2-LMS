import { useEffect, useRef } from "react";
import { useVideoCheckpoints } from "../hooks/useVideoCheckpoints";
import { extractYouTubeVideoId } from "../data/youtubePlayer";
import type { VideoCheckpoint } from "../data/sessionContent";

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

export type VideoCheckpointPlayerProps = {
  video: { youtubeUrl: string; title: string };
  checkpoints: VideoCheckpoint[];
  /** Called once, the moment playback reaches the end. */
  onEnded: () => void;
  /** Called with the full current answers map whenever it changes — checkpointId -> was it answered correctly. */
  onAnswersChange: (answers: Record<string, boolean>) => void;
};

/**
 * Real YouTube playback + sequential checkpoint questions — see
 * NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §E/F/G/K. Rendered identically by the
 * Student (SessionPage.tsx) and Preview (ContentPreviewSession.tsx), both via
 * SessionWorkspace.tsx — see §I. The caller is expected to give this
 * component a React `key` derived from the session id, so switching
 * sessions fully remounts it (a fresh player, fresh checkpoint state)
 * instead of trying to reset an existing one in place.
 *
 * All the actual playback/polling/crossing/seek logic lives in
 * useVideoCheckpoints — this component only draws the iframe mount point
 * and the checkpoint question/feedback overlay.
 */
export default function VideoCheckpointPlayer({ video, checkpoints, onEnded, onAnswersChange }: VideoCheckpointPlayerProps) {
  const videoId = extractYouTubeVideoId(video.youtubeUrl);
  const {
    elementId,
    ready,
    ended,
    embedError,
    activeCheckpoint,
    activeCheckpointSelectedIndex,
    answers,
    selectAnswer,
    skipActiveCheckpoint,
  } = useVideoCheckpoints({ videoId, checkpoints });

  // Report the answers map upward only when it actually changes — both
  // callbacks are plain props here, not assumed to be stable across
  // renders, so the comparison (not the dependency array alone) is what
  // prevents redundant calls.
  const lastReportedAnswers = useRef(answers);
  useEffect(() => {
    if (lastReportedAnswers.current !== answers) {
      lastReportedAnswers.current = answers;
      onAnswersChange(answers);
    }
  }, [answers, onAnswersChange]);

  const hasReportedEnded = useRef(false);
  useEffect(() => {
    if (ended && !hasReportedEnded.current) {
      hasReportedEnded.current = true;
      onEnded();
    }
  }, [ended, onEnded]);

  if (!videoId) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-navy-500">This doesn&apos;t look like a valid YouTube URL.</p>
      </div>
    );
  }

  if (embedError) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-navy-500">This video can&apos;t be played.</p>
        <p className="text-xs text-navy-500/60">It may be private, removed, or not allowed to be embedded elsewhere.</p>
      </div>
    );
  }

  const answered = activeCheckpointSelectedIndex !== null;
  const correct = Boolean(activeCheckpoint) && answered && activeCheckpointSelectedIndex === activeCheckpoint?.correctIndex;

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-navy-500">{video.title || "Session Video"}</p>

      <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="h-6 w-6 animate-spin text-navy-500/40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        {/* The real (or, in tests, fake) player replaces this element's
            content with its own iframe once constructed — see
            youtubePlayer.ts / useVideoCheckpoints.ts. */}
        <div id={elementId} className="absolute inset-0 h-full w-full" />
      </div>

      {/* A real embedded video can't be paused by an in-video overlay the
          way the old mock player could, so the checkpoint renders as its
          own block underneath instead — the player itself is genuinely
          paused (player.pauseVideo()) while this is showing, and stays
          paused (see useVideoCheckpoints' gate-enforcement effect) until
          this block itself resumes it. A checkpoint is a learning check,
          not a hard gate: once answered, right or wrong, it shows
          correct/incorrect feedback and then resumes playback on its own —
          never a required retry, never a manual "Continue" click. */}
      {activeCheckpoint && (
        <div className="mt-4 flex flex-col gap-4 rounded-xl bg-navy-500 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Video Check</p>
          <p className="font-medium text-white">{activeCheckpoint.question}</p>

          {!answered ? (
            <>
              <div className="flex flex-col gap-2">
                {activeCheckpoint.options.map((option, i) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => selectAnswer(i)}
                    className="rounded-lg border border-white/20 bg-white/5 px-3.5 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/15"
                  >
                    {option}
                  </button>
                ))}
              </div>
              {!activeCheckpoint.required && (
                <button
                  type="button"
                  onClick={skipActiveCheckpoint}
                  className="self-start text-sm font-semibold text-white/60 hover:text-white"
                >
                  Skip
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Every option re-rendered with its result: the correct
                  answer always shown in green, the student's own wrong pick
                  (if any) in red — so a wrong answer still teaches the
                  right one, not just that they missed it. */}
              <div className="flex flex-col gap-2">
                {activeCheckpoint.options.map((option, i) => {
                  const isCorrectOption = i === activeCheckpoint.correctIndex;
                  const isWrongSelection = i === activeCheckpointSelectedIndex && !isCorrectOption;
                  return (
                    <div
                      key={option}
                      className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-left text-sm font-medium ${
                        isCorrectOption
                          ? "border-success bg-success/15 text-white"
                          : isWrongSelection
                          ? "border-error bg-error/15 text-white"
                          : "border-white/10 bg-white/5 text-white/50"
                      }`}
                    >
                      {isCorrectOption ? (
                        <CheckIcon className="h-4 w-4 shrink-0 text-success" />
                      ) : isWrongSelection ? (
                        <XIcon className="h-4 w-4 shrink-0 text-error" />
                      ) : (
                        <span className="h-4 w-4 shrink-0" />
                      )}
                      <span>{option}</span>
                    </div>
                  );
                })}
              </div>
              <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${correct ? "text-success" : "text-error"}`}>
                {correct ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                {correct ? "Correct!" : "Not quite — here's the right answer."}
              </p>
              {/* The Content Author's own authored feedback — never a hardcoded string. */}
              {activeCheckpoint.feedback && <p className="text-sm text-white/80">{activeCheckpoint.feedback}</p>}
              <p className="text-xs text-white/40">Resuming…</p>
            </div>
          )}
        </div>
      )}

      {ended && !activeCheckpoint && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500/60">
          <CheckIcon className="h-4 w-4 text-brand-500" />
          Lesson complete
        </p>
      )}

      {/* Debug/QA visibility only — a plain object dump, never user-facing copy. */}
      {Object.keys(answers).length > 0 && <span className="sr-only" data-testid="video-checkpoint-answers" aria-hidden="true" />}
    </div>
  );
}
