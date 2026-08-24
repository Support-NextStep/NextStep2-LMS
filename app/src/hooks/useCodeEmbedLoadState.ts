import { useEffect, useRef, useState } from "react";

const LOAD_TIMEOUT_MS = 8000;

export type CodeEmbedLoadState = "loading" | "ready" | "unavailable";

/**
 * Shared loading/failure state machine for an embedded execution provider
 * iframe (today: OneCompiler) — extracted from PracticeCodeEmbed so Exercise
 * can reuse the exact same load/fallback/retry behavior without duplicating
 * it or coupling Exercise to Practice-specific markup.
 *
 * See PracticeCodeEmbed's original comment for why this exists: cross-origin
 * iframes fire `onLoad` even for a failed/blocked navigation, so a parallel
 * `fetch(url, { mode: "no-cors" })` reachability check is the real failure
 * signal — `onLoad`/`onError` and a timeout are kept as supporting signals.
 */
export function useCodeEmbedLoadState(embedUrl: string) {
  const [state, setState] = useState<CodeEmbedLoadState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState("loading");
    let cancelled = false;

    fetch(embedUrl, { mode: "no-cors", cache: "no-store" }).catch(() => {
      if (!cancelled) setState("unavailable");
    });

    timeoutRef.current = setTimeout(() => {
      setState((s) => (s === "loading" ? "unavailable" : s));
    }, LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [embedUrl, retryKey]);

  function handleLoad() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Don't let a late onLoad (browsers fire it even for a failed/blocked
    // navigation) resurrect an embed the reachability check already
    // determined was unavailable.
    setState((s) => (s === "unavailable" ? s : "ready"));
  }

  function handleError() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState("unavailable");
  }

  function retry() {
    setRetryKey((k) => k + 1);
  }

  return { state, retryKey, handleLoad, handleError, retry };
}
