# NextStep² Content Document-First Model — Final Specification

**Status:** Design/product specification only. No React code, backend, database, API, parser, or package was created or modified to produce this document.

**Relationship to existing documents — read this first:**
- `NEXTSTEP2_CONTENT_AUTHORING_TEMPLATE.md` froze **what fields exist** per session (the 8-section field contract) and the YouTube capability research. **Unchanged here** — every field, its name, and its requiredness stays exactly as that document defined it. This document only changes *how a Content Team member gets those fields into the system* for a specific subset of them.
- `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` froze **where content lands** (`ContentVersion`, `Exercise`, `ContentReview`, `Publication`, etc.). **Unchanged here**, per explicit instruction — the entities, the versioning rule, and the supersession mechanism are not redesigned; this document only changes what *produces* a `ContentVersion`, not its shape.
- `NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md` designed a workspace where the Content Team **typed content directly into web form fields**, section by section. **This document explicitly revises that assumption** for the sections that are now document-authored — see §0 below. This is called out once, clearly, rather than silently contradicted throughout.

---

## 0. Explicit Conflict Declaration (required before anything else)

Two real conflicts exist between this document and `NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md`. Both are resolved here, in this document's favor, because this task represents a newer, explicit product decision — not silently, but stated plainly:

1. **Data-entry mechanism for four sections.** The prior workflow document's §3, §6, §7, and §8 had the Content Team type Learning Content, Practice's task/instructions, Exercise's problem/requirements/criteria, and AI Help's prompts/replies **directly into web form fields**. This document replaces that mechanism: those four sections are now **document-first** — written in an official `.docx` template and uploaded, not typed field-by-field. **What does not change:** the left-sidebar workspace shell, the per-section ✓/⚠/○/Skipped status model, `Save Draft`/`Submit for Review`, and the underlying field contract itself. Only the *input mechanism* for these four sections changes — see §14 for how the sidebar model accommodates this.

2. **An open recommendation, now resolved as "not adopted."** That same prior document's §15 critique *proposed* (not froze) merging Exercise's "Edge Cases" into "Evaluation Criteria," reasoning that non-technical authors might not distinguish them cleanly. This task's own §4 explicitly re-lists Edge Cases as its own item. This document keeps Edge Cases as a **separate, distinct heading** — the prior proposal is noted as considered and not taken, not silently ignored.

No other frozen decision from any prior document is changed by this one.

---

## 1. The Official Content Document

**One document covers one Session.** It is a Microsoft Word (`.docx`) file, pre-built by NextStep² with the headings already in place using real Word **Heading styles** (Heading 1 / Heading 2) — not just bold, large text. This matters directly for §9: a Heading *style* is real, machine-readable structure inside the file; bold-and-big text that merely *looks* like a heading is not, and cannot be parsed reliably. The Content Team downloads this template, opens it in Word (or a compatible editor — Google Docs, LibreOffice — anything that preserves Word heading styles on export), and fills it in like any other document.

```
[Heading 1]  SESSION INFORMATION
    Course:
    Subject:
    Session Title:
    Session Description:
    Learning Objective:
    Estimated Duration:        (optional)
    Prerequisites:              (optional)

[Heading 1]  LEARNING CONTENT
    [Heading 2]  Introduction
    [Heading 2]  Concept: <name>        (repeat as needed — see §2)
    [Heading 2]  Example                 (repeat as needed — see §2)
    [Heading 2]  Common Mistakes         (optional)
    [Heading 2]  Summary                 (optional)
    [Heading 2]  Key Concepts            (bullet list)
    [Heading 2]  Concept Tags            (bullet list)

[Heading 1]  VIDEO INFORMATION           (omit entirely if this session has no video)
    YouTube URL:
    Video Title:
    Description:                (optional)

[Heading 1]  PRACTICE
    Practice Objective:
    Practice Instructions:
    Expected Learning:
    [Heading 2]  Self-Check               (bullet list)

[Heading 1]  AI HELP
    [Heading 2]  Quick Prompt: <question text>     (repeat as needed)
        Guidance:
    Default Guidance:

[Heading 1]  EXERCISE
    Exercise Title:
    Objective:
    Scenario / Problem:
    [Heading 2]  Requirements             (bullet list)
    Expected Behaviour:
    [Heading 2]  Evaluation Criteria      (bullet list — see §4)
    [Heading 2]  Edge Cases               (bullet list)
    Submission Instructions:    (optional)
```

