# NextStep² Content Team Authoring Workflow — Final Specification

**Status:** Design/UX specification only. No React code, database tables, APIs, or application behavior were created or modified to produce this document.

**Relationship to existing documents — this is the layer on top of the other two:**
- `NEXTSTEP2_CONTENT_AUTHORING_TEMPLATE.md` already froze **what fields exist** in each of the 8 sections, the YouTube capability research, and which sections are mandatory. This document does not re-decide any of that — it designs **how a Content Team member actually experiences filling it in**, and is read as sitting directly on top of it.
- `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` already froze **where this content eventually lives** (`ContentVersion`, `Exercise`, `ContentReview`, `Publication`, etc.) and the versioning/supersession rule. This document never asks the Content Team to think in those terms, but everything below is designed to map cleanly onto that model without requiring it to change.
- Every important decision from both prior documents is preserved here. Where this document proposes a genuine refinement (not a reversal), it says so explicitly in §15 rather than silently overriding what was already frozen.

---

## 0. One product decision this document needs before anything else

**"Content Team" and "Content Manager" are the same account/role for this MVP — `content_manager`, per the frozen domain model's three-role auth model (Student / Content Manager / Admin).** They are not two different logins or two different technical roles. "Content Team" describes the *authoring* half of that role's job (this document); "Content Manager" describes the *review/approve/publish* half (already specified in the prior documents). An organization may staff these with the same person or different people — that's a staffing choice, not a technical permission split. Introducing a fourth auth role for this would contradict the already-frozen MVP scope (Student / Content Manager / Admin only), so this document deliberately does not do that. A harder author-vs-reviewer permission split, if ever wanted, is noted as a **Future** item in §14 — not designed now.

---

## 1. Content Team Navigation

```
Login (same Content Manager login)
  ↓
Content Dashboard
  ↓
Course
  ↓
Subject
  ↓
Sessions (list)
  ↓
Create / Edit Session  →  the authoring workspace (§2)
```

**Content Dashboard.** A cross-course overview — deliberately future-proofed for more than one course even though the MVP only has one. Shows:
- A short list of Courses (for MVP: exactly one — "AI Full-Stack Development").
- Two quick-access lists, matching the pattern Admin's own dashboard already uses for consistency across the app: **"My Drafts"** (sessions this account has started but not submitted) and **"Awaiting Review"** (sessions submitted and not yet actioned). Since this is the same account type doing both jobs, these two lists sit side by side rather than behind a role switch.
- No package list, no ZIP mention, no status jargon beyond plain words (Draft / Submitted / Changes Requested / Approved / Published).

**Course.** Lists Subjects within it: title, session count, and a rollup of statuses ("6 published, 2 in draft, 1 needs attention"). An "Add Subject" action is available here — see §15 on how identity/ordering is handled without exposing raw ids.

**Subject.** Lists Sessions within it: title, status badge, and a compact completeness indicator ("6 / 8 sections complete"). Sessions can be searched/filtered here (see §15 — this matters at scale, not for the first handful of sessions). An "Add Session" action starts a new session in this subject.

**Create / Edit Session.** Opens the authoring workspace — §2.

At no point in this navigation does the Content Team see the words "package," "import," "ZIP," "ContentVersion," "Publication," or a raw database id. Status is always shown as a plain badge with a one-line meaning (§9).

---

## 2. Session Authoring Workspace — the UX decision

**Recommendation: confirm the left sidebar section-navigation + main content pane layout, evaluated against the real alternatives rather than accepted by default.**

