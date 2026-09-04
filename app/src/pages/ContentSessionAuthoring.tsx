import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import HybridUploadPanel from "../components/HybridUploadPanel";
import StringListEditor from "../components/StringListEditor";
import { loadContentAuthorAccount, type ContentAuthorAccount } from "../data/contentAuthor";
import { getSubjectSummary, listCourses } from "../data/mock";
import { getPracticeLanguageLabel } from "../data/practiceExecution";
import {
  MANDATORY_SECTIONS,
  SECTION_KEYS,
  SECTION_LABELS,
  type AuthoredCheckpoint,
  type AuthoredSessionDraft,
  type SectionKey,
  type SectionState,
  canSubmitForReview,
  computeSectionState,
  createEmptyCheckpoint,
  createEmptyDraft,
  createPackageForDraft,
  formatTimestamp,
  getIncompleteMandatorySections,
  loadDraftForSession,
  parseTimestamp,
  saveDraft,
  submitForReview,
  uploadExerciseDocument,
  uploadLearningContentDocument,
  uploadPracticeDocument,
} from "../data/authoredSession";

const LANGUAGES = ["javascript", "typescript", "python", "java", "csharp", "cpp", "c", "sql", "html"];

function deslugify(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Shared shell + small pieces reused across every section panel below.
// ---------------------------------------------------------------------------

function SectionShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-navy-500">{title}</h2>
        {description && <p className="mt-1 text-sm text-navy-500/60">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-navy-500">{label}</span>
      {children}
      {hint && <span className="text-xs text-navy-500/45">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20";

function SectionStatusIcon({ state }: { state: SectionState }) {
  if (state === "complete") return <span className="font-bold text-brand-500" aria-label="Complete">✓</span>;
  if (state === "attention") return <span className="font-bold text-amber-500" aria-label="Needs attention">⚠</span>;
  if (state === "skipped") return <span className="text-navy-500/30" aria-label="Skipped, not applicable">—</span>;
  return <span className="text-navy-500/30" aria-label="Not started">○</span>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-navy-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Section panels
// ---------------------------------------------------------------------------

function SessionInfoPanel({ draft, onChange }: { draft: AuthoredSessionDraft; onChange: (patch: Partial<AuthoredSessionDraft>) => void }) {
  return (
    <SectionShell title="Session Information" description="The basics every student sees before they start this session.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Course">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-navy-500/70">{draft.courseTitle}</p>
        </Field>
        <Field label="Subject">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-navy-500/70">{draft.subjectTitle}</p>
        </Field>
      </div>
      <Field label="Session Title">
        <input type="text" className={inputClass} value={draft.sessionTitle} onChange={(e) => onChange({ sessionTitle: e.target.value })} />
      </Field>
      <Field label="Session Description">
        <textarea rows={2} className={inputClass} value={draft.sessionDescription} onChange={(e) => onChange({ sessionDescription: e.target.value })} />
      </Field>
    </SectionShell>
  );
}

function LearningContentPanel({
  draft,
  onUpload,
  onChange,
}: {
  draft: AuthoredSessionDraft;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<AuthoredSessionDraft>) => void;
}) {
  return (
    <SectionShell
      title="Learning Content"
      description="Upload the official NextStep² Session Content Document — Key Concepts and Examples all come from this one file."
    >
      <HybridUploadPanel importState={draft.learning.import} onUpload={onUpload} uploadLabel="Upload the Learning Content section of the session document">
        <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <Field label="Learning Objective" hint="What students should be able to do by the end of this session.">
            <textarea rows={2} className={inputClass} value={draft.learning.objective} onChange={(e) => onChange({ learning: { ...draft.learning, objective: e.target.value } })} />
          </Field>
          <Field label="Explanation" hint="Optional — the fuller walkthrough shown below the objective on the student page.">
            <textarea rows={4} className={inputClass} value={draft.learning.explanation} onChange={(e) => onChange({ learning: { ...draft.learning, explanation: e.target.value } })} />
          </Field>
          <Field label="Examples">
            <StringListEditor items={draft.learning.examples} onChange={(examples) => onChange({ learning: { ...draft.learning, examples } })} placeholder="Example" addLabel="+ Add example" />
          </Field>
          <Field label="Key Concepts">
            <StringListEditor items={draft.learning.keyConcepts} onChange={(keyConcepts) => onChange({ learning: { ...draft.learning, keyConcepts } })} placeholder="Key Concept" addLabel="+ Add concept" />
          </Field>
          <Field label="Concept Tags" hint="Optional — short topic tags (e.g. form, validation), shown to students inside Need Help.">
            <StringListEditor items={draft.learning.conceptTags} onChange={(conceptTags) => onChange({ learning: { ...draft.learning, conceptTags } })} placeholder="Tag" addLabel="+ Add tag" />
          </Field>
        </div>
      </HybridUploadPanel>
    </SectionShell>
  );
}

function VideoPanel({ draft, onChange }: { draft: AuthoredSessionDraft; onChange: (patch: Partial<AuthoredSessionDraft>) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const idMatch = draft.video.youtubeUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/i);
  const youtubeId = idMatch ? idMatch[1] : null;

  return (
    <SectionShell title="Video" description="Optional — this session can be text/practice-driven with no video.">
      <ToggleRow
        label="This session includes a video"
        checked={draft.videoIncluded}
        onChange={(videoIncluded) => onChange({ videoIncluded })}
      />
      {!draft.videoIncluded ? (
        <p className="text-sm text-navy-500/50">Video marked as not applicable for this session.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="YouTube URL" hint="Unlisted, with embedding enabled">
            <input
              type="text"
              className={inputClass}
              value={draft.video.youtubeUrl}
              onChange={(e) => onChange({ video: { ...draft.video, youtubeUrl: e.target.value } })}
              placeholder="https://youtu.be/..."
            />
          </Field>
          <Field label="Video Title">
            <input type="text" className={inputClass} value={draft.video.title} onChange={(e) => onChange({ video: { ...draft.video, title: e.target.value } })} />
          </Field>

          <Button type="button" variant="secondary" className="!w-auto px-6" onClick={() => setShowPreview(true)} disabled={!youtubeId}>
            Preview Video
          </Button>
          {showPreview && youtubeId && (
            <div className="relative aspect-video w-full max-w-lg overflow-hidden rounded-xl border border-slate-200">
              <iframe
                title="Video preview"
                src={`https://www.youtube.com/embed/${youtubeId}`}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {showPreview && !youtubeId && <p className="text-sm text-error">This doesn&apos;t look like a valid YouTube URL yet.</p>}
        </div>
      )}
    </SectionShell>
  );
}

function CheckpointCard({
  checkpoint,
  onChange,
  onRemove,
}: {
  checkpoint: AuthoredCheckpoint;
  onChange: (patch: Partial<AuthoredCheckpoint>) => void;
  onRemove: () => void;
}) {
  const [timestampText, setTimestampText] = useState(formatTimestamp(checkpoint.timestampSeconds));

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center justify-between">
        <Field label="Timestamp" hint="mm:ss — enter manually and adjust as needed">
          <input
            type="text"
            className={`${inputClass} !w-32`}
            value={timestampText}
            onChange={(e) => {
              setTimestampText(e.target.value);
              const seconds = parseTimestamp(e.target.value);
              if (seconds !== null) onChange({ timestampSeconds: seconds });
            }}
            placeholder="04:20"
          />
        </Field>
        <button type="button" onClick={onRemove} aria-label="Delete checkpoint" className="text-sm font-medium text-error hover:text-error/80">
          Delete
        </button>
      </div>

      <Field label="Question">
        <textarea rows={2} className={inputClass} value={checkpoint.question} onChange={(e) => onChange({ question: e.target.value })} />
      </Field>

      {/* MVP supports Multiple Choice only — no Question Type selector until a
          second type actually exists (see NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §B).
          A disabled dropdown showing one hardcoded option was worse than no
          control at all: it implied a capability that was never real. */}

      <Field label="Options">
        <StringListEditor items={checkpoint.options} onChange={(options) => onChange({ options })} placeholder="Option" addLabel="+ Add option" />
      </Field>

      <Field label="Correct Answer">
        <select
          className={inputClass}
          value={checkpoint.correctIndex}
          onChange={(e) => onChange({ correctIndex: Number(e.target.value) })}
        >
          {checkpoint.options.map((opt, i) => (
            <option key={i} value={i}>
              {opt || `Option ${i + 1}`}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Feedback" hint="Shown after the student answers, right or wrong">
        <textarea rows={2} className={inputClass} value={checkpoint.feedback} onChange={(e) => onChange({ feedback: e.target.value })} />
      </Field>

      {/* "Continue after answer" was removed (Video Checkpoint System Slice 1,
          §D) — there was only ever one real post-answer behavior (continue
          immediately, right or wrong), so the setting had no effect on
          student behavior. See NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §D. */}
      <Field label="Required" hint="Must the student answer this before the session can be completed?">
        <select className={inputClass} value={checkpoint.required ? "yes" : "no"} onChange={(e) => onChange({ required: e.target.value === "yes" })}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </Field>
    </div>
  );
}

function CheckpointsPanel({ draft, onChange }: { draft: AuthoredSessionDraft; onChange: (patch: Partial<AuthoredSessionDraft>) => void }) {
  if (!draft.videoIncluded) {
    return (
      <SectionShell title="Video Checkpoints">
        <p className="text-sm text-navy-500/50">Add a video first — checkpoints belong to a video.</p>
      </SectionShell>
    );
  }

  function updateCheckpoint(id: string, patch: Partial<AuthoredCheckpoint>) {
    onChange({ checkpoints: draft.checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function removeCheckpoint(id: string) {
    onChange({ checkpoints: draft.checkpoints.filter((c) => c.id !== id) });
  }
  function addCheckpoint() {
    onChange({ checkpointsIncluded: true, checkpoints: [...draft.checkpoints, createEmptyCheckpoint()] });
  }

  return (
    <SectionShell title="Video Checkpoints" description="Optional — a video may have zero, one, or several checkpoints.">
      <ToggleRow
        label="This video has checkpoints"
        checked={draft.checkpointsIncluded}
        onChange={(checkpointsIncluded) => onChange({ checkpointsIncluded })}
      />
      {!draft.checkpointsIncluded ? (
        <p className="text-sm text-navy-500/50">Checkpoints marked as not applicable for this video.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {draft.checkpoints.map((cp, i) => (
            <div key={cp.id}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500/40">Checkpoint #{i + 1}</p>
              <CheckpointCard checkpoint={cp} onChange={(patch) => updateCheckpoint(cp.id, patch)} onRemove={() => removeCheckpoint(cp.id)} />
            </div>
          ))}
          <Button type="button" variant="secondary" className="!w-auto px-6" onClick={addCheckpoint}>
            + Add Checkpoint
          </Button>
        </div>
      )}
    </SectionShell>
  );
}

function PracticePanel({
  draft,
  onUpload,
  onLanguageChange,
  onStarterCodeChange,
  onChange,
}: {
  draft: AuthoredSessionDraft;
  onUpload: (file: File) => void;
  onLanguageChange: (language: string) => void;
  onStarterCodeChange: (code: string) => void;
  onChange: (patch: Partial<AuthoredSessionDraft>) => void;
}) {
  return (
    <SectionShell title="Practice" description="Guided learning, not evaluation — reinforces the concept just taught.">
      <HybridUploadPanel importState={draft.practice.import} onUpload={onUpload} uploadLabel="Upload the Practice section of the session document">
        <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <Field label="Task">
            <textarea rows={4} className={inputClass} value={draft.practice.task} onChange={(e) => onChange({ practice: { ...draft.practice, task: e.target.value } })} />
          </Field>
        </div>
      </HybridUploadPanel>

      <div className="border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Code Configuration</h3>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Language">
            <select className={inputClass} value={draft.practice.language} onChange={(e) => onLanguageChange(e.target.value)}>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {getPracticeLanguageLabel(lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starter Code" hint="Optional — shown to the student as a copy-paste reference">
            <textarea
              rows={6}
              className={`${inputClass} font-mono text-xs`}
              value={draft.practice.starterCode}
              onChange={(e) => onStarterCodeChange(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </SectionShell>
  );
}

function AiHelpPanel({
  draft,
  onChange,
}: {
  draft: AuthoredSessionDraft;
  onChange: (patch: Partial<AuthoredSessionDraft>) => void;
}) {
  return (
    <SectionShell title="AI Tutor" description="Optional — give students an AI tutor for this session.">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 mt-4">
        <Field label="Suggested Prompts" hint="Optional — these are conversation starters students can click.">
          <StringListEditor
            items={draft.aiHelp.suggestedPrompts}
            onChange={(prompts) => onChange({ aiHelp: { ...draft.aiHelp, suggestedPrompts: prompts } })}
            placeholder="e.g. Explain this concept in simpler terms"
            addLabel="+ Add Suggested Prompt"
          />
        </Field>
      </div>
    </SectionShell>
  );
}

function ExercisePanel({
  draft,
  onUpload,
  onLanguageChange,
  onStarterCodeChange,
  onChange,
}: {
  draft: AuthoredSessionDraft;
  onUpload: (file: File) => void;
  onLanguageChange: (language: string) => void;
  onStarterCodeChange: (code: string) => void;
  onChange: (patch: Partial<AuthoredSessionDraft>) => void;
}) {
  return (
    <SectionShell title="Exercise" description="Independent application — this is what a future evaluator will eventually check submissions against.">
      <HybridUploadPanel importState={draft.exercise.import} onUpload={onUpload} uploadLabel="Upload the Exercise section of the session document">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <Field label="Objective">
            <textarea rows={2} className={inputClass} value={draft.exercise.objective} onChange={(e) => onChange({ exercise: { ...draft.exercise, objective: e.target.value } })} />
          </Field>
          <Field label="Scenario / Problem" hint="Optional">
            <textarea rows={3} className={inputClass} value={draft.exercise.scenario || ""} onChange={(e) => onChange({ exercise: { ...draft.exercise, scenario: e.target.value } })} />
          </Field>
          <Field label="Requirements">
            <StringListEditor items={draft.exercise.requirements} onChange={(requirements) => onChange({ exercise: { ...draft.exercise, requirements } })} placeholder="Requirement" addLabel="+ Add requirement" />
          </Field>
          <Field label="Expected Behaviour" hint="Optional">
            <textarea rows={2} className={inputClass} value={draft.exercise.expectedBehaviour || ""} onChange={(e) => onChange({ exercise: { ...draft.exercise, expectedBehaviour: e.target.value } })} />
          </Field>
          <Field label="Evaluation Criteria" hint="Written as statements that can be checked as true or false — this drives future AI-assisted evaluation.">
            <StringListEditor items={draft.exercise.evaluationCriteria} onChange={(evaluationCriteria) => onChange({ exercise: { ...draft.exercise, evaluationCriteria } })} placeholder="Criterion" addLabel="+ Add criterion" />
          </Field>
          <Field label="Edge Cases" hint="Optional">
            <StringListEditor items={draft.exercise.edgeCases} onChange={(edgeCases) => onChange({ exercise: { ...draft.exercise, edgeCases } })} placeholder="Edge Case" addLabel="+ Add edge case" />
          </Field>
        </div>
      </HybridUploadPanel>

      <div className="border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">Code Configuration</h3>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Language">
            <select className={inputClass} value={draft.exercise.language} onChange={(e) => onLanguageChange(e.target.value)}>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {getPracticeLanguageLabel(lang)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starter Code" hint="Optional — auto-loaded into the student's editor if provided">
            <textarea
              rows={6}
              className={`${inputClass} font-mono text-xs`}
              value={draft.exercise.starterCode}
              onChange={(e) => onStarterCodeChange(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </SectionShell>
  );
}



// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ContentSessionAuthoring() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state ?? {}) as { sessionTitle?: string; sessionDescription?: string };
  const { courseId = "", subjectId = "", sessionId = "" } = useParams<{ courseId: string; subjectId: string; sessionId: string }>();

  const [account, setAccount] = useState<ContentAuthorAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState<AuthoredSessionDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("sessionInfo");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // loadContentAuthorAccount() is now a real backend call (Phase 0) — see
    // ../data/contentAuthor.ts. listCourses()/getSubjectSummary() below stay
    // synchronous — they read a locally-cached catalog kept in sync with
    // the backend by ../data/courseCatalog.ts, not a direct network call.
    (async () => {
      const acct = await loadContentAuthorAccount();
      if (cancelled) return;
      if (!acct) {
        navigate("/content/login", { replace: true });
        return;
      }
      setAccount(acct);

      // Everything from here on is a real network call that can fail for a
      // reason genuinely outside the author's control — most notably, the
      // session this URL points at no longer existing server-side (a stale
      // link/bookmark, or a browser tab left open across a curriculum reset
      // like the one this bug was found from). Left uncaught, that surfaced
      // as an unhandled promise rejection and a page stuck loading forever;
      // caught here, it becomes the same kind of friendly "can't be
      // authored" message ContentPreviewSession.tsx already shows for the
      // analogous "nothing there any more" case.
      try {
        const resumable = await loadDraftForSession(sessionId);
        if (cancelled) return;
        if (resumable.kind === "content") {
          setDraft(resumable.draft);
          setLastSavedAt(resumable.draft.updatedAt);
        } else {
          const course = listCourses().find((c) => c.id === courseId);
          const subject = getSubjectSummary(subjectId);
          const empty = createEmptyDraft({
            courseId,
            courseTitle: course?.title ?? courseId,
            subjectId,
            subjectTitle: subject?.title ?? subjectId,
            sessionId,
            sessionTitle: locationState.sessionTitle ?? deslugify(sessionId),
            authoredBy: acct.email,
          });
          empty.sessionDescription = locationState.sessionDescription ?? "";

          if (resumable.kind === "empty") {
            // A package row already exists for this session (created, then
            // abandoned before the first Save Draft) — reuse its real id
            // rather than calling createPackageForDraft() again, which would
            // hit the backend's "one active package per session" constraint
            // as a 409 (the abandoned row is still active).
            setDraft({ ...empty, packageId: resumable.packageId });
          } else {
            // createEmptyDraft() generates a local placeholder id synchronously
            // (no backend dependency) — this is the one point where the real
            // backend ContentPackage actually gets created, and the draft in
            // React state is corrected to use its server-issued id. Fails
            // with a 404 if `sessionId` doesn't exist server-side at all —
            // see the try/catch this is inside.
            const fresh = await createPackageForDraft(empty);
            if (cancelled) return;
            setDraft(fresh);
          }
          setLastSavedAt(null);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "This session couldn't be loaded.");
      }
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, subjectId, sessionId, navigate]);

  if (!checked || !account) return null;

  if (loadError || !draft) {
    return (
      <ContentAuthorLayout authorName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">This session couldn&apos;t be opened for authoring.</p>
          <p className="mt-1.5 text-sm text-navy-500/60">
            {loadError ?? "It may no longer exist."} Go back and pick it from the course/subject list again.
          </p>
          <div className="mt-4 flex justify-center">
            <BackLink to={`/content/courses/${courseId}/subjects/${subjectId}`} label="Back to Sessions" />
          </div>
        </div>
      </ContentAuthorLayout>
    );
  }

  function updateDraft(patch: Partial<AuthoredSessionDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleSaveDraft() {
    if (!draft) return;
    const saved = await saveDraft(draft);
    setDraft(saved);
    setLastSavedAt(saved.updatedAt);
  }

  // `draft` is narrowed to non-null above, but that narrowing doesn't persist
  // into nested `function` declarations (they're hoisted, so TS can't prove
  // they're only ever called after the guard). Capturing it in a `const`
  // here, and using arrow-function expressions below (which — unlike
  // hoisted declarations — participate in linear control-flow narrowing),
  // keeps every handler and the render below fully typed without a single
  // `!`/`as` escape hatch.
  const sessionDraft: AuthoredSessionDraft = draft;

  const handleSubmitForReview = async () => {
    if (!canSubmitForReview(sessionDraft)) return;
    const saved = await saveDraft(sessionDraft);
    // The server re-validates completeness independently (never trust the
    // client-disabled button alone for a state transition that matters) and
    // is what actually flips status to READY_FOR_REVIEW and snapshots the
    // immutable ContentVersion a reviewer will see.
    await submitForReview(saved.packageId);
    // Lands on the Content Team's own read-only submission-status view — the
    // Approval Team's review/approve/publish workstation lives at
    // /review/package/:id instead (see ContentPackageDetail.tsx's role prop).
    navigate(`/content/submissions/${saved.packageId}`);
  };

  const incompleteSections = getIncompleteMandatorySections(sessionDraft);
  const canSubmit = incompleteSections.length === 0;

  const goToSection = (key: SectionKey) => {
    setActiveSection(key);
    setMobileNavOpen(false);
  };

  const handleLearningUpload = async (file: File) => {
    updateDraft({ learning: { ...sessionDraft.learning, import: { status: "uploading", fileName: file.name } } });
    const result = await uploadLearningContentDocument(file);
    if (result.ok) {
      updateDraft({
        learning: {
          import: { status: "success", fileName: result.fileName, importedAt: result.importedAt, warnings: result.warnings },
          objective: sessionDraft.learning.objective,
          ...result.data,
        },
      });
    } else {
      updateDraft({ learning: { ...sessionDraft.learning, import: { status: "error", fileName: file.name, errors: result.errors } } });
    }
  };

  const handlePracticeUpload = async (file: File) => {
    updateDraft({ practice: { ...sessionDraft.practice, import: { status: "uploading", fileName: file.name } } });
    const result = await uploadPracticeDocument(file);
    if (result.ok) {
      updateDraft({
        practice: {
          ...sessionDraft.practice,
          import: { status: "success", fileName: result.fileName, importedAt: result.importedAt, warnings: result.warnings },
          ...result.data,
        },
      });
    } else {
      updateDraft({ practice: { ...sessionDraft.practice, import: { status: "error", fileName: file.name, errors: result.errors } } });
    }
  };

  const handleExerciseUpload = async (file: File) => {
    updateDraft({ exercise: { ...sessionDraft.exercise, import: { status: "uploading", fileName: file.name } } });
    const result = await uploadExerciseDocument(file);
    if (result.ok) {
      updateDraft({
        exercise: {
          ...sessionDraft.exercise,
          import: { status: "success", fileName: result.fileName, importedAt: result.importedAt, warnings: result.warnings },
          ...result.data,
        },
      });
    } else {
      updateDraft({ exercise: { ...sessionDraft.exercise, import: { status: "error", fileName: file.name, errors: result.errors } } });
    }
  };



  const renderSection = () => {
    switch (activeSection) {
      case "sessionInfo":
        return <SessionInfoPanel draft={sessionDraft} onChange={updateDraft} />;
      case "learning":
        return <LearningContentPanel draft={sessionDraft} onUpload={handleLearningUpload} onChange={updateDraft} />;
      case "video":
        return <VideoPanel draft={sessionDraft} onChange={updateDraft} />;
      case "checkpoints":
        return <CheckpointsPanel draft={sessionDraft} onChange={updateDraft} />;
      case "practice":
        return (
          <PracticePanel
            draft={sessionDraft}
            onUpload={handlePracticeUpload}
            onLanguageChange={(language) => updateDraft({ practice: { ...sessionDraft.practice, language } })}
            onStarterCodeChange={(starterCode) => updateDraft({ practice: { ...sessionDraft.practice, starterCode } })}
            onChange={updateDraft}
          />
        );
      case "aiHelp":
        return (
          <AiHelpPanel draft={sessionDraft} onChange={updateDraft} />
        );
      case "exercise":
        return (
          <ExercisePanel
            draft={sessionDraft}
            onUpload={handleExerciseUpload}
            onLanguageChange={(language) => updateDraft({ exercise: { ...sessionDraft.exercise, language } })}
            onStarterCodeChange={(starterCode) => updateDraft({ exercise: { ...sessionDraft.exercise, starterCode } })}
            onChange={updateDraft}
          />
        );
    }
  };

  return (
    <ContentAuthorLayout authorName={account.name}>
      <div className="flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="min-w-0">
            <BackLink to={`/content/courses/${courseId}/subjects/${subjectId}`} label="Sessions" />
            <h1 className="mt-2 truncate text-2xl font-bold text-navy-500">{sessionDraft.sessionTitle || "Untitled Session"}</h1>
            <p className="mt-1 text-xs text-navy-500/45">{lastSavedAt ? `Last saved ${formatSavedAt(lastSavedAt)}` : "Not saved yet"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-navy-500 lg:hidden"
              aria-expanded={mobileNavOpen}
            >
              Sections
            </button>
            <Button type="button" variant="secondary" className="!w-auto px-6" onClick={handleSaveDraft}>
              Save Draft
            </Button>
          </div>
        </div>

        {/* Mobile section navigation */}
        {mobileNavOpen && (
          <nav aria-label="Session sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
            {SECTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => goToSection(key)}
                aria-current={activeSection === key ? "true" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-500 ${
                  activeSection === key ? "border-brand-500 bg-brand-50 text-brand-600" : "border-slate-200 bg-white text-navy-500/70"
                }`}
              >
                <SectionStatusIcon state={computeSectionState(sessionDraft, key)} />
                {SECTION_LABELS[key]}
              </button>
            ))}
          </nav>
        )}

        {/* Validation summary — visible whenever mandatory sections are incomplete, any viewport */}
        {!canSubmit && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Complete these sections before submitting:</p>
            <ul className="mt-2 flex flex-wrap gap-3">
              {incompleteSections.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => goToSection(key)}
                    className="text-sm font-medium text-amber-700 underline hover:text-amber-800"
                  >
                    {SECTION_LABELS[key]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Desktop sidebar */}
          <aside className="hidden shrink-0 lg:sticky lg:top-24 lg:flex lg:w-64 lg:flex-col lg:gap-1">
            <nav className="flex flex-col gap-1" aria-label="Session sections">
              {SECTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => goToSection(key)}
                  aria-current={activeSection === key ? "true" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    activeSection === key ? "bg-brand-50 text-brand-600" : "text-navy-500/70 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{SECTION_LABELS[key]}</span>
                  <SectionStatusIcon state={computeSectionState(sessionDraft, key)} />
                  {MANDATORY_SECTIONS.includes(key) && <span className="sr-only">(required)</span>}
                </button>
              ))}
            </nav>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <Button type="button" onClick={handleSubmitForReview} disabled={!canSubmit} className={!canSubmit ? "opacity-50" : ""}>
                Submit for Review
              </Button>
            </div>
          </aside>

          {/* Main content */}
          <main className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">{renderSection()}</main>
        </div>

        {/* Mobile submit action */}
        <div className="lg:hidden">
          <Button type="button" onClick={handleSubmitForReview} disabled={!canSubmit} className={!canSubmit ? "opacity-50" : ""}>
            Submit for Review
          </Button>
        </div>
      </div>
    </ContentAuthorLayout>
  );
}