**What is deliberately absent from the document:** Video Checkpoints, Practice/Exercise Language and Starter Code, and Session Settings. These are UI-only — see §15 for exactly why, and §6/§7 for Video specifically.

---

## 2. Learning Content — Heading Structure

The task's own example (Introduction / Concept 1 / Concept 2 / Example / Common Mistakes / Summary) is the right shape — but it needs one precise clarification that the field-level contract already frozen in the Template document requires: **not every subheading becomes its own stored field.**

**The extraction rule, stated exactly:**
- `Introduction`, every `Concept: <name>`, `Common Mistakes`, and `Summary` are **authoring aids for the Content Team's own organization** — at extraction time they are concatenated, in the order they appear in the document, into **one** free-text `explanation` field. A simple topic might only use `Introduction`; a topic with several named ideas (like Async and Await) can repeat `Concept: <name>` as many times as needed. Neither the number nor the presence of these subheadings is enforced — this preserves the already-frozen principle from `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md` that a session's explanation "has no fixed subsection template."
- Each `Example` subsection becomes **one item** in the `examples[]` list — these are extracted separately, not folded into the explanation text, because `examples[]` is a genuinely distinct field the Student UI renders as its own bulleted block.
- `Key Concepts` and `Concept Tags` are bullet lists, each bullet becoming one array item — matching `keyConcepts[]` and `concepts[]` exactly as already frozen.

**Do not over-structure it — the explicit floor is one subheading, `Introduction`, with everything else optional.** A Content Team member writing a short, simple session can just write `Introduction` and be done with the prose part; they are never forced to invent artificial "Concept 2" / "Common Mistakes" content that doesn't apply to their topic.

---

## 3. Practice

Document-first fields: **Practice Objective, Practice Instructions, Expected Learning, Self-Check.** Language and Starter Code are UI-only — see §5.

**"Expected Learning" — an honest flag, not a silent addition.** This field is genuinely useful context for the Content Manager's review (why does this Practice exist, what should it reinforce) but has **no current rendering slot in the Student Session UI** — the same honest treatment already given to Estimated Duration and Prerequisites in the Template document. It's captured because it's useful for review and future planning, not because it's shown to students today.

**Self-Check stays a self-review checklist — restated because it matters every time it appears.** The bullet list under `Self-Check` becomes the Practice checklist labels exactly as already frozen; nothing here is graded automatically, and the official template includes a visible instruction line reminding the Content Team to phrase each item as something a student checks against their own code, never as a pass/fail judgment the system makes.

---

## 4. Exercise

Document-first fields: **Exercise Title, Objective, Scenario/Problem, Requirements, Expected Behaviour, Evaluation Criteria, Edge Cases, Submission Instructions.** Language and Starter Code are UI-only — see §5.

**Evaluation Criteria is the one field where the official template includes worked good/bad examples directly in the document** (not just in this specification, where a Content Team member would never see it):

```
    [Heading 2]  Evaluation Criteria
        (Write each item as something a person or a future automated
         evaluator could check as true or false — not a general judgment
         of understanding.)

         BAD:  "Student should understand async."
         GOOD: "Submitted implementation must use async/await to handle
                the asynchronous operation and must correctly handle the
                resolved value."

         Your criteria:
         -
         -
```

Putting the example **inside the template itself**, right where the Content Team is about to write, is a deliberate authoring-quality decision — it's the same principle already applied in the prior workflow document's UI mockup, just relocated to where the Content Team actually is now (a document, not a web form).

---

## 5. Starter Code — evaluated, not assumed

Three options, evaluated honestly:

