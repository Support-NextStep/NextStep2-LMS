import { useEffect, useRef } from "react";
import {
  activePracticeExecutionProvider,
  buildPopulateCodeMessage,
  defaultFileName,
  ONECOMPILER_ORIGIN,
  parseOneCompilerChangeEvent,
  type CodeFile,
} from "../data/practiceExecution";
import { useCodeEmbedLoadState } from "../hooks/useCodeEmbedLoadState";

const POPULATE_DELAY_MS = 600;

/**
 * The Exercise equivalent of PracticeCodeEmbed. Same OneCompiler embed and
 * the same shared load/fallback state machine, but Exercise additionally:
 *   - requests codeChangeEvent so the iframe posts the student's code back
 *     to this page on every change (see practiceExecution.ts for the
 *     verified message shape and validation)
 *   - populates the exercise's starter code once the embed has loaded, via
 *     OneCompiler's documented populateCode postMessage
 *
 * NextStep² only ever reads the code through this validated channel — never
 * via iframe.contentDocument (blocked by the browser anyway for a
 * cross-origin frame, and not attempted here) and never via any form of
 * automation.
 */
export default function ExerciseCodeEmbed({
  language,
  starterCode,
  onCodeChange,
}: {
  language: string;
  starterCode?: string;
  onCodeChange: (files: CodeFile[]) => void;
}) {
  const embedUrl = activePracticeExecutionProvider.getEmbedUrl(language, { codeChangeEvent: true });
  const { state, retryKey, handleLoad, handleError, retry } = useCodeEmbedLoadState(embedUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for validated code-change messages from OneCompiler and hand the
  // latest files up to the caller. Anything that doesn't pass validation
  // (wrong origin, wrong source window, malformed payload) is dropped.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const files = parseOneCompilerChangeEvent(event);
      if (files) onCodeChange(files);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCodeChange]);

  function handleIframeLoad() {
    handleLoad();
    if (!starterCode) return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    // OneCompiler's own app needs a moment to finish initializing after the
    // raw iframe "load" event fires before it reliably applies populateCode
    // (verified empirically — sending immediately on load can be missed).
    setTimeout(() => {
      target.postMessage(
        buildPopulateCodeMessage(language, [{ name: defaultFileName(language), content: starterCode }]),
        ONECOMPILER_ORIGIN
      );
    }, POPULATE_DELAY_MS);
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {state === "unavailable" ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-sm font-medium text-navy-500">
            Code editor is temporarily unavailable. Please try again.
          </p>
          <button
            type="button"
            onClick={retry}
            className="text-sm font-semibold text-brand-500 hover:text-brand-600"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="relative">
          {state === "loading" && (
            <div className="flex h-[420px] w-full items-center justify-center">
              <svg className="h-6 w-6 animate-spin text-navy-500/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          )}
          <iframe
            key={retryKey}
            ref={iframeRef}
            title="Exercise code editor"
            src={embedUrl}
            onLoad={handleIframeLoad}
            onError={handleError}
            className={`w-full border-0 ${state === "loading" ? "hidden" : "block"}`}
            style={{ height: 420 }}
            allow="clipboard-write"
          />
        </div>
      )}
    </div>
  );
}
