import { activePracticeExecutionProvider } from "../data/practiceExecution";
import { useCodeEmbedLoadState } from "../hooks/useCodeEmbedLoadState";

/**
 * Embeds the active Practice execution provider's editor (today: OneCompiler)
 * inside the existing NextStep² Practice card. NextStep² never executes code
 * itself — this component only renders the provider's iframe and handles the
 * loading/error states around it. Run + Output both live inside that iframe,
 * since that's what the provider's embed already gives us.
 *
 * The load/failure state machine lives in useCodeEmbedLoadState — shared
 * with ExerciseCodeEmbed so both stay consistent without duplicating that
 * logic. See that hook for why a plain iframe onLoad/onError isn't enough.
 */
export default function PracticeCodeEmbed({ language }: { language: string }) {
  const embedUrl = activePracticeExecutionProvider.getEmbedUrl(language);
  const { state, retryKey, handleLoad, handleError, retry } = useCodeEmbedLoadState(embedUrl);

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
            title="Practice code editor"
            src={embedUrl}
            onLoad={handleLoad}
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
