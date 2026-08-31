# NextStep² Content Authoring Template

**Status:** Design document only. No application code, backend, database, API, ZIP format, or JSON schema was created or modified to produce this document.

**Relationship to existing documents:**
- `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md` already established the Course → Subject → Session hierarchy, the Session Content Contract, the Content Package folder structure, and the Draft → Review → Approve → Publish lifecycle. **This document does not replace that one — it goes one level deeper**, specifically on the areas this task calls out: multi-checkpoint video, richer Practice/Exercise fields (including future-AI-evaluation readiness), separate per-section authoring/asset handling instead of one ZIP mentality, an explicit reviewer-facing checklist, and a fully worked student-experience mapping table.
- `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` already froze the entities this content eventually lands in (`ContentVersion`, `Publication`, `ContentReview`, etc.). Where this document discusses versioning/status, it deliberately reuses that vocabulary rather than inventing a competing one.
- Every claim below is labeled the same way as the prior authoring document, for consistency:
  - **CURRENT** — true today, verified directly in the running application's code.
  - **PROPOSED** — a new authoring capability this document defines (e.g., multiple video checkpoints), not implemented anywhere yet.

Nothing in this document has been built. It is the contract a future Content Team, Content Manager UI, importer, and student-facing renderer will be built against.

---

## 1. Inspecting the Real Student Session Experience

The task's assumed 9-part list (introduction, objective, learning material, video, video interaction, practice, AI Help, exercise, completion) is a reasonable starting sketch, but the actual application (`SessionWorkspace.tsx`, shared verbatim between the real Student session and the Content Manager's Draft Preview) is more precise than that. Here is what a student actually sees and does today, in order:

1. **Header** — subject name, "Session N of M," session title, session description, a progress bar. (The description here comes from the Session record itself, not from authored lesson content.)
2. **Learn panel — Video** — today a fully mocked play button + timer, with exactly **one** scripted "Quick Check" multiple-choice question appearing partway through. There is no real video file or URL behind it at all yet.
3. **Learn panel — "About this lesson"** — the learning objective as a paragraph, a bulleted "Key Concepts" list (only shown if non-empty), and a bulleted "Examples" list (only shown if non-empty).
4. **Do panel — Practice tab** — a task/instructions block, an embedded OneCompiler code editor (starter code is shown as a copy-paste reference block today, not auto-loaded), a "Self-Check" button that reveals a static reference checklist (explicitly labeled to the student as self-review, never automatic grading), and an "AI Hint" button.
5. **Do panel — AI Help tab** — a row of clickable quick-prompt chips (each tied to one canned reply by exact text match), a breadcrumb of short concept tags for context, a chat-style transcript, and a free-text input that always falls back to one default reply for anything not an exact quick-prompt match.
6. **Do panel — Exercise tab** — objective, a bulleted requirements list, an embedded OneCompiler editor **with starter code auto-populated** (unlike Practice), a Submit flow (confirm → attempt number → success message — never a grade), and a list of every previous submission attempt for that session.
7. **Footer** — which required activities are done vs. still outstanding, and a "Complete Session →" button, disabled until every required activity is done.
8. **Completion screen** — a computed performance percentage (from real Video Check correctness + Practice checklist pass rate — Learning and Exercise never contribute to score), and one hardcoded, non-personalized "what you did well / what to improve" sentence pair (not authored content).

**What this confirms about the task's assumed list:** "Session introduction" isn't its own screen/section — it's just the header + objective, already covered by Basic Information + Learning. "Video-based interaction/check" today is exactly **one** checkpoint, not several — this document's Video section (§4 below) is where that gets deliberately extended, as a **PROPOSED** capability, per this task's explicit instruction to support multiple in-video checkpoints. Everything else in the assumed list maps cleanly to a real, currently-rendered part of the UI.

---

## 2. Section A — Session Information

| Field | What it is | Requirement |
|---|---|---|
| Course | Which course this session belongs to (name + stable id) | Required |
| Subject | Which subject this session belongs to (name + stable id) | Required |
| Session title | Student-facing title | Required |
| Session description | Short, student-facing summary (shown in the header and in navigation lists elsewhere in the app) | Required |
| Learning objective | One clear "by the end of this session, you'll be able to..." statement | Required |
| Estimated learning time | e.g. "25 minutes" | Recommended — **PROPOSED**, no current UI shows this yet (carried over from the prior authoring document; still not consumed anywhere in the app) |
| Prerequisites | Plain-language note on what a student should already know/have completed | Optional — no current UI slot exists for this; capture it anyway so review/planning has it, understanding it isn't shown to students today |

**Session identity discipline (unchanged from the prior document, restated because it matters most here):** the Session's id is permanent. It is never renamed, never reused, and never derived from its position in a list. Renaming the *title* is fine and expected over time (that's exactly what a new version is for — see §11); changing the *id* is not, because it's the key everything else (progress, performance, submissions, and — per the frozen domain model — every `ContentVersion`/`Publication`) is permanently tied to.

---

## 3. Section B — Learning Content

Matches exactly what the Learn panel's "About this lesson" card renders, plus one field (`concepts`) that's actually consumed elsewhere (the AI Help breadcrumb, not the Learn panel):

