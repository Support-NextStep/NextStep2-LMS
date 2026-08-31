import { useEffect, useMemo, useRef, useState } from "react";
import { createYouTubePlayer, PlayerCreationAborted, YouTubeEmbedError, YT_PLAYER_STATE, type YouTubePlayer } from "../data/youtubePlayer";
import type { VideoCheckpoint } from "../data/sessionContent";

const POLL_INTERVAL_MS = 250;
/**
 * How far past a checkpoint's timestamp still counts as "reached it during
 * normal playback" (small — one poll tick or so) vs. "jumped/seeked past it"
 * (needs pulling playback back so the question lands at the right moment in
 * the video) — see NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §F.
 */
const CROSSING_TOLERANCE_SECONDS = 1.5;
/**
 * How long correct/incorrect feedback stays on screen before playback
 * automatically resumes on its own. A checkpoint is a learning check, not a
 * hard gate: PAUSE -> ASK -> SHOW RESULT -> CONTINUE, never PAUSE -> ASK ->
 * BLOCK UNTIL CORRECT. Long enough to actually read the feedback, short
 * enough that the lesson doesn't feel stalled.
 */
const AUTO_CONTINUE_DELAY_MS = 1800;
/**
 * After any backward seek, the crossing baseline is rebased to just behind
 * the landing position (instead of exactly at it) so a checkpoint sitting
 * exactly at, or immediately after, that position is still "ahead of" the
 * baseline and can fire again on the very next forward tick. See the
 * crossing check below for why this needs to be strictly less than the
 * landing time.
 */
const BACKWARD_SEEK_REBASE_EPSILON_SECONDS = 0.05;

export type UseVideoCheckpointsResult = {
  /** Mount a `<div id={elementId} />` for the real player to replace with its iframe. */
  elementId: string;
  ready: boolean;
  ended: boolean;
  /** The checkpoint currently paused-and-showing, or null if none active right now. */
  activeCheckpoint: VideoCheckpoint | null;
  /** Index the student picked for the active checkpoint, or null while it's still unanswered. */
  activeCheckpointSelectedIndex: number | null;
  /** checkpointId -> was the MOST RECENT encounter answered correctly. A checkpoint answered again after a backward seek overwrites its previous entry — see the module doc comment on why there is no permanent "already shown" state. */
  answers: Record<string, boolean>;
  /** True once YouTube has reported the video genuinely can't be played (private, removed, embedding disabled, bad id) — distinct from still-loading. */
  embedError: boolean;
  selectAnswer: (selectedIndex: number) => void;
  /** No-op for a required checkpoint — required checkpoints must be answered (right or wrong) before playback resumes; see §C. */
  skipActiveCheckpoint: () => void;
};

/**
 * Owns the real YouTube player's lifecycle, playback-time polling, and
 * checkpoint-crossing/seek/gating logic. Renders nothing itself —
 * VideoCheckpointPlayer.tsx consumes this and draws the iframe mount point
 * plus the checkpoint question/feedback overlay. See
 * NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §E/F/G/K.
 *
 * TWO SEPARATE CONCEPTS, ON PURPOSE (see the fix report for the bug this
 * replaced): "has this checkpoint's current on-screen occurrence been
 * answered" (activeCheckpointSelectedIndex — transient, per-occurrence) is
 * NOT the same thing as "will this checkpoint's timestamp ever trigger
 * again" (never permanently suppressed — driven purely by
 * previousTimeRef.current vs. the current polled position). There is
 * deliberately no per-checkpoint-id "already fired" flag anywhere in this
 * file: a checkpoint fires every time playback crosses its timestamp from
 * below (previousTime < checkpoint.timestamp <= currentTime), including
 * after the student has already answered it once, seeked backward past it,
 * and played forward across it again.
 *
 * The caller is expected to fully remount its component (via a React `key`
 * keyed on the session id) when a different session's video should play —
 * this hook does not accept a separate reset key, since a fresh mount
 * already gives it fresh internal state for free.
 */