| Approach | Why it doesn't fit here |
|---|---|
| One long scrolling form | 8 sections' worth of fields on one page makes "which parts are done" invisible without scrolling the whole thing every time; actively fights the "work on sections independently, out of order" requirement — everything just blends into one undifferentiated form |
| Horizontal tabs | Fine for 3–5 tabs; cramped and hard to scan at 8, and tabs don't naturally show a persistent, always-visible completion checklist alongside the content the way a sidebar does |
| Stepper (linear Next/Back wizard) | Actively wrong for this use case — a stepper enforces order, and the task's own requirement is that a Content Team member can do Exercise before Video, save, come back tomorrow, and do Practice — there is no mandated order |
| Accordion (stacked, expand/collapse) | Better than a single form, but still requires scrolling to see sections outside the one currently expanded, and doesn't give a persistent, glanceable status list the way a fixed sidebar does |
| **Left sidebar + main pane (proposed)** | **Matches the actual mental model exactly: 8 independently completable modules, jump to any one instantly, always-visible completion status for all 8 at once, no imposed order.** This is also a proven, familiar pattern for exactly this kind of multi-section authoring (block-based document editors, course-authoring tools, PR file-tree review) — not a novel interaction the Content Team has to learn from scratch. |

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ ← Sessions        Async / Await          [Save Draft] │
├────────────────┬───────────────────────────────────────┤
│ Session Info  ✓│                                       │
│ Learning      ✓│                                       │
│ Video         ✓│         Current section's content     │
│ Checkpoints   ✓│                                       │
│ Practice      ✓│                                       │
│ AI Help       ✓│                                       │
│ Exercise      ○│                                       │
│ Settings      ✓│                                       │
│                 │                                       │
│ [Submit for     │                                       │
│  Review]        │                                       │
│ (disabled —     │                                       │
│  Exercise not   │                                       │
│  complete)      │                                       │
└────────────────┴───────────────────────────────────────┘
```

- **`Save Draft`** is always available, from any section, regardless of what's incomplete — this is the whole point of the sidebar model (§9 defines exactly what "saved" means per section).
- **`Submit for Review`** lives in the sidebar too (not just at the very end of a linear flow, since there is no linear flow) — visibly present at all times, but disabled with a plain-language reason ("Exercise isn't complete yet") until every mandatory section is ✓.
- Clicking any sidebar item jumps straight to that section — no forced order, no "you must finish Video before you can look at Exercise."
- A back link returns to the Sessions list (§1) without losing the draft.

---

## 3. File / Document Uploads

**Core rule, stated once and applied consistently: uploading a document makes it available for reference — it does not, by itself, make the student see that document.** The current Student Session UI has no document viewer of any kind (confirmed against the real implementation in the prior template document) — nothing changes that here. What the student actually sees is always the structured fields entered directly in the workspace.

| Section | What's entered/uploaded | Format | Where it goes |
|---|---|---|---|
| Session Information | Title, Description, Objective — typed directly | Text | **Structured content** — student-facing |
| Learning Material | Explanation, Key Concepts, Examples, Concept Tags — typed directly, in list-builder/rich-text fields | Text | **Structured content** — student-facing |
| Learning Material | *Optional* "Reference Material" attachment | DOCX / PDF / PPTX / images | **Supplementary only** — internal working reference for the Content Team/Content Manager, clearly labeled "Not shown to students," never converted or rendered |
| Video | YouTube URL, title, description | Text (URL) | **Structured content** — student-facing (no video *file* is ever uploaded — see the original authoring document's decision on this) |
| Video Checkpoints | Timestamp, question, options, answer, feedback — typed/captured directly (§4) | Text | **Structured content** — student-facing |
| Practice | Task/instructions — typed directly; starter code — typed directly into a code field, not uploaded as a file | Text / code text | **Structured content** — student-facing |
| AI Help | Prompt/reply pairs, default reply — typed directly | Text | **Structured content** — student-facing |
| Exercise | Objective/scenario/requirements/evaluation criteria/edge cases/expected behavior — typed directly (list-builders where it's naturally a list); starter code — typed directly into a code field | Text / code text | **Structured content** — student-facing |
| Exercise | *Optional* "Reference Material" attachment | Any document, or a data file (e.g. CSV/JSON) | **Supplementary only, with one important caveat below** |

**Why starter code is typed, not uploaded, for both Practice and Exercise:** starter code is short (a snippet, not a project), and the running app just needs the raw text to hand to the code embed — asking the Content Team to save a file, then upload it, for something that's often three to fifteen lines is friction for no benefit. A code-text field (optionally with basic syntax highlighting once implemented) is simpler for a content author and matches exactly what the system actually needs.

**Why an "instructions document" upload is deliberately not offered for Practice:** Practice instructions are short enough to type directly in the workspace. Requiring a separate document + upload step for a paragraph of text is designing for a workflow no one asked for — a direct honest instance of "designing for developers instead of content creators" (see §15).

**Important, honest caveat on Exercise reference material:** if an exercise genuinely needs the *student* to have a data file (e.g., a CSV the student's code reads), that is not achievable today — the current Exercise code embed (OneCompiler) has no mechanism to hand the student's environment anything beyond the starter code text itself. **A Content Team member must not author an exercise that depends on a downloadable file reaching the student**, because there is currently no delivery path for that. This is the same "do not invent unsupported capability" discipline already applied to video in the prior document, applied here to file delivery.

---

## 4. Video Authoring

**Adding the video:** paste a YouTube URL, give it a title, optionally a description. A **`Preview Video`** button renders the real YouTube embed inline, right in the authoring workspace — this is safe to build now (not a future item) because it's the exact same plain iframe embed the Student UI already uses; there's no checkpoint logic involved in just watching the video back.

**Adding checkpoints — recommended UX: both capture-while-watching and manual entry, with capture as the primary path.**

1. The Content Team plays the previewed video, **pauses it at the exact moment** they want a checkpoint (pausing first, not clicking mid-motion while playing, is what gives an accurate timestamp — reacting and clicking during active playback is naturally a beat late).
2. They click **`+ Add Checkpoint Here`**, which captures the paused position automatically (`getCurrentTime()` via the YouTube IFrame API — a real, already-confirmed capability, not a new claim).
3. A form appears for that checkpoint: Question, Options, Correct Answer, Feedback, Required (yes/no), Continue behavior (immediately vs. only if correct) — see §5.
4. The captured timestamp is shown in normal `mm:ss` format and remains **editable** — the Content Team can nudge it a couple of seconds either way without re-scrubbing the whole video, which covers the case where the auto-capture landed slightly off.

**Why both, not just one:** capture-while-watching is dramatically lower-friction and more accurate than externally scrubbing YouTube's own player, noting a time, and typing it in — but a pure "click and lock in" flow with no manual correction would punish a slightly-mistimed click by forcing a full redo. Offering manual adjustment as a refinement on top of the captured value gets the speed of one approach and the precision of the other.

```
Video
────────────────────────────────
YouTube URL:  [ https://youtu.be/... ]
Video Title:  [ Async / Await Explained ]
Description:  [ optional ]

[ Preview Video ]

Checkpoints                              [ + Add Checkpoint Here ]

  04:20 — What does `await` do?                    [Edit] [Delete]
  09:35 — Why wrap awaited calls in try/catch?      [Edit] [Delete]
  14:10 — What type does an async function return?  [Edit] [Delete]
```

---

## 5. Video Checkpoint Behaviour — the authoring contract

Unchanged from `NEXTSTEP2_CONTENT_AUTHORING_TEMPLATE.md` §4.3 — restated here briefly, not re-derived:

| Field | Meaning |
|---|---|
| Timestamp | Where the checkpoint occurs (approximate — see below) |
| Question | The question text |
| Options | 2 or more answer choices |
| Correct Answer | Which option is correct |
| Explanation / Feedback | Shown after the student answers, right or wrong |
| Required | Whether this checkpoint counts toward session completion — default yes |
| Continue behavior | Whether the student may continue immediately after answering, or only once correct — default: immediately |

**What is and isn't technically possible with the YouTube player, restated plainly (do not claim more than this):**
- YouTube does **not** provide checkpoint/quiz functionality itself. Any quiz overlay is something NextStep² has to build on top of the player — exactly what the current prototype's mocked Quick Check already does, just extended to support several checkpoints instead of one.
- Triggering a pause "at" a checkpoint means **polling the player's current position** and reacting when it crosses the authored timestamp — there's no native "fire at time X" hook, so triggering is approximate to within the polling interval, not frame-exact.
- Reliably **preventing** a student from dragging past an unanswered checkpoint requires hiding YouTube's native scrubber and building custom playback controls — a real, buildable, but non-trivial future implementation item, not something achievable "for free."
- Videos must be set to **Unlisted** (not "Private," which generally won't play in an embed for arbitrary viewers) with embedding enabled.

None of this needs to be visible to the Content Team as caveats in the UI itself — it's documented here so whoever eventually builds the checkpoint player knows exactly what they're building against.

---

## 6. Practice Authoring

Practice is guided learning, not evaluation — the workspace should say so, not just imply it.

```
Practice
────────────────────────────────
Task / Objective:
[                                                    ]

Instructions:
[                                                    ]

Language:  [ JavaScript ▾ ]   (TypeScript / Python / Java / C# / C++ / C / SQL / HTML)

Starter Code (optional — shown to the student as a reference, not auto-loaded):
[  code text area, monospace                         ]

Self-Check (optional, recommended):
  ⓘ This is a checklist for the STUDENT to compare their own code against.
    It is never graded automatically — write it that way.
  [ + Add item ]
   - [ ] Function is declared with `async`
   - [ ] Both fetch calls use `await`
```

The inline reminder ("never graded automatically — write it that way") is a deliberate UI-level safeguard, not just documentation — it's placed exactly where a Content Team member is about to write self-check items, at the moment the wording choice actually happens.

---

## 7. AI Help Authoring

The simplest interface that matches what the app actually does — a small FAQ, not an AI-generation tool:

```
AI Help
────────────────────────────────
Context tags (optional):  [ async-await ] [ promises ] [ + ]

Quick Prompt #1
  Student Question:  [ What does async mean? ]
  Answer:             [ ... ]

Quick Prompt #2
  Student Question:  [ Why use await? ]
  Answer:             [ ... ]

[ + Add Question ]

Default Answer (required — shown for anything else a student asks):
  [ ... ]
```

The Content Team types every reply themselves. Nothing here calls an AI model, generates text, or evaluates a question at authoring time — this is intentionally a plain content-entry form, matching §6/§10 of the Template document exactly.

---

## 8. Exercise Authoring

The most consequential section for future AI-assisted evaluation — the fields need to be specific enough that a future evaluator (or, today, a human) can actually check a submission against them, without this document designing that evaluator.

```
Exercise
────────────────────────────────
Title (optional):        [ ... ]
Objective:                [ ... ]
Scenario / Problem:       [ ... ]

Requirements                              [ + Add requirement ]
  - Function is declared async
  - Uses await for the fetch call
  - Wraps the awaited call in try/catch

Evaluation Criteria                       [ + Add criterion ]
  ⓘ Write each one as a single, checkable statement — something a person
    (today) or an automated evaluator (later) could mark true or false.
    e.g. "Returns null when the request fails" — not "handles errors well."
  - Returns null when the request fails
  - Returns the parsed JSON response on success

Edge Cases                                [ + Add edge case ]
  - Empty city name provided
  - Network request times out

Expected Behavior (optional — concrete example)
  Input:   getWeather("Paris")
  Output:  { temp: 18, condition: "cloudy" }

Language:      [ JavaScript ▾ ]
Starter Code (optional — auto-loaded into the student's editor if provided):
  [ code text area, monospace ]

Submission Instructions (optional):
  [ ... ]
```

The inline guidance under **Evaluation Criteria** ("write each one as a single, checkable statement") is the single most important UI-level nudge in this whole document for the AI-evaluation goal — it steers the Content Team toward the phrasing an evaluator can actually use, at the exact point they're writing it, rather than relying on a reviewer to catch vague criteria later.

---

## 9. Section Completion Status

**The status shown per section is authoring completeness — never approval status.** These are deliberately different concepts and must never be blended into one indicator.

**Three states, one consistent rule applied to every section:**
- **○ Not Started** — none of the section's mandatory fields are filled in yet.
- **⚠ Needs Attention** — some but not all mandatory fields are filled, *or* all mandatory fields are filled but something recommended is missing (e.g. Practice has a task/language but no Self-Check) or an actual validation issue exists (e.g. a quick prompt with no matching reply).
- **✓ Complete** — every mandatory field for that section is filled, with no known validation issues.

**A necessary fourth marker for genuinely optional sections: Skipped / Not Applicable.** A session may legitimately have no video, or a video with zero checkpoints. Without an explicit way to say "I decided not to include this," an optional section just sits at "○ Not Started" forever — indistinguishable from "I haven't gotten to it yet." The Content Team can explicitly mark Video, Video Checkpoints, or the AI Help quick-prompt list as **Skipped**, which shows a distinct, calm marker (e.g. a dash, not a warning) — this tells a reviewer "this was a deliberate choice," not an oversight.

**What blocks `Submit for Review`:** any **mandatory** section that is not ✓ (Session Information, Learning Material, Practice, Exercise — see §14/§15). An optional section sitting at ○ or ⚠ never blocks submission; "Skipped" never blocks it either, by definition.

---

## 10. Content Manager Review

The review screen shows the same 8-section checklist, read-only, plus one action that matters more than everything else on the screen:

```
Session: Async / Await

✓ Session Information
✓ Learning Material
✓ Video
✓ Video Checkpoints
✓ Practice
✓ AI Help
✓ Exercise
✓ Settings

[ Preview as Student ]

────────────────────────
[ Request Changes ]     [ Approve ]
```

**"Preview as Student" is not a new technical problem to solve — it's the existing, already-proven mechanism, reused.** The current application already renders the exact same `SessionWorkspace` component for both the real Student session and the Content Manager's draft preview (`mode="preview"` vs `mode="student"`, sharing one component, per the original authoring document's own findings). This review screen's Preview is that same mechanism, pointed at whatever the Content Team currently has in this Draft — not a form/JSON dump, not a simplified summary. The reviewer genuinely walks through: Learn (with the real video and "About this lesson" card), each checkpoint as authored, the Practice tab (including the live code editor), the AI Help tab, the Exercise tab (including its live code editor), and — since completion is part of the real experience — can walk through to the Completion screen too. Every bit of this is read-only and non-persisting, exactly like today's preview.

**Request Changes** requires notes (unchanged, existing rule) — those notes then appear as a clear, prominent banner at the top of the Content Team's authoring workspace the next time they open this session, so the "why" is impossible to miss.

**Approve** requires every mandatory section to be ✓ (mirrors the existing rule that approval needs a complete checklist).

---

## 11. Approval and Publishing

Stated in Content-Team-facing language — the underlying mechanism is exactly what's already frozen in the domain model, not redesigned here.

- **Request Changes →** the session returns to the Content Team as an editable Draft, with the reviewer's notes shown prominently. Nothing already entered is cleared. The Content Team revises whatever was flagged and re-submits.
- **Approve →** the session is signed off but **not yet visible to students**. It sits in an "Approved — ready to publish" state until a separate, explicit Publish action happens.
- **Publish →** this specific version becomes what students see, from that moment on.

**Revising an already-published session** — exactly the sequence already agreed:
```
Version 1 — Published — students see V1

Content Team edits the session (same session, new draft)

Version 2 — Draft            — students STILL see V1
Version 2 — Submitted/Review — students STILL see V1
Version 2 — Approved         — students STILL see V1
Version 2 — Published        — students now see V2 (V1 is automatically
                                superseded in the same action, per the
                                already-frozen Publication model — no
                                separate "unpublish V1" step exists or is
                                needed)
```
The Content Team never edits "the live version" in place — every revision is a complete new pass through the same 8 sections against the same session identity, which is exactly why the authoring workspace is section-by-section in the first place: revising one part (say, just the video) still means the whole session goes through review again, because the student experience is reviewed as a whole (§10), not patched piecemeal.

---

## 12. Student Visibility Rule — frozen

**Students only ever see Published content. Draft, Changes Requested, and Approved content must never reach the student application, without exception.**

This is not a new promise made by this document — it is an already-implemented and already-tested guarantee in the current application (verified directly, not assumed: Draft/Changes-Requested/Approved isolation from students is covered by existing passing tests). This authoring workflow is designed to preserve that guarantee exactly as content moves through more sections and more revisions — nothing about a richer authoring UI changes what "Published" means or when it applies.

---

## 13. Final Content Team Experience — a full worked example

**Course:** AI Full-Stack Development · **Subject:** Backend Development · **Session:** Async / Await

This reuses the exact worked example already established in `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md` §20 — presented here as what the Content Team would actually type into each section of the workspace, not a new example invented for this document.

**Session Information**
```
Title:       Async / Await
Description: Learn how to write asynchronous JavaScript using async/await.
Objective:   By the end of this session you'll be able to write asynchronous
             JavaScript using async/await instead of raw Promise chains, and
             understand why you'd choose to.
Estimated duration: 25 minutes
```

**Learning Material**
```
Explanation:
JavaScript runs on a single thread. Asynchronous code lets slow operations
(like network requests) happen in the background without freezing
everything else. Promise chains (.then().then().catch()) work, but get
hard to read once you have several steps — async/await lets you write
asynchronous code that reads top-to-bottom like normal, synchronous code.
Marking a function `async` means it always returns a Promise and lets you
use `await` inside it; `await` pauses execution of that function until the
Promise it's given resolves, without blocking the rest of the browser.
Common mistakes: forgetting `await` (you get a Promise object instead of
the resolved value); using `await` outside an `async` function; not
wrapping awaited calls in try/catch.

Key Concepts:
  - `async` functions always return a Promise.
  - `await` pauses only that function, not the whole program.
  - Errors from an awaited call are caught with a normal try/catch block.

Examples:
  - async function getUser() { const res = await fetch("/api/user"); return res.json(); }
  - try { const data = await getUser(); } catch (err) { console.error(err); }

Concept tags: async-await, promises, error-handling

Reference Material (optional, internal only): async-await-source-notes.docx
```

**Video**
```
YouTube URL: https://youtu.be/EXAMPLE_UNLISTED_ID  (Unlisted)
Video Title: Async / Await Explained
Duration:    8:45
```

**Video Checkpoints**
```
04:20 — "What does the `await` keyword do?"
  Options: (1) Pauses the current async function until the Promise resolves
           (2) Stops the entire browser until the request finishes
           (3) Converts a synchronous function into an async one
           (4) Cancels a Promise
  Correct: 1
  Feedback: Exactly — it only pauses that function, nothing else on the page.
  Required: Yes · Continue: Immediately after answering
```

**Practice**
```
Task: Rewrite the given Promise-chain function to use async/await instead.
Instructions: The starter code fetches a user and then their posts using
.then(). Convert it to a single async function using await, with a
try/catch around the two calls.
Language: JavaScript
Starter Code:
  function loadUserAndPosts(userId) {
    return fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((user) => fetch(`/api/users/${userId}/posts`)
        .then((res) => res.json())
        .then((posts) => ({ user, posts })));
  }
Self-Check:
  - [ ] Function is declared with `async`
  - [ ] Both fetch calls use `await`
  - [ ] A try/catch wraps the awaited calls
  - [ ] No `.then()` chains remain
```

**AI Help**
```
Context tags: async-await, promises, error-handling
Quick Prompt: "Explain this topic"
  → "async/await is a cleaner way to write Promise-based code — `await`
     pauses an async function until a Promise settles, so the rest of your
     code reads top-to-bottom instead of nesting in .then() callbacks."
Quick Prompt: "Give me a hint"
  → "Every `await` must be inside a function marked `async`. If you see a
     syntax error near `await`, check that first."
Default Answer: "Good question — try asking about async, await, or error
  handling with try/catch, and I'll do my best to help."
```

**Exercise**
```
Objective: Independently write an async function with proper error handling.
Scenario: Write a function getWeather(city) that fetches weather data for a
city from a (mock) endpoint and returns the parsed result, handling
failures gracefully.
Requirements:
  - Function is declared async
  - Uses await for the fetch call
  - Wraps the awaited call in try/catch
Evaluation Criteria:
  - Returns null when the request fails
  - Returns the parsed JSON response on success
Edge Cases:
  - City name is empty
  - Network request times out
Expected Behavior:
  Input:  getWeather("Paris")
  Output: { temp: 18, condition: "cloudy" }
Language: JavaScript
Starter Code: (intentionally left blank — student starts fresh)
```

**Session Settings**
```
Required Activities: Learning, Video Check, Practice, Exercise (all four — default)
Project Connection: This is the same async/await pattern you'll use when your
  full-stack project's frontend calls its backend API.
```

---

## 14. Final Implementation Boundary

| | Scope |
|---|---|
| **We build now** | This specification only — no code |
| **We build later (Backend)** | The persistence layer this content lands in, already frozen in `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` — not re-opened here |
| **We build later (Authoring UI)** | The actual React implementation of the workspace described in §1–§13, once this spec is approved |
| **Future — AI evaluation** | An evaluator that actually checks a submission against Evaluation Criteria — this document only makes sure the raw material (§8) exists; no evaluator is designed |
| **Future — advanced video checkpoint player** | Enforced no-skip-ahead via custom controls (§5) — the authoring *data* is ready for it; the *player* is not built |
| **Future — content analytics** | Which sessions get low completion, which AI Help prompts get used most, authoring velocity per Content Team member, etc. — nothing like this exists or is proposed |
| **Future — author-vs-reviewer permission split** | If ever wanted, a harder technical separation between who can author vs. who can review (§0) |

None of the Future items are allowed to add a field, a button, or a screen to the MVP authoring workspace — every section above is scoped to what a Content Team member needs today, not what a later feature might eventually want to hang off of it.

---

## 15. Challenge the Workflow — honest critique before freezing it

**What is unnecessarily complicated?**
Exercise's three separate list-builders — Requirements, Evaluation Criteria, and Edge Cases — genuinely overlap for a non-technical author. "Handles an empty city name" could just as easily be written as a Requirement, an Evaluation Criterion, or an Edge Case, and a Content Team member has no principled way to know which bucket it belongs in. **Recommendation: merge Edge Cases into Evaluation Criteria** — an edge case is just phrased as one more checkable criterion (e.g., "Returns null when the city name is empty" is simultaneously an edge case *and* a criterion). This reduces three overlapping lists to two clearly distinct ones (Requirements = plain-language what; Evaluation Criteria = the checkable how-do-we-know, edge cases included) without losing any information the future evaluator would need. This is a genuine simplification recommendation, not something silently applied to §8/§13 above — the field-level template stays as `NEXTSTEP2_CONTENT_AUTHORING_TEMPLATE.md` froze it unless this recommendation is separately approved.

**What will confuse a non-technical Content Team?**
- Any raw technical identifier. **The Content Team should never see, type, or manage a "session id."** Ids are auto-generated from the title the first time a session is created and never surfaced as an editable field afterward (shown, if at all, in small grey text purely for support purposes) — this document's earlier sections already avoid asking for one; called out explicitly here as a hard rule, since the underlying domain model does depend on that id staying stable, and the only way to guarantee that is to never let a human retype it.
- A raw "Order" number field for Subjects/Sessions reads as a spreadsheet, not authoring. **Recommend drag-and-drop reordering** in the Subjects/Sessions list views instead of a numeric input anywhere.
- A checkbox list for "Required Activities" mirroring an internal enum verbatim is designing for developers. See the next point.

**What should be removed?**
- The raw "Required Activities" toggle, as a freely editable field. Practice and Exercise are *always* required (§13/§14 of the Template document — this document doesn't relitigate that), so there's nothing to toggle for them. Video Check can only be required if a Video with at least one checkpoint actually exists — so it should be **auto-derived from what was actually authored**, not a manual checkbox a Content Team member could set inconsistently with the content they wrote. This removes an entire field from Session Settings without losing any real capability.
- The Edge Cases field, per the recommendation above.
- Any "instructions document" upload for Practice (§3) — typing directly is simpler and was never actually requested by anything in the real student UI.

**What should be mandatory?** Session Information (Title/Description/Objective), Learning Material (Explanation), Practice (Task/Instructions/Language), Exercise (Objective/Requirements/Language) — these four sections gate `Submit for Review`. Nothing else does.

**What should be optional?** Video and Video Checkpoints (with an explicit Skip marker, §9), Key Concepts/Examples/Concept Tags, Estimated Duration/Prerequisites, Starter Code on both Practice and Exercise, Self-Check, AI Help beyond the one Default Answer, Project Connection, and both Reference Material attachment slots.

**Where are we accidentally designing for developers instead of content creators?** Every instance already named above (raw ids, raw order numbers, a checkbox mirroring an internal enum, JSON-shaped "type a comma-separated list" inputs anywhere instead of add/remove row buttons, bare enum words like "APPROVED" instead of plain-language status microcopy such as "Approved — ready to publish"). The fix in every case is the same: replace anything that reads like a database field with an interaction a content author already understands (typing prose, dragging to reorder, clicking add/remove, watching a checklist fill in).

**What information must ultimately reach the backend?** Exactly the structured fields spelled out in §2–§13 above — the same shape as `ContentVersion`/`Exercise` in the frozen domain model. Nothing else.

**What should remain purely a Content Team concern?** Their own source documents (the DOCX/PPTX/etc. they drafted from), their internal notes, their own process for deciding how to phrase something — none of that is content, only the final structured fields are, and the optional Reference Material upload exists precisely so that distinction has a clear, honest home ("this is here for us, not for students") instead of getting conflated with real content.

**Is section-by-section authoring actually better than one large form?** Yes, for the reasons argued in §2 — but only because the section count (8) genuinely mirrors 8 real, distinct parts of the actual student experience, one-to-one. If this had been split further (e.g., separating "Key Concepts" and "Examples" into their own top-level sections instead of both living inside Learning Material), the sidebar would start working against the Content Team instead of for them. Eight is the right number *because* it maps to something real, not because more sections inherently means more organized.

**Is this workflow scalable to hundreds of sessions and multiple Content Team members?** Partially, honestly:
- The Course → Subject → Sessions navigation scales structurally, **but only if the Sessions list gains search/filter/sort by status and last-edited** the moment there are more than a screenful of sessions in one subject — not specified until now, and genuinely necessary, not a nice-to-have, once a subject has dozens of sessions.
- **Concurrent multi-author editing of the *same* session is an open question this document does not solve.** The honest MVP answer is: assume one author at a time per session (no real-time collaborative editing, no field-level locking) — safe, simple, and consistent with everything else in this MVP's "avoid unnecessary complexity" posture. True concurrent co-authoring on one session is a **Future** item (§14), not something to quietly assume works.
- A lightweight "assigned to" note on a session (who's currently responsible for it) would genuinely help multiple Content Team members avoid stepping on each other, but adding it now would be new scope beyond what this task asked for — flagged as a reasonable **Future/Should-Have**, not designed here.

---

## 16. Final Recommended Content Team Workflow

This is the frozen answer, incorporating every accepted refinement from §15 into one coherent statement:

1. Content Team logs in with the same Content Manager account used for review (§0).
2. They navigate Course → Subject → Sessions, using search/filter once lists get long, and create or open a Session.
3. The authoring workspace is a **left sidebar (8 sections) + main content pane**, not a form, not tabs, not a stepper — sections are worked in any order, saved as a Draft at any point, with a persistent per-section ✓ / ⚠ / ○ / Skipped indicator.
4. Every field is entered directly as text, list rows, or code text — **never a raw id, a raw order number, or a JSON-shaped input.** Ids are auto-generated and never touched by a human; ordering is drag-and-drop; Required Activities beyond the fixed Practice/Exercise mandate is auto-derived from what was actually authored, not a manual toggle.
5. Exercise's authoring surface is Requirements + **Evaluation Criteria (edge cases folded in, per §15)** + Expected Behavior + Language + optional Starter Code — written with inline guidance nudging checkable, specific phrasing, because this is the one section a future AI evaluator will depend on most.
6. `Submit for Review` is disabled until Session Information, Learning Material, Practice, and Exercise are all ✓ — nothing else blocks it.
7. The Content Manager reviews using **`Preview as Student`** — the real, existing `SessionWorkspace` component, not a form or JSON view — walking the full Learn → Video → Checkpoint → Practice → AI Help → Exercise → Completion experience exactly as a student would.
8. `Request Changes` returns the session to Draft with the reviewer's notes shown prominently; nothing entered is lost. `Approve` then `Publish` follow the already-frozen lifecycle; publishing a revision to an already-live session atomically supersedes the previous version — students never see anything between Draft and the moment of Publish.
9. **Students only ever see Published content — a rule already proven, not newly promised, by the current application.**

Frozen. No implementation begins from this document alone.