| Option | Verdict |
|---|---|
| **A. Inside the document** | **Rejected.** Word processors actively corrupt code: smart quotes silently replace straight quotes (which can break string literals), auto-capitalization and auto-indent alter whitespace-sensitive code, and font substitution can change character-for-character meaning. This isn't a hypothetical risk — it's well-known, common word-processor behavior, and starter code is exactly the kind of content where a single silently-substituted character breaks the code. |
| **B. Separate file upload** | **Recommended for multi-file support.** Uploading the actual file (`starter.js`, `starter.py`, etc.) preserves exact bytes with no word-processor involvement, and naturally extends to *multiple* named files without inventing a new mechanism. |
| **C. Dedicated UI code-text field** | **Recommended for MVP's actual current shape.** A plain, syntax-aware text box (no rich-text formatting applied) is simplest for what the current app actually needs — a single short snippet — and avoids introducing a file-upload step for a handful of lines of code. |

**Recommendation: C for MVP, with the data shape already built for B.** The current application only ever needs one starter-code file per Practice/Exercise (confirmed against the real implementation — `defaultFileName()` always produces exactly one filename), so a single code-text field is the simplest thing that actually matches today's reality — matching the user's own preference that code stays out of the document, without over-building a multi-file upload UI nothing currently consumes. **Future multi-file support is not blocked**: the already-frozen `ExerciseSubmission.files` shape is already an array of `{name, content}` pairs (per the domain model), so starter code can be modeled the same way — a list of one named file today, extensible to several later — without restructuring anything when that day comes.

---

## 6. Video