export function useVideoCheckpoints(opts: { videoId: string | null; checkpoints: VideoCheckpoint[] }): UseVideoCheckpointsResult {
  const elementIdRef = useRef(`youtube-checkpoint-player-${Math.random().toString(36).slice(2)}`);
  const playerRef = useRef<YouTubePlayer | null>(null);

  // The crossing baseline — NOT a per-checkpoint flag. -1 is a sentinel
  // meaning "before the start of the video," so a checkpoint authored at
  // 0:00 still fires on the very first poll tick after playback begins.
  const previousTimeRef = useRef(-1);
  const autoContinueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [ended, setEnded] = useState(false);
  const [embedError, setEmbedError] = useState(false);
  const [playerState, setPlayerState] = useState<number | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] = useState<VideoCheckpoint | null>(null);
  const [activeCheckpointSelectedIndex, setActiveCheckpointSelectedIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  const sortedCheckpoints = useMemo(
    () => [...opts.checkpoints].sort((a, b) => a.timestampSeconds - b.timestampSeconds),
    [opts.checkpoints]
  );
  // Mirrored into a ref so the poll interval's closure always reads the
  // latest list without needing to tear down and recreate the interval
  // every time the (effectively static, per-session) checkpoints array
  // reference happens to change.
  const checkpointsRef = useRef(sortedCheckpoints);
  checkpointsRef.current = sortedCheckpoints;

  // ---- Player lifecycle: construct once per videoId, destroy on unmount.
  // Unchanged by this fix — see youtubePlayer.ts for why `shouldAbort` is
  // what actually prevents two players from being constructed against one
  // element (the real-playback fix this file's history already covers). ----
  useEffect(() => {
    if (!opts.videoId) return;
    let cancelled = false;

    createYouTubePlayer(elementIdRef.current, {
      videoId: opts.videoId,
      shouldAbort: () => cancelled,
      onReady: () => {
        if (!cancelled) setReady(true);
      },
      onStateChange: (state) => {
        if (cancelled) return;
        setPlayerState(state);
        if (state === YT_PLAYER_STATE.ENDED) setEnded(true);
      },
      onError: () => {
        if (!cancelled) setEmbedError(true);
      },
    }).then((player) => {
      if (cancelled) {
        player.destroy();
        return;
      }
      playerRef.current = player;
    }).catch((err) => {
      if (cancelled || err instanceof PlayerCreationAborted) return;
      if (!(err instanceof YouTubeEmbedError)) console.error("YouTube Player failed to load:", err);
      setEmbedError(true);
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.videoId]);

  // ---- Gate enforcement: while a checkpoint is active, the video MUST stay
  // paused until this hook itself resumes it (see resumeAfterCheckpoint).
  // The real embedded iframe still exposes YouTube's own native Play button
  // — nothing here hides or disables it (the player implementation itself
  // is untouched) — so a student can click it while a checkpoint is
  // showing. When they do, onStateChange reports PLAYING and this effect
  // immediately pauses again. Without this, a checkpoint was only ever a
  // suggestion: pauseVideo() ran once when it first triggered, but nothing
  // stopped the student from pressing play again and continuing straight
  // through the question. ----
  useEffect(() => {
    if (activeCheckpoint && playerState === YT_PLAYER_STATE.PLAYING) {
      playerRef.current?.pauseVideo();
    }
  }, [activeCheckpoint, playerState]);

  // ---- Playback-time polling: crossing-based checkpoint detection. Only
  // runs while actually playing and no checkpoint is currently on screen —
  // once one triggers, this effect's own dependency change tears the
  // interval down, so there's nothing to double-trigger while it's up. ----
  useEffect(() => {
    if (playerState !== YT_PLAYER_STATE.PLAYING || activeCheckpoint) return;

    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const currentTime = player.getCurrentTime();
      const previous = previousTimeRef.current;

      if (currentTime < previous) {
        // A backward seek (including replaying from the very start) — never
        // a crossing on this tick, but rebase the baseline just behind the
        // new position. This is what makes an already-answered checkpoint
        // eligible to fire again once playback crosses it forward a second
        // time — there is no separate "reset" step anywhere else; a
        // backward seek always implicitly re-arms every checkpoint at or
        // after the new position, on its own, every time.
        previousTimeRef.current = Math.max(-1, currentTime - BACKWARD_SEEK_REBASE_EPSILON_SECONDS);
        return;
      }

      previousTimeRef.current = currentTime;

      // The earliest checkpoint whose timestamp falls in (previous,
      // currentTime]. This single rule catches both ordinary forward
      // playback (a fraction-of-a-second window each tick) and a hard
      // seek/scrub that jumped straight past one or more checkpoints (a
      // wide window in a single tick) — seeking can never permanently
      // bypass an incomplete checkpoint, because crossing it is exactly
      // what triggers it, regardless of how big the jump was. Picking only
      // the earliest one and rewinding playback to it means any later
      // checkpoints caught in that same jump are handled by ordinary
      // forward polling once playback resumes from there — no separate
      // "handle several crossed checkpoints in one tick" logic needed.
      const crossed = checkpointsRef.current
        .filter((c) => c.timestampSeconds > previous && c.timestampSeconds <= currentTime)
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds)[0];

      if (crossed) {
        if (currentTime - crossed.timestampSeconds > CROSSING_TOLERANCE_SECONDS) {
          player.seekTo(crossed.timestampSeconds, true);
        }
        player.pauseVideo();
        setActiveCheckpoint(crossed);
        setActiveCheckpointSelectedIndex(null);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [playerState, activeCheckpoint]);

  useEffect(() => {
    return () => {
      if (autoContinueTimerRef.current) clearTimeout(autoContinueTimerRef.current);
    };
  }, []);

  /**
   * Clears the active checkpoint and resumes playback. The crossing
   * baseline is set to exactly this checkpoint's own timestamp (not left at
   * whatever it was mid-question) so resuming doesn't immediately re-cross
   * — and re-trigger — the very checkpoint being left, since the crossing
   * check above requires the timestamp to be strictly greater than the
   * baseline.
   */
  function resumeAfterCheckpoint(checkpoint: VideoCheckpoint) {
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
    previousTimeRef.current = checkpoint.timestampSeconds;
    setActiveCheckpoint(null);
    setActiveCheckpointSelectedIndex(null);
    playerRef.current?.playVideo();
  }

  /**
   * A checkpoint is a learning check, not a hard gate — see
   * NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §F. Right or wrong, the choice is
   * recorded (so required-activity "answered" tracking upstream in
   * SessionWorkspace.tsx still works exactly as before — it only ever
   * required an answer, never a correct one), the selection stays on
   * screen just long enough for the student to see correct/incorrect
   * feedback, and then playback resumes on its own. Never blocked on a
   * retry, and never waits on a manual "Continue" click.
   */
  function selectAnswer(selectedIndex: number) {
    if (!activeCheckpoint || activeCheckpointSelectedIndex !== null) return;
    const checkpoint = activeCheckpoint;
    setActiveCheckpointSelectedIndex(selectedIndex);
    setAnswers((prev) => ({ ...prev, [checkpoint.id]: selectedIndex === checkpoint.correctIndex }));
    autoContinueTimerRef.current = setTimeout(() => {
      autoContinueTimerRef.current = null;
      resumeAfterCheckpoint(checkpoint);
    }, AUTO_CONTINUE_DELAY_MS);
  }

  /** Dismisses a non-required checkpoint without answering it at all — required checkpoints can't be skipped (see the authoring Field's own hint: "must the student answer this before the session can be completed?"). */
  function skipActiveCheckpoint() {
    if (!activeCheckpoint || activeCheckpoint.required) return;
    resumeAfterCheckpoint(activeCheckpoint);
  }

  return {
    elementId: elementIdRef.current,
    ready,
    ended,
    embedError,
    activeCheckpoint,
    activeCheckpointSelectedIndex,
    answers,
    selectAnswer,
    skipActiveCheckpoint,
  };
}
