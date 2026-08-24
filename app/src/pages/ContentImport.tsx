import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ContentManagerLayout from "../components/ContentManagerLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadContentManagerAccount, type ContentManagerAccount } from "../data/contentManager";
import {
  parseContentPackageZip,
  saveImportedPackage,
  validatePackage,
  type ContentPackageRecord,
  type ParsedPackage,
  type ValidationResult,
} from "../data/contentPackages";

type ImportState = "idle" | "reading" | "error" | "result";

const VALIDATION_CATEGORIES = [
  "Package structure",
  "Course",
  "Subjects",
  "Sessions",
  "Session content",
];

export default function ContentImport() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<ContentManagerAccount | null>(null);
  const [checked, setChecked] = useState(false);

  const [state, setState] = useState<ImportState>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedPackage | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [savedRecord, setSavedRecord] = useState<ContentPackageRecord | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const acct = loadContentManagerAccount();
    if (!acct) {
      navigate("/content/login", { replace: true });
      return;
    }
    setAccount(acct);
    setChecked(true);
  }, [navigate]);

  async function handleFileSelected(file: File) {
    setFileName(file.name);
    setState("reading");
    setReadError(null);

    try {
      const result = await parseContentPackageZip(file);
      const validationResult = validatePackage(result);
      const record = saveImportedPackage(file.name, account?.email ?? "content-manager", result, validationResult);

      setParsed(result);
      setValidation(validationResult);
      setSavedRecord(record);
      setState("result");
    } catch {
      setReadError("Couldn't read this file as a content package .zip. Make sure it's a valid .zip archive.");
      setState("error");
    }
  }

  function handleReset() {
    setState("idle");
    setFileName("");
    setParsed(null);
    setValidation(null);
    setSavedRecord(null);
    setReadError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!checked || !account) return null;

  return (
    <ContentManagerLayout managerName={account.name}>
      <div>
        <BackLink to="/content/dashboard" label="Back to Dashboard" />

        <h1 className="mt-4 text-2xl font-semibold text-navy-500">Import Content Package</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">
          Select a content package .zip prepared by the Content Team, following the structure defined in
          NextStep²'s Content Authoring Structure.
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          {state === "idle" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
              <p className="font-medium text-navy-500">Select a content package</p>
              <p className="text-sm text-navy-500/60">A .zip file containing courses/, subjects/, and sessions/.</p>
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
              />
              <Button type="button" className="!w-auto mt-2" onClick={() => inputRef.current?.click()}>
                Select Package
              </Button>
            </div>
          )}

          {state === "reading" && (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <svg className="h-6 w-6 animate-spin text-navy-500/40" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <p className="text-sm font-medium text-navy-500">Reading {fileName}…</p>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-sm font-medium text-error">{readError}</p>
              <Button type="button" variant="secondary" className="!w-auto mt-2" onClick={handleReset}>
                Try Again
              </Button>
            </div>
          )}

          {state === "result" && parsed && validation && savedRecord && (
            <div className="flex flex-col gap-6">
              {/* Package summary */}
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Package Summary</p>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-navy-500/45">Course{parsed.courses.length === 1 ? "" : "s"}</p>
                    <p className="mt-0.5 font-medium text-navy-500">
                      {parsed.courses[0]?.title || parsed.courses.length || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-navy-500/45">Subjects</p>
                    <p className="mt-0.5 font-medium text-navy-500">
                      {parsed.courses.reduce((s, c) => s + c.subjects.length, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-navy-500/45">Sessions</p>
                    <p className="mt-0.5 font-medium text-navy-500">{savedRecord.sessionCount}</p>
                  </div>
                  <div>
                    <p className="text-navy-500/45">Package Version</p>
                    <p className="mt-0.5 font-medium text-navy-500">{savedRecord.packageVersion || "—"}</p>
                  </div>
                </div>
                {savedRecord.contentTeam && (
                  <p className="mt-3 text-xs text-navy-500/50">Prepared by {savedRecord.contentTeam}</p>
                )}
              </div>

              {/* Validation */}
              <div className="border-t border-slate-100 pt-6">
                <p className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Validation</p>

                {validation.valid ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {VALIDATION_CATEGORIES.map((label) => (
                      <p key={label} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600">
                        <CheckIcon className="h-4 w-4" />
                        {label} valid
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {validation.errors.map((err, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-sm text-error">
                        <XIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <span className="font-mono text-xs text-error/70">{err.path}</span> — {err.message}
                        </span>
                      </p>
                    ))}
                  </div>
                )}

                {validation.warnings.length > 0 && (
                  <div className="mt-4 flex flex-col gap-1.5 rounded-lg bg-slate-50 p-3">
                    {validation.warnings.map((w, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-xs text-navy-500/60">
                        <span className="mt-0.5 text-warning">△</span>
                        <span>
                          <span className="font-mono">{w.path}</span> — {w.message}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Result + actions */}
              <div className="border-t border-slate-100 pt-6">
                {validation.valid ? (
                  <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">
                    Package saved as <strong>Draft</strong>. It has not been reviewed or published — students
                    cannot see it.
                  </div>
                ) : (
                  <div className="rounded-lg bg-error/10 px-4 py-3 text-sm font-medium text-error">
                    This package could not be imported as a usable Draft. Fix the errors above and re-upload a
                    corrected package.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" className="!w-auto px-6" onClick={() => navigate("/content/dashboard")}>
                    Back to Dashboard
                  </Button>
                  <Button type="button" variant="secondary" className="!w-auto px-6" onClick={handleReset}>
                    Import Another Package
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ContentManagerLayout>
  );
}

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