Unchanged from `NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md` §4 — restated briefly, not re-derived. The document may contain a **planning copy** of the YouTube URL/title/description under `VIDEO INFORMATION` (useful so the whole session's intent lives in one artifact) — but the **authoritative, system-used value is entered and confirmed in the UI**, where a `Preview Video` button actually renders the live embed. A document cannot verify a video plays or is embeddable; only the UI can, so that verification always happens there, with the document's copy at most pre-filling the UI field as a convenience, never substituting for it.

Video Checkpoints are never part of the document — they're created entirely in the UI, per §7.

---

## 7. Video Checkpoint Authoring

Unchanged from the prior workflow document's §4/§5 — restated once, concisely, per "preserve frozen decisions":

1. Enter the YouTube URL, `Preview Video`.
2. Play the preview, **pause it exactly where a checkpoint should occur**.
3. Click `Add Checkpoint Here` — captures the paused timestamp via the YouTube IFrame API's `getCurrentTime()` (a real, confirmed capability).
4. Fill in the question/options/correct answer/feedback/required/continue-behavior form.
5. The captured timestamp remains manually editable for fine adjustment.

**Restated once more because it must never be assumed away: YouTube does not provide checkpoint/quiz functionality itself.** Any pause-and-quiz behavior is something NextStep² builds on top of the player (future work, not built now); triggering is polling-based and therefore approximate; reliably preventing skip-ahead requires custom playback controls, a real future implementation cost. The document plays no role in any of this — checkpoints are pure structured UI data, never document text, precisely because none of this interaction can be meaningfully expressed in a Word document.

---

## 8. AI Help

Document-first, per this task's explicit §15 classification (**a change from the prior workflow document, per §0 above**). The official template's `AI HELP` heading holds repeatable `Quick Prompt: <question>` / `Guidance:` pairs, plus one `Default Guidance`. Extraction maps each Quick Prompt subheading's text to the `quickPrompts[]` entry and its following `Guidance:` line to the matching `replies` value, exactly matching the already-frozen `aiHelp` shape — no field is added or removed, only its authoring location moves from a web form into the document.

**No AI generation is introduced here or anywhere in this document.** The Content Team writes every reply themselves, in the document, exactly as they would have typed it into a web field — this is purely a change of *where* they type it.

---

## 9. Document → Structured Content (the central decision)

Three approaches, evaluated against the explicit requirement — predictable, reviewable content, with AI not assumed superior:

| Approach | Evaluation |
|---|---|
| **A. Strict template parsing** (deterministic, based on real DOCX heading/list styles) | **Recommended.** The exact same input document always produces the exact same structured output. Nothing is guessed, summarized, or reworded — text is only ever *relocated* from under a matching heading into the matching field. Failures are precise and reportable ("expected a 'Learning Content' heading, none was found") rather than silent. |
| **B. DOCX/PDF extraction + heuristic heading mapping** | **Rejected for PDF, folded into A for DOCX.** DOCX genuinely stores heading/list structure as real, queryable metadata in its XML — that's what makes A possible. PDF is fundamentally a page-layout format describing where glyphs are drawn; it does not reliably carry semantic "this is a heading" information unless specifically authored as a Tagged PDF (rare, not something to assume). Detecting headings in an arbitrary PDF means guessing from font size/weight — inherently heuristic, not deterministic. This is a real, structural difference between the two formats, not a preference. |
| **C. AI-assisted extraction** | **Rejected for MVP, not because AI is bad, but because it's the wrong tool for this specific job.** An LLM reading loosely-formatted text and mapping it to fields is flexible, but non-deterministic — the same document could plausibly extract slightly differently twice, and worse, a model summarizing or "cleaning up" educational text risks silently altering technical accuracy in a way nobody re-checks line-by-line against the source. The task's own instruction is explicit: extraction must not silently change educational content. Deterministic template parsing structurally cannot do that (it never rewrites, only relocates); AI extraction structurally can, even accidentally. **If AI-assisted extraction is ever introduced later, its output must be a reviewable diff against the source document, never a silent replacement** — flagged as a Future item (§14 of the prior workflow document already establishes this MVP-vs-future discipline; restated here specifically for extraction). |

**MVP recommendation: A, strictly, DOCX only, no AI anywhere in the import path.**

---

## 10. File Types — recommendation

| Format | Decision | Why |
|---|---|---|
| **DOCX** | **Primary, officially required** | Real heading/list structure makes deterministic parsing possible (§9); nearly universal — Word, Google Docs, and LibreOffice all produce compatible files; a natural fit for people whose job is writing structured educational documents |
| PDF | **Not supported as an authoring input** | Digital PDFs generally lack reliable semantic structure (§9); a scanned/image-only PDF has *zero* extractable text at all — not a matter of parser quality, there is nothing to parse (see §17, Q6) |
| Markdown | **Not supported, despite being technically easier to parse** | Markdown's `#`/`##` headings are arguably *more* reliably parseable than DOCX styles — but writing raw Markdown correctly (headings, list syntax, escaping) is a technical skill, and the entire point of this model is that the Content Team should never need a technical skill to author content. A deliberate trade-off: author-friendliness over parser-simplicity. |
| PPTX | **Not supported as an authoring input** | A slide deck is a set of independent visual canvases, not a flowing document with heading levels — there's no reliable way to map "which slide is Learning Content" the way a document's headings map cleanly. If a Content Team member drafts from slides, they still transcribe into the official DOCX template. |
| Images | **Not a document format** (an asset *within* a document, not a document type) | Addressed directly in §17, Q3 |

---

## 11. Content Manager Review

Extends the already-frozen review mechanism (`NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md` §10) with one addition specific to document-first authoring:

```
Content Team
    ↓
Upload document + confirm/enter Video, Checkpoints, Starter Code, Settings (all UI)
    ↓
NextStep² processes the document — deterministic extraction (§9)
    ↓
Draft (extraction results shown per section, exactly like any other draft)
    ↓
Content Manager reviews:
    - every section's extracted structured content
    - the ORIGINAL uploaded document, available to open/download for direct
      comparison against what was extracted (see §17, Q13)
    - [ Preview as Student ] — the real Session Workspace UI, unchanged
      mechanism, reused exactly as already established
    ↓
Request Changes  OR  Approve
    ↓
Publish
```

The reviewer still never inspects raw JSON or a form — they see the same fully-rendered Student experience as before. The one new capability is being able to place the original document side by side with what was extracted, specifically so extraction fidelity itself is checkable, not just content quality.

---

## 12. Changes Requested

Exactly the already-established flow, restated in document terms: the Content Team receives the reviewer's notes, edits the **document** (not scattered form fields — the whole document, since extraction always processes the complete file, never a partial patch), and uploads the corrected version. **The previous approved/published version is never touched by this** — a re-upload always targets the current in-progress Draft's extraction, never the live `Publication` a student might currently be looking at. Students continue seeing whatever was last actually published until the corrected version is itself approved and published.

---

## 13. Versioning

**Unchanged — the already-frozen domain model is not redesigned.** Restated in document-first terms:

```
Session
 ├── ContentVersion 1 → Published        (produced by an earlier document upload)
 └── ContentVersion 2 → Draft            (produced by the current document upload)

Content Manager approves Version 2:
    ContentVersion 2 → Approved          — students still see Version 1

Content Manager publishes Version 2:
    ContentVersion 1 → superseded (same transaction)
    ContentVersion 2 → Published         — students now see Version 2
```

Each successful document upload + extraction produces one complete `ContentVersion` (and one `Exercise` row) — never a partial diff against the previous one, exactly matching the already-frozen "a version is always complete, not a patch" rule.

---

## 14. Content Team UI

**The left-sidebar workspace shell from the prior workflow document is preserved exactly** — same 8 items, same ✓/⚠/○/Skipped status model, same `Save Draft`/`Submit for Review` behavior. What changes is what a Content Team member finds *inside* four of those sections.

```
┌──────────────────────────────────────────────────────┐
│ ← Sessions        Async / Await          [Save Draft] │
├────────────────┬───────────────────────────────────────┤
│ Session Info  ✓│                                       │
│ Learning      ✓│  ← populated by the uploaded document │
│ Video         ✓│  ← direct UI entry (URL + preview)    │
│ Checkpoints   ✓│  ← direct UI entry (pause & capture)  │
│ Practice      ✓│  ← document (text) + UI (code/lang)   │
│ AI Help       ✓│  ← populated by the uploaded document │
│ Exercise      ○│  ← document (text) + UI (code/lang)   │
│ Settings      ✓│  ← direct UI entry, mostly auto-set   │
│                 │                                       │
│ [Submit for     │                                       │
│  Review]        │                                       │
└────────────────┴───────────────────────────────────────┘
```

**One document, uploaded once, populates four sidebar items simultaneously** (Learning, AI Help, and the text portions of Practice and Exercise) the moment it extracts successfully. Opening any one of those sidebar sections shows the *extracted* content for that specific piece — read-only display of what was found under that heading — with a clear "Replace document" action if a correction is needed (which re-uploads and re-extracts the whole file, since a document can't be edited "one section at a time" from inside NextStep²; it's edited in Word and re-uploaded). **Practice and Exercise are hybrid sections**: the document supplies the prose fields, and the same section's content pane also shows the small UI-only fields for Language and Starter Code (§5) — both halves visible together, since a student sees them as one unified Practice/Exercise experience.

---

## 15. Document-First vs. UI-First — the classification, and why

| **Document-first** | **UI-first / structured** |
|---|---|
| Learning Content (explanation, key concepts, examples, tags) | Course / Subject / Session **system identity** (auto-generated ids, ordering) — never the human-facing title/description/objective, which live in the document per §1 |
| Practice: objective, instructions, expected learning, self-check | Practice/Exercise: language, starter code (§5) |
| Exercise: objective, scenario, requirements, expected behaviour, evaluation criteria, edge cases, submission instructions | Video: the **authoritative**, previewed URL/title/description (the document's copy is planning convenience only — §6) |
| AI Help: quick prompts, guidance, default guidance | Video Checkpoints (entirely — §7) |
| | Required Activity configuration (auto-derived from what's actually authored, not manually toggled) |
| | Version/status (system-managed, never authored) |
| | Review actions (Request Changes / Approve / Publish) |

**Why this split:** prose and explanatory writing is what word processors are built for, and the Content Team's actual skill is writing clear educational material — not data entry. Forcing paragraphs into dozens of small web text boxes is exactly the problem this task explicitly rejects. Conversely, anything that is inherently **interactive** (Video preview, Checkpoint capture), inherently **system-managed** (ids, ordering, status), or inherently **fragile as prose** (code, which word processors corrupt) belongs in a purpose-built UI control a document format cannot replicate — a document can't play a video back, can't verify a URL is embeddable, and can't preserve exact code formatting reliably.

---

## 16. Student Experience Mapping

| Student Experience | Content Team Source | NextStep² Representation |
|---|---|---|
| Header — title, description | Document (Session Information) | Session structural fields (confirmed at publish, per the domain model's §3) |
| "About this lesson" — objective, key concepts, examples | Document (Learning Content) | `ContentVersion.objective` / `keyConcepts[]` / `examples[]` |
| Video player | Document (planning copy) + **UI (authoritative, previewed)** | `ContentVersion.video` |
| Video checkpoint quiz | **UI only** (pause-and-capture, §7) | `ContentVersion` checkpoint structure |
| Practice task/instructions | Document (Practice) | `ContentVersion.practice.task` / `.instructions` |
| Practice code editor + language | **UI only** (§5) | `ContentVersion.practice.language` / `.starterCode` |
| Practice Self-Check list | Document (Practice → Self-Check bullets) | `ContentVersion.practice.checklist[]` |
| AI Help quick prompts + replies | Document (AI Help) | `ContentVersion.aiHelp` |
| Exercise objective/scenario/requirements/evaluation criteria/edge cases | Document (Exercise) | `Exercise` entity fields |
| Exercise code editor + language | **UI only** (§5) | `Exercise.language` / `.starterCode` |
| List of previous exercise submissions | Neither — generated automatically at runtime | `ExerciseSubmission` (student-owned, never authored) |
| Completion screen / performance percentage | Neither — computed from real student activity | `SessionCompletion` / `SessionPerformance` (never authored) |

---

## 17. Challenge the Model

**1. What if the Content Team ignores the template?** Extraction looks for exact heading names/styles and finds none — the import reports every expected mandatory heading it couldn't find, by name, and the document is not imported. Nothing is guessed from unstructured text.

**2. What if headings are missing?** A missing **mandatory** heading (Session Information, Learning Content, Practice, Exercise) leaves that sidebar section at ○ Not Started, blocking `Submit for Review` — matching the already-established mandatory-section gate. A missing **optional** heading (Common Mistakes, Video Information, individual AI Help prompts) simply means that content is absent — no error, matching the already-established "optional may be skipped" pattern.

**3. What if the document contains images?** They are not extracted into anything — there is no image-rendering slot in the Student Session UI today (confirmed, not assumed, against the real implementation). Rather than silently dropping them, the import step explicitly surfaces a plain warning: *"This document contains N image(s) that will not be shown to students."* The original document (images included) is still retained for the Content Manager's review comparison (§11) — nothing is lost, it's just honestly labeled as non-student-facing.

**4. What if it contains code?** The official template includes a specific, named Word style ("NextStep² Code Block") for the Content Team to apply to any code snippet. Text under that style is extracted as-is, preserved literally. Code typed with ordinary formatting (no special style applied) is **not** heuristically detected as code — it's extracted as plain prose text and flagged for the Content Team/Content Manager to confirm, rather than guessed at.

**5. What if the document is badly formatted?** Extra blank paragraphs, inconsistent indentation, and similar cosmetic issues don't affect parsing, since extraction reads heading *styles*, not visual layout. Formatting that corrupts the actual heading styles (e.g., pasting from a source that strips styles down to "Normal" text) manifests as case 1/2 above — a missing heading, reported precisely, not guessed.

**6. What if a PDF is scanned/image-only?** It contains zero extractable text — not a parsing-quality problem, a fundamental absence of anything to parse. This is rejected outright at upload with a clear message directing the Content Team to the DOCX template. It's also the strongest concrete argument for excluding PDF from supported authoring formats at all (§10).

**7. What if content extraction fails?** The Content Team sees a precise, section-by-section result — exactly which headings were found and which weren't — never a partial or best-guess import. Nothing is fabricated to fill a gap; a failed section simply stays incomplete until a corrected document is uploaded.

**8. What if the Content Team uploads the wrong document?** Before finalizing the import, the system shows what it detected under Session Information (Course/Subject/Session identity) and compares it against the session currently being edited. A mismatch (e.g., uploading "Promises" content while working inside "Async/Await") is surfaced as an explicit warning requiring confirmation before anything is applied — never a silent overwrite.

**9. What if a corrected version is uploaded?** It replaces the current in-progress Draft's extraction only. Whatever is currently `Published` (if anything) is completely untouched until the corrected version itself goes through Review → Approve → Publish (§12/§13).

**10. How do we show extraction/import errors?** Plain language, per section, naming the specific expected heading — never a raw parser error or stack trace, consistent with the "no jargon" principle already established for the whole authoring experience.

**11. Can the Content Manager manually fix imported structured content?** **No, not for document-sourced content.** Allowing the reviewer to silently hand-edit extracted text would create exactly the drift this whole model exists to prevent — the document would no longer be the true source of what's live. The correct action is `Request Changes`, sending it back to the Content Team to fix the actual document. **Exception:** UI-only fields that were never part of the document in the first place (Video URL corrections, checkpoint timestamp nudges, Session Settings) may be corrected directly by the Content Manager, since there's no document to diverge from for those.

**12. Should the Content Manager be able to edit content or only request changes?** Directly follows from #11 — only `Request Changes` for anything document-sourced; direct edits are limited to the UI-only fields that were never document content to begin with.

**13. How do we prevent silent content changes during extraction?** Two things together: extraction is 100% deterministic (§9) — it only relocates text under a matching heading, never rewrites or summarizes it, so there is no rewording step that could drift from the source in the first place; and the reviewer can open the original uploaded document directly alongside the extracted result (§11) to visually confirm the two actually match, rather than trusting the pipeline blindly.

**14. How do we ensure students never see incomplete content?** This isn't new to this document — it's the already-implemented, already-tested rule that Draft/Changes Requested/Approved are never visible to students, only Published is (§12 of the prior workflow document; verified, not assumed, against the running application). It's reinforced structurally here too: an incomplete session can't even reach `Submit for Review` in the first place (the mandatory-section gate), so it can never enter the review/approve/publish pipeline while incomplete.

---

## 18. Final Recommendation

```
Content Team
    ↓
Downloads the official NextStep² Session Template (.docx)
    ↓
Writes Learning Content, Practice (text), Exercise (text), and AI Help
directly in the document, using its pre-built headings
    ↓
Separately, in the NextStep² authoring workspace (never in the document):
    - enters/confirms the Video URL and previews it live
    - adds Video Checkpoints by pausing the preview and capturing the timestamp
    - enters Practice/Exercise Language and Starter Code
    - confirms Session Settings (mostly auto-derived)
    ↓
Uploads the completed document into the session
    ↓
NextStep² Content Import — strict, deterministic template parsing
(no AI, no guessing; every heading either matches exactly or is
reported as missing, by name)
    ↓
Structured Session Content — one ContentVersion (+ one Exercise),
exactly matching the already-frozen domain model, no schema change
    ↓
Content Team marks the session ready  →  Submit for Review
    ↓
Content Manager Review
    - sees every extracted section
    - can open the original document for direct comparison
    - [ Preview as Student ] — the real Session Workspace UI
    ↓
Request Changes ──► back to Content Team (document is corrected and
                     re-uploaded; nothing published is touched)
    ↓
Approve
    ↓
Publish (atomically supersedes whatever was previously live for this
         session — the already-frozen Publication model, unchanged)
    ↓
Student — sees ONLY Published content, never Draft, Changes Requested,
          or Approved
```

This is the task's own suggested shape, kept intact — refined only by making explicit exactly which steps happen in the document versus the UI before upload, stating plainly that import is deterministic and AI-free, and adding the original-document-for-comparison capability at review. Nothing about the fundamental flow was changed.

---

## 19. No Implementation

Per instructions, nothing beyond this document was produced: no React code, no backend, no database, no APIs, no packages installed, no parser built, no DOCX extraction implemented. This is a product and authoring-model specification only.

**Consistency confirmed against every existing frozen document** — see §0 for the two explicit, stated exceptions (data-entry mechanism for four sections; Edge Cases kept separate). No other decision in `NEXTSTEP2_CONTENT_AUTHORING_TEMPLATE.md`, `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md`, or the rest of `NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md` was altered. Stopping here.