| Field | Purpose | Requirement |
|---|---|---|
| Explanation | The actual teaching text for this topic. **No fixed subsection template is mandated** — a topic like "Async / Await" benefits from a "what it means / why it's used / common mistakes" breakdown, but that's a sample shape for *that* topic, not a form every session must fill in identically. Write however best teaches this specific topic. | Required |
| Key Concepts | Short bullet statements — the crisp, memorable takeaways | Optional (UI only renders the section if non-empty; strongly recommended) |
| Examples | Short code snippets or illustrative examples | Optional (same rendering rule; strongly recommended for any technical topic) |
| Concept tags | Short keywords (e.g. `async-await`, `error-handling`) — shown only as breadcrumb context inside AI Help, not in the Learn panel itself | Optional |
| Diagrams / images | A visual aid for the concept | **Not currently renderable anywhere in the Student UI.** See §8 — this can be captured as supplementary source material the Content Team works from, but there is no image-rendering slot in the live Learn panel today. Do not treat "provided a diagram" as equivalent to "the student will see a diagram." |
| Important points / common mistakes | Callouts worth emphasizing | Optional — fold into the free-form Explanation text; there's no separate UI region for these today, so they render only if woven into the explanation itself |

**Code examples specifically:** since NextStep² already has a real code-editor embed (OneCompiler, used for Practice/Exercise), any code shown as an "Example" here is a **static, read-only snippet** — it is not runnable in place. If a concept genuinely needs a runnable example, that's what Practice is for.

---

## 4. Section C — Video and Interactive Checkpoints

### 4.1 What YouTube's embed actually supports (researched, not assumed)

This matters because the task explicitly forbids inventing capabilities. Here is what's true, distinguishing YouTube's real IFrame Player API from what would need to be built on top of it:

**YouTube genuinely supports (via the IFrame Player API, `enablejsapi=1`):**
- Programmatic control — `playVideo()`, `pauseVideo()`, `seekTo()`, `getCurrentTime()`.
- Player state events — playing / paused / ended / buffering.
- Hiding YouTube's native controls (`controls=0`) so a site can render its own play/pause/seek UI instead of YouTube's default scrubber.

**YouTube does NOT support, and NextStep² must not assume it does:**
- **No native "fire an event at timestamp X" hook.** There is no built-in checkpoint/callback mechanism. Detecting "the video has reached 4:00" requires **polling** `getCurrentTime()` on an interval (e.g. every few hundred milliseconds) and comparing it against the authored checkpoint timestamps — so checkpoint triggering is **approximate, not frame-exact**, bounded by the polling interval used.
- **No native interactive quiz/checkpoint overlay.** YouTube's own "Cards"/end-screens are YouTube's UI, not something a third-party embedding site can drive, customize, or capture answers from. **Any checkpoint quiz UI is something NextStep² has to build itself** on top of the player, exactly the way the current prototype's mocked Quick Check already does (a custom overlay, not a real video pause) — this document does not propose otherwise, only that the *authoring data* now needs to support more than one such checkpoint.
- **No reliable way to block seeking past a checkpoint using YouTube's native scrubber alone.** A student can drag YouTube's own seek bar past an unanswered checkpoint before a poll catches it. Meaningfully enforcing "must answer before continuing" requires hiding the native scrubber (`controls=0`) and only exposing NextStep²'s own play/pause controls — a real, buildable pattern, but a genuine implementation cost, not a free YouTube feature. This document flags it as a constraint for whoever builds the player later; it does not solve it now.
- **"Private" YouTube videos generally will not play in a public embed.** YouTube's actual three visibility tiers are Public, **Unlisted**, and Private — a strict Private video requires the viewer to be signed into a specifically-granted Google account, which doesn't work for an arbitrary student embed. **Correction to the prior authoring document's phrasing:** the workable tier for this MVP is **Unlisted** (reachable by anyone with the link, not searchable, embeddable by default), not "private/unlisted" as though they were interchangeable. The Content Team should set videos to Unlisted, not Private.
- **Embedding can be disabled per-video by the uploader**, independent of visibility — the Content Manager's review must include "does this actually play in an embed," not just "does the link open on youtube.com."

**Conclusion for this document:** the authoring template below captures everything a *future* checkpoint player would need — timestamps, questions, answers, feedback, required/optional, continue behavior — without this document claiming any of that playback/enforcement mechanism already exists or is trivial. Building it is future work, explicitly not part of this task.

### 4.2 Video (the file/source itself)

| Field | Purpose | Requirement |
|---|---|---|
| YouTube URL | The video source — Unlisted visibility (§4.1), embedding enabled | Required once a session has a video at all |
| Video title | Shown above the player | Required if a video is provided |
| Optional description | A short caption/summary, not the transcript | Optional |
| Duration | Total length, for planning/review purposes | Optional |

Whether *every* session must have a video remains a product decision this document doesn't force (see §13 — Required vs. Optional) — the prior authoring document already flags this as an open question, and nothing here resolves it further; a session with no video simply has no Video section and no checkpoints.

### 4.3 Video Checkpoints (PROPOSED — plural, extends the current single Quick Check)

