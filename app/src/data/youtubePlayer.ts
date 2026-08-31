// ---------------------------------------------------------------------------
// Thin wrapper around the real YouTube IFrame Player API — the ONLY file
// that ever touches `window.YT`. See NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md
// §E/§K: this mirrors the same provider-abstraction shape practiceExecution.ts
// already uses for OneCompiler (one small file owning one vendor's embed
// details), generalized to video instead of introducing a new pattern.
//
// useVideoCheckpoints.ts (the hook that owns polling/checkpoint logic) only
// ever calls the functions/types exported here — it never reaches into
// `window.YT` itself. That's what keeps a future non-YouTube video provider
// a swap of this one file's internals, not a rewrite of the hook.
//
// TESTABILITY: loadYouTubeIframeApi() checks for an already-present
// `window.YT.Player` before injecting the real `iframe_api` script. This is
// correct production behavior (never double-load the script) and is also
// exactly what lets Playwright tests inject a fake `window.YT` via
// `page.addInitScript()` before the app runs, so the real
// polling/crossing-detection/pause-resume/seek-handling code in
// useVideoCheckpoints.ts can be exercised deterministically against a
// scriptable fake player instead of real, non-deterministic network video
// playback. See tests/videoCheckpoints.spec.ts.
// ---------------------------------------------------------------------------

/** The subset of YouTube's real numeric player states this app cares about. */
export const YT_PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

type YouTubePlayerEvents = {
  onReady?: () => void;
  onStateChange?: (event: { data: number }) => void;
  onError?: (event: { data: number }) => void;
};

/**
 * Thrown by createYouTubePlayer() when `shouldAbort()` says the caller no
 * longer wants a player by the time the IFrame API has finished loading.
 * Callers can check `instanceof PlayerCreationAborted` to distinguish "we
 * cancelled this on purpose" from a real embed failure — see the
 * `shouldAbort` doc comment below for why this check exists at all.
 */
export class PlayerCreationAborted extends Error {
  constructor() {
    super("YouTube player creation aborted before construction.");
    this.name = "PlayerCreationAborted";
  }
}

/** Rejection reason when YouTube's own `onError` fires — see the `onError` event below. Callers use `opts.onError` to react to this; this class just lets a generic `.catch()` tell it apart from an unexpected failure. */
export class YouTubeEmbedError extends Error {
  code: number;
  constructor(code: number) {
    super(`YouTube player error: ${code}`);
    this.name = "YouTubeEmbedError";
    this.code = code;
  }
}

type YTNamespace = {
  Player: new (
    elementId: string,
    opts: { videoId: string; host?: string; playerVars?: Record<string, number | string>; events?: YouTubePlayerEvents }
  ) => YouTubePlayer;
};

type YouTubeWindow = {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

function getWindow(): (Window & YouTubeWindow) | null {
  return typeof window === "undefined" ? null : (window as Window & YouTubeWindow);
}

let apiLoadPromise: Promise<YTNamespace> | null = null;

/**
 * Resolves once `window.YT.Player` is available — either because it already
 * is (a fake injected for tests, or a previous call already loaded it), or
 * once the real `https://www.youtube.com/iframe_api` script has loaded and
 * called back. Safe to call multiple times; the real script is only ever
 * injected once per page load.
 */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  const w = getWindow();
  if (!w) return Promise.reject(new Error("loadYouTubeIframeApi() requires a browser window."));
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const previousReady = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (w.YT) resolve(w.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

/**
 * Loads the API (if needed) and constructs a real player mounted on the
 * element with id `elementId`. `playerVars` deliberately disables YouTube's
 * own fullscreen control (`fs: 0`) so the checkpoint overlay this app draws
 * on top of the player is never hidden behind native fullscreen — see §E.
 *
 * `shouldAbort`: `loadYouTubeIframeApi()` above is a real network fetch the
 * first time it's called, so by the time it resolves the caller's effect
 * may already have been cleaned up (React 19 StrictMode's dev-only
 * mount -> cleanup -> mount double-invoke does this on every mount, not
 * just a genuine unmount). If we called `new YT.Player()` unconditionally
 * here, an already-cancelled invocation would still construct a real
 * player and iframe against `elementId`, racing the second (live)
 * invocation's own `new YT.Player()` call on that *same* element. Two
 * players fighting over one iframe is exactly what produced the observed
 * bug: "Failed to execute 'postMessage' ... target origin
 * ('https://www.youtube.com') does not match the recipient window's origin
 * ('http://localhost:5173')" plus a spurious "initialization timed out" —
 * not a misconfigured origin (the `origin` playerVar below was already
 * correct), but a stale/abandoned iframe from the first instance still
 * mid-handshake while the second instance's messages land on it. Checking
 * `shouldAbort()` here, before `new YT.Player()` is ever called, means a
 * cancelled invocation never constructs a player at all — see
 * useVideoCheckpoints.ts's effect for the caller side of this contract.
 */
export async function createYouTubePlayer(
  elementId: string,
  opts: {
    videoId: string;
    onReady?: () => void;
    onStateChange?: (state: number) => void;
    onError?: (data: number) => void;
    shouldAbort?: () => boolean;
  }
): Promise<YouTubePlayer> {
  const YT = await loadYouTubeIframeApi();
  if (opts.shouldAbort?.()) {
    throw new PlayerCreationAborted();
  }
  return new Promise((resolve, reject) => {
    const el = document.getElementById(elementId);
    if (!el) {
      reject(new Error(`Element ${elementId} not found in DOM`));
      return;
    }
    let timeout = setTimeout(() => {
      console.warn("YouTube Player initialization timed out");
      opts.onReady?.();
      resolve(player);
    }, 5000);

    const player = new YT.Player(elementId, {
      videoId: opts.videoId,
      host: 'https://www.youtube.com',
      playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1, fs: 0, playsinline: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          clearTimeout(timeout);
          opts.onReady?.();
          resolve(player);
        },
        onStateChange: (event) => opts.onStateChange?.(event.data),
        // A real embed failure (private/removed/embedding-disabled video,
        // bad video id, etc.) — genuinely distinct from "still loading."
        // Never call onReady here: the caller needs to know playback isn't
        // actually usable so it can show a fallback instead of a blank
        // player (see VideoCheckpointPlayer.tsx's embedError branch).
        onError: (event) => {
          clearTimeout(timeout);
          console.error("YouTube Player Error:", event.data);
          opts.onError?.(event.data);
          player.destroy();
          reject(new YouTubeEmbedError(event.data));
        }
      },
    });
  });
}

/** Extracts a YouTube video id from any of the supported URL shapes. Shared with the authoring "Preview Video" control's own extraction. */
export function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/i);
  return match ? match[1] : null;
}
