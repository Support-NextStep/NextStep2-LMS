import { useId, useRef, useState, type ReactNode } from "react";
import Button from "./Button";
import type { DocumentImportState } from "../data/authoredSession";

/**
 * Shared hybrid authoring panel for every document-driven section
 * (Learning Content, Practice, AI Tutor, Exercise).
 *
 * Implements the "Manual Entry vs DOCX Import" toggle.
 * Both modes operate on the exact same AuthoredSessionDraft shape — DOCX import
 * simply parses and populates the fields, and the author can immediately switch
 * to Manual Entry to see and edit the results.
 */
export default function HybridUploadPanel({
  importState,
  onUpload,
  accept = ".docx",
  uploadLabel = "Upload the official NextStep² session document",
  children,
}: {
  importState: DocumentImportState;
  onUpload: (file: File) => void;
  accept?: string;
  uploadLabel?: string;
  children?: ReactNode;
}) {
  const [mode, setMode] = useState<"manual" | "docx">("manual");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onUpload(file);
  }

  const isBusy = importState.status === "uploading" || importState.status === "extracting";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-max">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "manual" ? "bg-white text-navy-500 shadow-sm" : "text-navy-500/60 hover:text-navy-500"
          }`}
        >
          Manual Entry
        </button>
        <button
          type="button"
          onClick={() => setMode("docx")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "docx" ? "bg-white text-navy-500 shadow-sm" : "text-navy-500/60 hover:text-navy-500"
          }`}
        >
          Import DOCX
        </button>
      </div>

      {mode === "manual" && children}

      {mode === "docx" && (
        <div className="flex flex-col gap-3">
          {importState.status === "none" && (
            <div
              className={`flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
                dragOver ? "border-brand-400 bg-brand-50/40" : "border-slate-300 bg-slate-50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <p className="font-medium text-navy-500">{uploadLabel}</p>
              <p className="text-sm text-navy-500/60">Accepted: {accept} (up to 5 MB)</p>
              <label htmlFor={inputId}>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="file"
                  accept={accept}
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button type="button" className="!w-auto mt-1" onClick={() => inputRef.current?.click()}>
                  Upload DOCX
                </Button>
              </label>
            </div>
          )}

          {isBusy && (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="status" aria-live="polite">
              <svg className="h-6 w-6 animate-spin text-navy-500/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <p className="text-sm font-medium text-navy-500">
                {importState.status === "uploading" ? `Uploading ${importState.fileName}…` : `Reading ${importState.fileName}…`}
              </p>
            </div>
          )}

          {importState.status === "error" && (
            <div className="rounded-xl border border-error/20 bg-error/5 p-5" role="alert">
              <p className="text-sm font-semibold text-error">Couldn&apos;t import {importState.fileName ? `"${importState.fileName}"` : "this document"}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {(importState.errors ?? []).map((err) => (
                  <li key={err} className="text-sm text-navy-500/70">
                    {err}
                  </li>
                ))}
              </ul>
              <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                id={`${inputId}-retry`}
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="secondary"
                className="!w-auto mt-4"
                onClick={() => inputRef.current?.click()}
              >
                Try a different file
              </Button>
            </div>
          )}

          {importState.status === "success" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-2.5">
                <p className="text-sm font-medium text-brand-700">
                  <span aria-hidden="true">✓ </span>
                  Imported from document — <span className="font-mono text-xs">{importState.fileName}</span>
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={accept}
                  className="hidden"
                  id={`${inputId}-replace`}
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button type="button" variant="secondary" className="!w-auto px-4 py-1.5 text-sm" onClick={() => inputRef.current?.click()}>
                  Replace Document
                </Button>
              </div>
              {(importState.warnings ?? []).length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
                  {importState.warnings!.map((w) => (
                    <p key={w} className="flex items-start gap-1.5 text-xs text-amber-800">
                      <span aria-hidden="true" className="mt-0.5">△</span>
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