One session's video may have **zero, one, or several** checkpoints. Each checkpoint is authored independently:

| Field | Purpose | Requirement |
|---|---|---|
| Checkpoint timestamp | Where in the video this checkpoint occurs (approximate — see §4.1) | Required per checkpoint |
| Question | The question text | Required per checkpoint |
| Question type | Multiple choice (matches everything the current app already supports); true/false is just a 2-option multiple choice, not a separate type that needs new authoring shape | Required per checkpoint — default to multiple choice |
| Options | 2 or more answer choices | Required per checkpoint |
| Correct answer | Which option is correct | Required per checkpoint |
| Explanation / feedback | Shown after the student answers, whether right or wrong — reinforces *why* | Recommended |
| Required | Whether this checkpoint counts toward session completion (mirrors today's single `videoCheckpoint` always being part of `requiredActivities`) | Required to specify — default: yes |
| Can continue after answering | Whether the student may proceed immediately after answering (right or wrong), or only after answering *correctly* | Required to specify — default: proceed after answering, regardless of correctness (matches today's single Quick Check exactly, which shows correct/incorrect feedback but never blocks continuing) |

If a session has more than one checkpoint, they are authored **in timestamp order** — the Content Team is responsible for sequencing them meaningfully (see the Content Quality Checklist, §14), not the system.

---

## 5. Practice

| Field | Purpose | Requirement |
|---|---|---|
| Practice objective/task | What the student is trying to do | Required |
| Instructions | Step-by-step or explanatory guidance for the task | Required |
| Language | Drives which code editor loads — see the supported list below | Required |
| Starter code | Shown to the student as a **copy-paste reference block today** (not auto-loaded into the editor — that's an Exercise-only behavior in the current implementation) | Optional |
| Expected files | Not applicable today — Practice is single-file/single-editor; do not author a multi-file Practice expecting separate files to appear | N/A |
| Self-Check / reference checklist | A checklist the student compares their **own** work against | Optional, but strongly recommended — must be written as self-review guidance ("Does your code do X?"), never phrased as if the system is grading it automatically |
| Expected concepts | Which Key Concepts (§3) this Practice is meant to reinforce — for the Content Manager's own review use, not rendered to students | Recommended |
| Hints | Optional supplementary guidance shown via the "AI Hint" button (today, this reuses the AI Help reply data — see §6, not a separate hint field) | Optional |

**Supported languages** (drives which OneCompiler embed loads; an unrecognized value silently falls back to JavaScript, so this list should be treated as the authoritative set): `javascript`, `typescript`, `python`, `java`, `csharp`, `cpp`, `c`, `sql`, `html` (also covers HTML/CSS/JS-together practices).

**The Content Team must NOT provide:** evaluation/grading code, backend code, OneCompiler API credentials, or any technical implementation detail. Practice's Self-Check is a static list of labels — never a `passed: true/false` value (that's student runtime state, generated by the app, never authored).

---

## 6. AI Help

**Structure: Prompt → Guidance pairs, matching the current implementation — not a more sophisticated model.** This confirms, rather than revises, the prior authoring document's decision on this point. Today's AI Help is a small, content-authored FAQ, not a live AI system; the authoring template matches that reality:

| Field | Purpose | Requirement |
|---|---|---|
| Contextual explanation / concept tags | Short keywords shown as breadcrumb context in the AI Help panel | Optional |
| Suggested questions / quick prompts | Buttons the student can click instead of typing | Optional |
| Expected guidance / reply per prompt | The canned reply shown for that exact quick prompt | Required for every quick prompt provided — a prompt with no matching reply is incomplete content |
| Default reply | Shown for anything the student types that isn't an exact quick-prompt match | Required |
| Boundaries — what AI should/should not explain | Not a separate structured field; this is guidance for how the Content Team *writes* the replies above, not a new database field. A reply should answer the question asked without solving the Practice/Exercise outright. | Guidance, not a field |
| Hints vs. direct answers | Same — this is a *writing* distinction the Content Team applies when authoring reply text (see §14's checklist item "AI hints do not give away answers"), not a structural field |

No AI is implemented by this document. "AI Help" today means "content-authored canned replies," full stop — the same honest framing as the prior authoring document (§10 there), not revised here.

---

## 7. Exercise

The Exercise section needs to capture more than what the current UI renders, **specifically so a future AI-assisted evaluator has enough to work with** — without this document building, or designing the internals of, that evaluator.

| Field | Purpose | Requirement |
|---|---|---|
| Exercise title | Short label | Recommended (not currently a distinct rendered field — the objective doubles as the title today; capture separately for clarity going forward) |
| Objective | What the student must independently achieve | Required |
| Scenario / problem statement | The situation framing the task, in plain language (may be the same text as the objective for simple exercises, or a longer setup for realistic ones) | Recommended |
| Requirements | A bulleted list of what a correct solution must do | Required |
| Expected outcome | What "done and correct" looks like — described in plain language, not code | Recommended, **and especially important** for future AI-assisted evaluation — see below |
| Allowed technology / language | Same list as Practice (§5) | Required |
| Starter code | **Optional by design** — auto-loaded into the student's editor when present (unlike Practice); an exercise may legitimately start from a blank editor | Optional |
| Submission instructions | Anything the student needs to know before submitting (today: nothing beyond "click Submit" — the app handles the mechanics) | Optional |
| Evaluation criteria | A list of specific, checkable statements a correct submission satisfies (e.g. "returns `null` on failure," "wraps the awaited call in try/catch") — phrased objectively enough that a person (today) or an automated evaluator (future) could check each one independently | Required — this is the single most important addition this document makes to the Exercise template, precisely because requirements alone are often too broad to check mechanically |
| Edge cases | Situations a correct solution should handle beyond the "happy path" (e.g. empty input, a failed network call, a boundary value) | Recommended |
| Expected behavior / example input-output | Concrete example(s) of input → correct output, where applicable | Recommended for any exercise with a clear input/output shape |

**Why this matters for future AI-assisted evaluation, stated plainly:** an evaluator (human or AI) can only judge a submission against what's actually written down. "Requirements" alone (today's only real field) tends toward vague, non-checkable statements. **Evaluation criteria** + **edge cases** + **expected behavior** together give a future evaluator (or a human reviewer, in the meantime) a concrete rubric instead of a vibe. **No AI evaluation is being designed or implemented here** — this section only makes sure the raw material for one exists later.

---

## 8. Content Assets and Authoring Sections

**The Content Team does not deliver one ZIP.** They work through separate, named sections — matching this exact structure:

```
Session
│
├── Basic Information
├── Learning Content
├── Video
├── Video Checkpoints
├── Practice
├── AI Help
└── Exercise
```

(How these sections eventually get packaged/transported to NextStep² — whether that's still a folder-per-session ZIP under the hood, per the prior authoring document's §13 format, or a different mechanism entirely — is an implementation decision, not something this document settles. The point of *this* document is that the Content Team's authoring **experience** is section-by-section, not "assemble one archive.")

| Section | What's provided | Accepted format | Requirement | Validation | Preview | Status |
|---|---|---|---|---|---|---|
| Basic Information | Course/Subject/Session identity, title, description, objective, duration, prerequisites | Structured text fields | Required | ids present & stable; title/description/objective non-empty | Rendered exactly as the session header | Complete / Incomplete |
| Learning Content | Explanation, key concepts, examples, concept tags | Structured text/markdown; diagrams/images as **supplementary source material only** — see §3, no current render slot | Required (explanation); rest optional | Non-empty explanation | Rendered as the "About this lesson" card | Complete / Incomplete |
| Video | YouTube URL, title, description, duration | YouTube URL (Unlisted) | Optional overall, but Required once provided that title accompanies it | URL matches a recognized YouTube pattern; link actually opens and is embeddable (§4.1) | The real video embed | Complete / Incomplete / Broken Link |
| Video Checkpoints | One or more checkpoint objects (§4.3) | Structured text fields | Required only if Video is provided **and** checkpoints are intended; a video with zero checkpoints is valid | Each checkpoint has a question, ≥2 options, exactly one correct answer, and a timestamp within the video's duration | Rendered as the (future) checkpoint overlay at the authored timestamp | Complete / Incomplete |
| Practice | Task, instructions, language, starter code, self-check (§5) | Structured text + code file/snippet | Required | Language is a recognized value; task non-empty | The real Practice tab, including the live OneCompiler embed | Complete / Incomplete |
| AI Help | Quick prompts, replies, default reply, concept tags (§6) | Structured text | Required (default reply, at minimum) | Every quick prompt has a matching reply | The real AI Help tab | Complete / Incomplete |
| Exercise | Objective, requirements, evaluation criteria, language, starter code, edge cases, expected behavior (§7) | Structured text + code file/snippet | Required | Language recognized; objective and requirements non-empty | The real Exercise tab, including the live OneCompiler embed | Complete / Incomplete |

**On document formats (PDF/DOCX/PPTX/images) specifically:** the current Student UI has **no viewer** for any of these — no PDF panel, no slide viewer, no image gallery anywhere in the Session Workspace. If the Content Team's own working process uses PDFs/DOCX/PPTX/slide decks/diagrams to *draft* Learning Content, that's a perfectly normal authoring workflow — but the deliverable that actually reaches NextStep² for Learning Content is the structured text described in §3, converted from whatever source material was used. Treating a PDF/PPTX upload as a first-class, student-facing asset type would be inventing rendering capability the app doesn't have — this document deliberately does not do that. If NextStep² later wants to support downloadable supplementary resources (e.g., a PDF cheat-sheet a student can download), that is a new, separate decision — flagged here, not designed.

---

## 9. Content Review Flow

```
Content Team prepares/submits, section by section (§8)
        ↓
Content Manager Review — opens the submission
        ↓
Preview as Student — the REAL Session Workspace UI, loaded with the candidate
                      content, exactly as a student would see it (not a raw
                      data/form view — this was already a stated requirement
                      in the prior authoring document, §12, and is restated
                      here as the anchor for the checklist below)
        ↓
Check every section — Basic Info, Learning, Video, Checkpoints, Practice,
                       AI Help, Exercise, in that order (see §15 for the full
                       reviewer checklist)
        ↓
   ┌─────────┴─────────┐
   ↓                   ↓
REQUEST CHANGES      APPROVE
   ↓                   ↓
Content Team        PUBLISH
revises the
flagged section(s)
   ↓
back to Review
```

**What the Content Manager needs to verify, restated against the actual sections (not generic bullet points):**
- **Basic Information** — ids are stable and don't collide with unrelated existing content; title/description/objective read clearly to a student, not to another Content Team member.
- **Learning Content** — the explanation actually teaches the stated objective; key concepts and examples are accurate and match the explanation, not just topically adjacent.
- **Video** — the link opens, is embeddable, is Unlisted (not restricted-Private), is the correct video for this session, and is of acceptable audio/video quality.
- **Video Checkpoints** — each checkpoint's timestamp genuinely lands at a meaningful pause point (not mid-sentence, not immediately at the start/end), the question is answerable from what was just shown, exactly one option is correct, and the explanation/feedback text is accurate.
- **Practice** — instructions are unambiguous; the language matches the actual starter code's language; starter code (if any) is valid and runs; Self-Check items are phrased as self-review, never as automatic grading.
- **AI Help** — every quick prompt has a matching, sensible reply; the default reply is generically helpful, not empty or a placeholder.
- **Exercise** — objective/requirements are clear; evaluation criteria are specific enough to actually check a submission against; starter code (if any) is valid and runs, or is intentionally blank; edge cases are realistic, not contrived.
- **Cross-section consistency** — Practice and Exercise genuinely reinforce the same Learning Content; the AI Help concept tags match what's actually taught; nothing contradicts anything else in the same session.

---

## 10. Content Status

**Decision: status lives at the Package level (the review workflow) and, separately, at the Session level (which content is currently live) — not at the level of individual content sections.**

- **Package status** (Draft / Changes Requested / Approved / Published) is the single authoritative workflow state, exactly as the prior authoring document's lifecycle (§19 there) already defines, and exactly matching the frozen backend domain model's `ContentPackage.status`.
- **Session "live" status** is a separate, derived fact — per the frozen domain model, this is `Publication.supersededAt IS NULL` for that session, not a field the Content Team sets directly.
- **Section-level status is deliberately rejected.** A session is one coherent student experience — a student can't receive "Video: approved, Exercise: still draft" as a valid state, because they'd be looking at half a lesson. Splitting status per-section would let a session's content drift into a state where sections were reviewed at different times against different surrounding content, which directly undermines §9's whole point (review the complete student experience together, not section-by-section in isolation). The *checklist* in §15 is naturally organized by section — that's a review aid, not a persisted status per section.
- **What per-section "status" a Content Manager actually sees during review is validation feedback** (§8's rightmost column — Complete/Incomplete/Broken Link), which is a real-time check of "is this section well-formed," not an approval workflow state. It resets to whatever's true of the current draft; it isn't carried forward as history.

This directly follows the task's own instruction to avoid unnecessary complexity — Package-level + Session-level status covers every real need identified in §7's own framing (Package, Course, Subject, Session, section) without introducing four extra state machines nothing in the actual workflow needs.

---

## 11. Versioning

This document does not re-derive the versioning model — it already exists, frozen, in `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` (§5, §7, §9 there). Restated in authoring terms, using the task's own example:

```
Session: Async / Await

Version 1 (ContentVersion #1) → Publication{supersededAt: null}   ← live, students see this

  ... Content Team revises the video and the exercise ...

Version 2 (ContentVersion #2) authored as a NEW submission against the SAME session id
  Draft → Under Review → (Changes Requested loop, if needed) → Approved
        ↓
      PUBLISH
        ↓
  Publication(Version 2){supersededAt: null}        ← now live
  Publication(Version 1){supersededAt: <publish time of V2>}   ← superseded, same transaction
```

**What this means for the Content Team, concretely:** revising a session's video and exercise does **not** mean editing Version 1 in place. It means authoring a complete new submission against the *same* Session id (so identity is preserved — see §2), which goes through the *entire* review flow again (§9) as if it were new content, because — from a student's perspective — it is new content. **Students continue seeing Version 1 for the entire duration of Version 2's Draft/Review/Approved states**, and only switch to Version 2 at the exact moment it's published — this is a hard rule already established (and already, per the audit, a known gap in the current *prototype's* implementation, which this document does not need to re-litigate; it's the backend domain model's job to close that gap, not the authoring template's).

**A version is always complete, not a diff.** The Content Team does not author "just the changed parts" — Version 2 includes every section (§8) in full, even the ones that didn't change, because a `ContentVersion` (per the domain model) is a complete, immutable snapshot, not a patch.

---

## 12. Student Experience Mapping

| Student sees / does | Content Team provides | Reviewer checks |
|---|---|---|
| Session title, "Session N of M," description in the header | Session title, description (§2) | Clear, student-facing wording; matches the actual content below it |
| "About this lesson" objective paragraph | Learning objective (§2/§3) | Objective is specific and achievable, not vague |
| Key Concepts bullets | Key concept statements (§3) | Accurate, matches the explanation, not just a keyword dump |
| Examples snippets | Example code/snippets (§3) | Correct, runs (if code), actually illustrates the concept |
| The video itself | YouTube URL + title (§4.2) | Link opens, is Unlisted + embeddable, correct video, acceptable quality |
| One or more in-video checkpoint quizzes | Timestamp, question, options, correct answer, explanation, required/continue rules per checkpoint (§4.3) | Timestamp lands at a meaningful pause; question is answerable from what preceded it; exactly one correct option; explanation is accurate |
| Practice task + code editor | Practice objective, instructions, language, starter code, self-check (§5) | Instructions unambiguous; language matches starter code; starter code (if any) is valid; self-check phrased as self-review |
| "AI Hint" button reply | Same content as the matching AI Help reply (§6) | Hint guides without solving the task outright |
| AI Help quick-prompt chips + replies + default reply | Quick prompts, one reply each, default reply, concept tags (§6) | Every quick prompt has a matching reply; default reply is genuinely helpful, not a placeholder |
| Exercise objective + requirements checklist + code editor (starter code pre-loaded if provided) | Exercise objective, requirements, evaluation criteria, language, starter code, edge cases, expected behavior (§7) | Requirements are specific and checkable; evaluation criteria could actually be used to judge a submission; starter code (if any) runs or is intentionally blank |
| List of previous exercise submission attempts | Nothing — generated automatically from real student activity | N/A — not authored content |
| Footer: which required activities are done | Which activities are required for this session (Learning / Video Check / Practice / Exercise) | The set is deliberate for this session, not just left at the default without thought |
| Completion screen performance percentage | Nothing — computed from real Video Check correctness + Practice checklist results at runtime | N/A — not authored content |
| Completion screen "what you did well / what to improve" | Nothing today — currently hardcoded generic text, not authored per session (unchanged from the prior document's finding) | N/A — flagged as a future opportunity only, not solved by this document |
| Estimated time shown anywhere | Not currently shown anywhere — captured opportunistically (§2) | N/A today |

---

## 13. Required vs. Recommended vs. Optional

| Item | Classification | Why |
|---|---|---|
| Course / Subject / Session identity, title, description, objective | **Required** | Always rendered; ids are permanent keys |
| Key Concepts, Examples | **Recommended** | UI renders only if present, but a technical topic without either is thin |
| Concept tags | **Optional** | Cosmetic breadcrumb context only |
| Estimated duration, prerequisites | **Optional** | No current UI consumer; capture opportunistically |
| Video | **Recommended, not mandatory** | A session can legitimately be text/practice-driven with no video — unchanged from the prior document's stance; this document does not force every session to have one |
| Video Checkpoints | **Required if a video is provided and any checkpoint is intended; otherwise not applicable** | A provided video with zero checkpoints is valid — not every video needs an in-video quiz |
| **Practice** | **Mandatory for every session** | The core learning model is Learn → Practice → Apply (Exercise) → Performance/Portfolio — a session with no hands-on practice isn't reinforcing anything, and every curated/example session in the current app includes it |
| **Exercise** | **Mandatory for every session** | Same reasoning — independent application is the point of the whole model; skipping it would mean a session never actually tests whether the student can do the thing unaided |
| AI Help default reply | **Required** | Always needed as the fallback for anything the student types |
| AI Help quick prompts / replies | **Optional** | Falls back cleanly to the default reply if empty |
| Required Activities selection | **Recommended, defaults to all** | Matches the only curated real example in the app today; a session may deliberately narrow this (as the existing live-session feature already does by dropping Video Check) |
| Project Connection | **Optional** | Renders only if present |

---

## 14. Content Quality Checklist (Content Team — before submitting)

```
SESSION: ______________   SUBJECT: ______________   COURSE: ______________

BASIC INFORMATION
□ Session id is final and will not change after this submission
□ Title, description, and objective are clear and student-facing

LEARNING CONTENT
□ Learning objective is clear and specific
□ Content actually matches and achieves the stated objective
□ Examples are correct and runnable (if code)
□ Key Concepts are accurate, not just a keyword list

VIDEO
□ Video matches the session topic
□ Video is Unlisted (not restricted-Private) and embedding is enabled
□ Video quality (audio/picture) is acceptable

VIDEO CHECKPOINTS
□ Each checkpoint occurs at a meaningful pause point, not mid-thought
□ Each checkpoint's question is answerable from what was just covered
□ Exactly one correct option per checkpoint; distractors are plausible, not silly
□ Checkpoints are in a sensible order across the video's timeline

PRACTICE
□ Practice reinforces the concept just taught, not a different one
□ Instructions are unambiguous
□ Starter code (if any) is valid and matches the declared language
□ Self-Check items are phrased as self-review, never as automatic grading

AI HELP
□ Every quick prompt has a matching, genuinely useful reply
□ Default reply is helpful, not a placeholder
□ Hints guide toward the answer without giving it away outright

EXERCISE
□ Exercise tests independent understanding, not a repeat of Practice
□ Requirements are specific enough to check objectively
□ Evaluation criteria are written as checkable statements, not vague goals
□ Edge cases are realistic, not contrived
□ Starter code (if any) is valid and runs, or is intentionally left blank

GENERAL
□ No broken links anywhere in this session
□ No missing required sections (Practice and Exercise are mandatory — §13)
□ Course/Subject/Session identifiers don't collide with unrelated existing content
```

---

## 15. Content Manager Review Checklist (Reviewer — separate from the Content Team's own checklist)

```
SESSION: ______________   SUBJECT: ______________   COURSE: ______________
Reviewed as: Student Preview (real Session Workspace UI, not a raw data view)

CONTENT QUALITY
□ Learning objective is achievable from the content actually provided
□ Explanation, Key Concepts, and Examples are internally consistent with each other

TECHNICAL CORRECTNESS
□ Practice starter code is valid and runs in the correct language
□ Exercise starter code (if any) is valid and runs in the correct language
□ No broken links (video, or any other referenced URL)

STUDENT EXPERIENCE (walked through as a student would actually encounter it)
□ Header, objective, and learning content read clearly on their own
□ Video plays, is the right video, and is acceptable quality
□ Every checkpoint lands at a sensible point and is answerable from context
□ Practice tab flows logically from the Learning Content just shown
□ AI Help replies are genuinely useful, not generic filler
□ Exercise is distinct from Practice and tests independent application
□ Footer's required-activity set matches what this session actually needs
□ Completion is achievable — nothing required is missing or broken

COMPLETENESS
□ Every mandatory section (§13) is present: Basic Info, Learning, Practice, Exercise
□ AI Help has at minimum a working default reply

CONSISTENCY
□ This session's ids don't collide with unrelated existing content
□ If this is a new version of an existing session (§11), the session id matches the original exactly — this is a revision, not a new session

DECISION
□ Request Changes — notes: _______________________________________________
□ Approve — all boxes above checked
```

---

## 16A. Human-Readable Content Team Authoring Template

```
================================================================
COURSE
================================================================
Course Name:
Course ID:

================================================================
SUBJECT
================================================================
Subject Name:
Subject ID:
Order (position within the course):

================================================================
SESSION — BASIC INFORMATION
================================================================
Session ID:                    (stable — never reuse/rename after submitting)
Session Title:
Session Description:
Learning Objective:
Estimated Duration:            (optional — e.g. "25 minutes")
Prerequisites:                 (optional — plain language, e.g. "Basic Promises")
Order (position within the subject):

----------------------------------------------------------------
LEARNING CONTENT
----------------------------------------------------------------
[Explain the topic clearly. No fixed subsection structure is required —
use whatever best teaches THIS topic.]

Explanation:


Key Concepts:                  (bulleted statements)
  -
Examples:                      (short code snippets or illustrations)
  -
Concept Tags:                  (short keywords — used only for AI Help context)
  -

----------------------------------------------------------------
VIDEO                          (optional — omit this whole section if no video)
----------------------------------------------------------------
YouTube URL:                    (Unlisted, embedding enabled — see notes below)
Video Title:
Video Description:              (optional)
Duration:                       (optional)

  NOTE: "Unlisted" — reachable by anyone with the exact link, not searchable
  or publicly listed. Do NOT use "Private" — a Private video will not play
  for students. Confirm embedding is allowed for this video before submitting.

----------------------------------------------------------------
VIDEO CHECKPOINTS               (only if a video is provided; may be zero)
----------------------------------------------------------------
Checkpoint 1:
  Timestamp:                    (approximate, e.g. "4:15")
  Question:
  Options:                      (2 or more)
    1.
    2.
    3.
  Correct Answer:                (which numbered option)
  Explanation/Feedback:          (shown after the student answers)
  Required to continue:          (Yes/No — default Yes)
  Can continue after answering:  (Immediately / Only if correct — default Immediately)

Checkpoint 2:                    (repeat the block above for each checkpoint)
  ...

----------------------------------------------------------------
PRACTICE                        (required for every session)
----------------------------------------------------------------
Objective/Task:
Instructions:
Language:                       (javascript / typescript / python / java /
                                  csharp / cpp / c / sql / html)
Starter Code:                   (optional — shown to the student as a
                                  copy-paste reference, not auto-loaded)
Self-Check:                     (self-review checklist for the STUDENT to
                                  compare their own code against — never
                                  phrased as automatic grading)
  - [ ] Label 1
  - [ ] Label 2

----------------------------------------------------------------
AI HELP
----------------------------------------------------------------
Context Tags:                   (same as Concept Tags above, or a subset)
Quick Prompts and Replies:
  Quick Prompt: "..."   → Reply: "..."
  Quick Prompt: "..."   → Reply: "..."
Default Reply:                  (required — shown for anything else the
                                  student asks)

----------------------------------------------------------------
EXERCISE                        (required for every session)
----------------------------------------------------------------
Title:                          (optional — a short label)
Objective:
Scenario/Problem Statement:
Requirements:                   (bulleted list — what a correct solution must do)
  -
Evaluation Criteria:            (specific, checkable statements — this is what
                                  a reviewer, and eventually an automated
                                  evaluator, will check a submission against)
  -
Edge Cases:                     (situations beyond the happy path)
  -
Expected Behavior / Example:    (concrete input → correct output, if applicable)
Language:
Starter Code:                   (optional — auto-loaded into the student's
                                  editor if provided; leave blank for a
                                  fully independent start)
Submission Instructions:        (optional — anything beyond "write your
                                  solution and submit")

----------------------------------------------------------------
SESSION SETTINGS
----------------------------------------------------------------
Required Activities:            (Learning / Video Check / Practice / Exercise
                                  — default: all four; Practice and Exercise
                                  cannot be omitted — see the classification
                                  table in the internal specification)
Project Connection (optional):
================================================================
```

---

## 16B. Internal Content Authoring Specification (for developers)

**Purpose of this section:** explain the *reasoning* behind the template above, for whoever eventually builds the Content Manager UI, importer, validator, or student-facing renderer — so they're implementing decisions, not guessing at intent.

**Why sections, not one form/ZIP:** the task's own framing (§5 there) treats each of Basic Information / Learning Content / Video / Video Checkpoints / Practice / AI Help / Exercise as an independently completable, independently validatable unit. This mirrors §8 above exactly. A future authoring UI should let a Content Team member work section-by-section, see per-section completeness feedback, and not be blocked from saving progress just because one later section (e.g. Exercise) isn't finished yet — while the *review* (§9) still only ever happens once the whole session is complete, as one coherent unit.

**Why Video Checkpoints is its own section, not folded into Video:** a session can have a video with zero checkpoints (valid), and the number of checkpoints varies per session — treating checkpoints as a repeatable child collection of the Video section, not a fixed field on it, is what actually matches the "zero, one, or several" reality described in §4.3.

**Why Practice and Exercise are the only two sections marked flatly mandatory:** every other section has a real, observed case in the current app where it's legitimately absent or minimal (no video at all; empty Key Concepts/Examples; AI Help reduced to just a default reply). Practice and Exercise do not have that precedent anywhere in the current app — every curated/example session includes both, and the product's own stated learning pipeline (Learn → Practice → Exercise → Performance → Portfolio) structurally depends on both existing for the performance/portfolio pieces downstream to have anything real to measure.

**Why Evaluation Criteria / Edge Cases / Expected Behavior are new, not present in the prior authoring document's Exercise contract:** the prior document's `exercise` shape (`objective`, `requirements`, `starterCode?`, `language`) is sufficient for a human Content Manager to eyeball, but not sufficient for *this task's* explicit forward-looking requirement — "the authoring template must capture enough information for a future evaluator to determine whether the student's submission actually satisfies the exercise." Requirements alone tend to be broad ("uses async/await correctly"); Evaluation Criteria are written to be individually checkable ("wraps the awaited call in try/catch"). This is additive to the existing `Exercise` shape, not a redesign of it — everything the prior document already required is still required here.

**Why the YouTube capability research (§4.1) belongs in this document and not just in a code comment somewhere:** the Content Team is never going to read `practiceExecution.ts` or any React component. If they're told to author checkpoint timestamps without anyone ever having confirmed timestamp-based triggering is even *possible* with YouTube's embed, the whole Video Checkpoints section could be built on a false premise. It is possible (via polling + programmatic pause, §4.1) — but approximate, and enforcement (no-skip-ahead) is a real, separate implementation cost. Whoever eventually builds the checkpoint player needs to know that going in; whoever authors checkpoints needs to know timestamps are "roughly here," not frame-exact.

**Why "status" stays at Package + Session level only (§10), not per-section:** this is directly downstream of §9's design — review happens against the *complete* Session Workspace preview, not section-by-section sign-offs. A per-section approval status would imply sections could be independently "done," which contradicts the entire premise that a session is one coherent experience. This isn't a technology limitation — it's a product-model decision, made explicitly here so a future implementer doesn't accidentally build a more granular (and more complex) status model than the actual review process wants.

**Relationship to the frozen domain model, made explicit for implementers:** one full pass through this template, for one session, produces exactly one `ContentVersion` (per `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` §5) — Basic Information's structural fields (title/description/order) also update the canonical `Session` row, but only at publish time (per that document's §3), never during Draft/Review. The Exercise section produces one `Exercise` row (§12 there), linked to that `ContentVersion`. Nothing in this document requires or implies a schema change to that frozen model — it's a richer authoring surface feeding the same target shape, with Evaluation Criteria/Edge Cases/Expected Behavior simply becoming additional structured fields on `Exercise`, and Video Checkpoints becoming a small repeatable structure on `ContentVersion`'s `video`/checkpoint fields.

---

## 17. Explicitly Not Part of This Task

Per the task's own instructions, none of the following were done, and none are proposed as hidden scope creep:

- No React/component code was written or modified.
- No Content Manager UI was built or changed.
- No backend, database, table, or API was created.
- No ZIP format or JSON schema was created (the prior authoring document's §13 package structure still stands as the transport-level reference, unmodified).
- No packages were installed.
- No video player, checkpoint-enforcement mechanism, or AI evaluator was built — only the *authoring data* those future systems would need was defined.

This document — together with `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md` and `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` — is intended as the source of truth for: the Content Team, the Content Manager, the future backend, the future Content Manager UI, and future Student content rendering, per the task's stated purpose. Stopping here.
