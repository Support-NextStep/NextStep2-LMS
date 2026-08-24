// ---------------------------------------------------------------------------
// Practice execution provider abstraction.
//
// NextStep² does not run student code itself — no compiler, interpreter,
// sandbox, or backend execution service exists or should exist here. This
// file's only job is to translate a Practice's language into an embed URL
// for whichever external execution layer is configured, so the rest of the
// app (SessionPage) never talks to a specific vendor directly.
//
// Today: OneCompiler's free, documented embedded-editor iframe
//   https://onecompiler.com/embed/{language}
// (no API key, no paid tier — the publicly embeddable editor+run+output UI).
//
// Swapping to a different provider (or a future self-hosted execution
// engine) later means adding a new object of this same shape and changing
// ACTIVE_PROVIDER below — SessionPage and PracticeCodeEmbed never change.
//
// COMMERCIAL NOTE: OneCompiler's public embed is being used here for
// prototype/demo purposes only. Whether their terms permit embedding inside
// a commercial LMS product long-term has NOT been confirmed — see the
// integration report. Do not treat this as a cleared-for-production
// dependency.
// ---------------------------------------------------------------------------

export type CodeFile = { name: string; content: string };

export type EmbedOptions = {
  /**
   * Ask the embed to postMessage the student's code back to the parent page
   * on every change. Practice doesn't need this (it never reads the code
   * back); Exercise does, to capture what the student wrote for submission.
   */
  codeChangeEvent?: boolean;
};

export type PracticeExecutionProvider = {
  name: string;
  /** Returns an iframe-embeddable URL for running code in the given language. */
  getEmbedUrl(language: string, options?: EmbedOptions): string;
  /** Whether this provider can inject starter code into the embed automatically. */
  supportsStarterCodeInjection: boolean;
};

// OneCompiler's embed path expects specific language slugs. Only the ones
// NextStep² currently uses (or is likely to add next) are mapped — anything
// unmapped falls back to "javascript" rather than producing a broken embed.
const ONECOMPILER_LANGUAGE_SLUGS: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  c: "c",
  sql: "postgresql",
  html: "html",
  css: "html", // CSS-only practice still renders through OneCompiler's HTML/CSS/JS embed.
};

function resolveOneCompilerSlug(language: string): string {
  return ONECOMPILER_LANGUAGE_SLUGS[language.toLowerCase()] ?? "javascript";
}

const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  sql: "SQL",
  html: "HTML / CSS / JS",
  css: "HTML / CSS / JS",
};

/** Human-readable label for the language a Practice is configured for — shown in the UI so the student can see the editor matches the task. */
export function getPracticeLanguageLabel(language: string): string {
  return LANGUAGE_LABELS[language.toLowerCase()] ?? language;
}

/**
 * OneCompiler's documented embed origin — every postMessage received from
 * the embed must be verified against this before being trusted.
 * https://onecompiler.com/apis/embed-editor
 */
export const ONECOMPILER_ORIGIN = "https://onecompiler.com";

export const oneCompilerProvider: PracticeExecutionProvider = {
  name: "OneCompiler",
  // Confirmed working via the documented `populateCode` postMessage
  // mechanism (verified against the live embed) — see
  // buildPopulateCodeMessage() below. Practice doesn't use this (it never
  // reads code back), but Exercise does.
  supportsStarterCodeInjection: true,
  getEmbedUrl(language: string, options?: EmbedOptions) {
    const slug = resolveOneCompilerSlug(language);
    const params = new URLSearchParams({
      hideNew: "true",
      hideNewFileOption: "true",
      hideLanguageSelection: "true",
      hideTitle: "true",
      theme: "dark",
    });
    if (options?.codeChangeEvent) {
      params.set("codeChangeEvent", "true");
      params.set("listenToEvents", "true");
    }
    return `https://onecompiler.com/embed/${slug}?${params.toString()}`;
  },
};

/** The provider currently wired into the Practice/Exercise experience. */
export const activePracticeExecutionProvider: PracticeExecutionProvider = oneCompilerProvider;

// ---------------------------------------------------------------------------
// OneCompiler postMessage protocol — parent <-> iframe.
//
// Verified empirically against the live embed (not guessed from docs alone):
//
// Parent -> iframe (populate starter code), sent once the iframe has loaded:
//   iframe.contentWindow.postMessage(
//     { eventType: "populateCode", language, files: [{ name, content }] },
//     ONECOMPILER_ORIGIN
//   )
//
// Iframe -> parent (on every keystroke, when codeChangeEvent=true), as a
// window "message" event whose `data` looks like:
//   { _id, language, files: [{ name, content }], stdin, result, action: "change" }
//
// Only `action === "change"` with a valid `files` array is treated as a real
// code-change message here — anything else (unrelated messages from other
// embeds/extensions, malformed payloads, wrong origin) is silently ignored.
// ---------------------------------------------------------------------------

const DEFAULT_FILE_NAMES: Record<string, string> = {
  javascript: "index.js",
  typescript: "index.ts",
  python: "main.py",
  java: "Main.java",
  csharp: "Main.cs",
  cpp: "main.cpp",
  c: "main.c",
  sql: "query.sql",
  html: "index.html",
  css: "index.html",
};

/** A reasonable single-file name for a language, used when populating starter code or building a fallback file. */
export function defaultFileName(language: string): string {
  return DEFAULT_FILE_NAMES[language.toLowerCase()] ?? "index.txt";
}

export function buildPopulateCodeMessage(language: string, files: CodeFile[]) {
  return {
    eventType: "populateCode",
    language: resolveOneCompilerSlug(language),
    files,
  };
}

/**
 * Validates and extracts the code files from a raw window "message" event.
 * Returns null for anything that isn't a genuine OneCompiler code-change
 * message — wrong origin, wrong shape, or an unrelated postMessage from
 * elsewhere on the page. Never throws.
 */
export function parseOneCompilerChangeEvent(event: MessageEvent): CodeFile[] | null {
  if (event.origin !== ONECOMPILER_ORIGIN) return null;

  const data = event.data;
  if (!data || typeof data !== "object") return null;
  if (data.action !== "change") return null;
  if (!Array.isArray(data.files)) return null;

  const files: CodeFile[] = [];
  for (const f of data.files) {
    if (!f || typeof f.name !== "string" || typeof f.content !== "string") continue;
    files.push({ name: f.name, content: f.content });
  }
  return files;
}
