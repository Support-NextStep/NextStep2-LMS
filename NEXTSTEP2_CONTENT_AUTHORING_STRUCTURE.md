# NextStep² Content Authoring Structure

**Status:** Finalized MVP content contract, pending review. Design/documentation only — no application code was changed to produce this document.
**Supersedes:** the first draft of this document. This version incorporates finalized business/product decisions (multi-course support, YouTube video field, Content Manager lifecycle, stable session identity) on top of the original technical inspection of the real Student Session Workspace.

Throughout this document, every claim is labeled as either:

- **CURRENT IMPLEMENTATION** — true today, verified by reading the actual code.
- **MVP CONTENT DESIGN** — a finalized decision for the content structure that does **not** exist in the app yet (nothing has been built for it).

Nothing in this document has been implemented. It is the contract that a future Content Manager UI, importer, validator, and publish workflow will be built against.

---

## 1. Purpose

NextStep² will outsource or hire a dedicated Content Team to prepare educational material. Before any Content Manager UI, importer, or admin tooling is built, NextStep² needs one authoritative answer:

> **Exactly what content does a Session need — in exactly what shape — for a student to learn it, practice it, and independently apply it?**

This document is that answer. It combines two things:
1. What the **current** Student Session Workspace implementation actually requires (inspected directly in code).
2. The **finalized business decisions** about what the MVP content structure should be going forward (multi-course support, video handling, lifecycle, etc.), even where those decisions go beyond what's implemented today.

Where the two differ, this document says so explicitly rather than blending them.

---

## 2. Core Principle

The Student Experience is the source of truth for the Content Structure.

```
STUDENT EXPERIENCE
        ↓
CONTENT REQUIREMENTS
        ↓
CONTENT AUTHORING TEMPLATE
        ↓
CONTENT PACKAGE
        ↓
IMPORT → VALIDATE → PREVIEW → REVIEW → APPROVE → PUBLISH
        ↓
STUDENT EXPERIENCE
```

The Content Team does not invent their own structure. NextStep² defines the structure from what a student actually experiences in a Session; the Content Team fills it in; the Content Manager is the quality gate before anything reaches a student.

No field exists in this structure "because it sounds useful." Every field is either traced to a real, currently-rendered part of the Student Session Workspace, or is an explicitly-labeled MVP design decision (like the YouTube video field) that the product has now decided to add.

---

## 3. Course → Subject → Session Hierarchy

```
COURSE
    ↓
SUBJECT
    ↓
SESSION
    ↓
SESSION CONTENT
```

### Course
A complete learning program.
*Example: "AI Full-Stack Development"*

- **CURRENT IMPLEMENTATION:** exactly one hardcoded course object exists (`{ title, description }`), with no `id` and no concept of multiple courses.
- **MVP CONTENT DESIGN (finalized decision):** the content structure must **not** assume a single course forever. A `Course` has a stable `id`, `title`, and `description`. "AI Full-Stack Development" is the first course, not the only one the architecture supports. Multi-course support in the *student-facing app* (course selection, enrollment across courses, etc.) is **not** part of this task and is not being built now — only the *content structure* is designed to not block it later.

### Subject
A major learning area within the course.
*Examples: Frontend Development, Backend Development, AI, Database.*

- **CURRENT IMPLEMENTATION:** `id` (slug), `title`, `description` (short blurb), and a separate longer `subtitle` (shown at the top of the Subject page — a distinct field from `description`, not a duplicate). Ordering is implicit array position; there is no explicit order field.
- **MVP CONTENT DESIGN:** add an explicit `order` (integer) field, and a `courseId` reference. Subject `id` remains the stable identity; `order` is purely presentational and can change independently of identity.

### Session
One coherent learning topic.
*Example: "Async / Await" — a session may legitimately cover two closely related concepts (async **and** await) when they belong together as one topic. A Session is not defined by "one concept per session" — it's defined by "one coherent thing the student is learning right now."*

- **CURRENT IMPLEMENTATION:** `id` (slug), `title`, `description`. The `id` must be globally unique across the *entire course* (the code looks up a session by scanning every subject's session list flatly, not scoped to one subject). Ordering is implicit array position within the subject's session list.
- **MVP CONTENT DESIGN (finalized decision):** **Session ID must be stable and must never be derived from array position.** It is the permanent identity of the session — used to key submissions, progress, and performance forever, even if the session is later reordered within its subject. Add an explicit `order` (integer) field, kept fully separate from `id`, to control display order. Add a `subjectId` reference.

### Session Content
Everything required for a student to learn, practice, and independently apply that session's topic — see §5–7.

---

## 4. Session Definition (clarified)

A Session is **one coherent learning topic**, not a fixed unit of "one concept." "Async / Await" is one Session because async and await are inseparable in practice — teaching one without the other wouldn't be coherent. The test for "should this be one Session or two?" is: *does the student need both ideas together to make sense of either one?* If yes, it's one Session.

This is a content-authoring judgment call made by the Content Team, not something the application enforces mechanically.

---

## 5. Complete Student Experience (Session Workspace, as implemented today)

**CURRENT IMPLEMENTATION**, verified directly from `SessionPage.tsx` and its data sources. A session is one page, header + two panels:

**Header:** subject title, "Session N of M", session title, session description, a progress bar.

**Left panel — "Learn":**
- A "Session Video" block. Today this is a fully mocked play/checkpoint timer with **no real video asset behind it at all** (see §9 — this is exactly what the new Video field is meant to fix, as an MVP design decision, not yet implemented).
- Mid-"video," a **Quick Check** overlay: one multiple-choice question, immediate correct/incorrect feedback.
- An "About this lesson" card: `objective`, `keyConcepts` (bullets), `examples` (snippet bullets).
- If the session is configured as a **live** session (a small, separate delivery-scheduling feature, unrelated to lesson content), the video block is replaced with a join/schedule UI instead. Not part of this content structure — see §23.

**Right panel — a 3-tab "Do" area:**
- **Practice:** task instructions, an embedded OneCompiler editor (starter code shown as a copyable reference block — the current Practice embed does **not** auto-load starter code into the editor), a "Self-Check" button revealing a static, pre-authored reference checklist (explicitly labeled to the student as a self-review guide, **not** automatic grading), and an "AI Hint" button.
- **AI Help:** a small set of clickable quick-prompt chips, each mapped to one canned reply by exact string match; anything else typed gets one generic default reply. A breadcrumb shows short `concepts` tags for context.
- **Exercise:** objective, a requirements checklist, an embedded OneCompiler editor **with starter code auto-populated** (Exercise's embed configuration does support this, unlike Practice's), a Submit flow (confirm → attempt number → success message, never a grade or score), and a list of previous submission attempts.

**Footer:** which required activities are done, and a "Complete Session →" button, enabled only once every required activity for that session is done.

**Completion screen:** a computed performance percentage (from real Video Check correctness + Practice checklist pass rate) and a hardcoded, non-personalized "what you did well / what to improve" pair of sentences (not content-authored — see §23).

---

## 6. Student Experience → Content Mapping

| Student sees / does | Content Team must provide | Status |
|---|---|---|
| Session title, objective, subject context | Session `id`, `title`, `objective`, `subjectId`, `order` | CURRENT (title/objective) + MVP DESIGN (stable id discipline, subjectId, order) |
| "About this lesson" objective paragraph | Learning objective | CURRENT |
| Learn panel "Key Concepts" bullets | Key concept statements (optional) | CURRENT |
| Learn panel "Examples" snippets | Example code/snippets (optional) | CURRENT |
| Learn panel video | YouTube video URL + title | **MVP DESIGN — not implemented yet** (see §9) |
| Quick Check question | Question, options, correct answer | CURRENT |
| Practice task, language, starter code, Self-Check list | See §7 table | CURRENT |
| AI Help quick prompts, replies, default reply, concept tags | See §10 | CURRENT |
| Exercise objective, requirements, language, starter code | See §7 table | CURRENT |
| Which activities gate "Complete Session" | `requiredActivities` list | CURRENT |
| Optional "connects to your final project" line | One sentence | CURRENT |
| Estimated duration shown anywhere in the UI | — | **Not rendered anywhere today.** Included in the authoring template as a **proposed** field per the finalized template (§14), but it has no current UI consumer — flagged, not fabricated as if it already works. |

**Explicitly NOT authored by the Content Team** (see §21 for the full authored-vs-student-data separation):
- Completion status, progress percentages, performance scores — computed from real student activity at runtime.
- Exercise submissions and attempt numbers — generated when a student actually submits.
- Student portfolio content — student-owned and edited by the student.
- The completion screen's "what you did well / what to improve" text — currently hardcoded, not content-authored (flagged in §23 as a future opportunity, not solved here).

---

## 7. Session Content Contract

The literal shape a session's content must satisfy, field-for-field, combining what exists today with the finalized MVP additions. **CURRENT** fields are exactly what `SessionContent` in `sessionContent.ts` requires today; **NEW** fields are finalized MVP design decisions with no implementation yet.

```ts
SessionContent {
  // ---- Basic Information ----
  id: string;              // CURRENT — stable, permanent, never derived from position
  subjectId: string;       // NEW — explicit parent reference
  order: number;           // NEW — display order, independent of id
  title: string;           // CURRENT
  description: string;     // CURRENT
  objective: string;       // CURRENT
  estimatedDuration?: string; // NEW — proposed; no current UI reads this yet

  // ---- Learning ----
  concepts: string[];      // CURRENT — short tags, shown only in AI Help breadcrumb
  keyConcepts: string[];   // CURRENT — bullet statements, shown in Learn panel
  examples: string[];      // CURRENT — snippet bullets, shown in Learn panel

  // ---- Video ----
  video?: {                // NEW — see §9. Not implemented; no current UI consumer.
    youtubeUrl: string;
    title: string;
    durationSeconds?: number;
  };

  // ---- Video Check ----
  videoCheckpoint: {       // CURRENT
    question: string;
    options: string[];
    correctIndex: number;
  };

  // ---- Practice ----
  practice: {               // CURRENT
    task: string;
    starterCode: string;
    checklist: { label: string; passed: boolean }[]; // static self-review list, not a grader
    language: string;
  };

  // ---- AI Help ----
  aiHelp: {                 // CURRENT
    quickPrompts: string[];
    replies: Record<string, string>;  // keyed by exact prompt text
    defaultReply: string;
  };

  // ---- Exercise ----
  exercise: {                // CURRENT
    objective: string;
    requirements: string[];
    starterCode?: string;    // optional — auto-populated into the editor when present
    language: string;
  };

  // ---- Session Settings ----
  requiredActivities: ("learning" | "videoCheck" | "practice" | "exercise")[]; // CURRENT
  projectConnection?: string; // CURRENT
  delivery?: {                 // CURRENT, but a separate scheduling concern — see §23
    format: "recorded" | "live";
    scheduledAt?: string;
    durationMinutes?: number;
  };
}
```

This is the exact contract a future importer/validator will check authored content against.

---

## 8. Practice vs. Exercise

These are deliberately different experiences. The authoring structure must not blur them.

| | **Practice** | **Exercise** |
|---|---|---|
| Purpose | Learn by trying | Apply independently |
| Guidance | Higher (task is scaffolded, hints available) | Lower (objective + requirements only) |
| Starter Code | Common — shown as a copy-paste reference (current embed doesn't auto-load it) | Optional — auto-loaded into the editor when provided |
| Self-Check | Yes — static reference checklist | No |
| Submission | No — nothing is saved | Yes — every submit is captured and stored as a new attempt |
| Formal Evaluation | No | **Future** — not built in this task or this MVP |

Both use the same underlying OneCompiler embed integration (already implemented), configured differently: Practice never requests code-change events back from the editor; Exercise does, specifically so it can capture what the student wrote.

---

## 9. Video Handling

**MVP CONTENT DESIGN — finalized decision, not implemented.**

**Current implementation:** there is no video field of any kind in `SessionContent`. The Learn panel's "video" is a mocked timer with a play button — no file, no URL, no player.

**Finalized decision:** the Content Team provides a **private/unlisted YouTube video** per session. This is deliberately the operationally simplest option for the MVP:

- **No NextStep²-hosted video infrastructure.** No upload pipeline, no transcoding, no CDN, no storage system. YouTube hosts the file; NextStep² only stores a reference to it.
- **Video source/reference** (what gets authored and stored): `youtubeUrl`, `title`, optionally `durationSeconds`.
- **Video metadata is not the same as learning content.** The video reference lives in its own `video` block (§7); it is not part of `keyConcepts`/`examples`/`objective`, which remain independent, text-based learning material the student sees regardless of whether they watch the video.
- **"Private/unlisted"** means the video is reachable by anyone with the exact YouTube link, but is not publicly discoverable/searchable on YouTube — an operationally simple access model that requires no NextStep²-side authentication to enforce, appropriate for an MVP.

**Content Manager review responsibilities for video** (part of §12/§17, not new tooling):
- Video exists and the link actually opens.
- Video belongs to the correct Session (right topic, right content).
- Video is suitable for students (appropriate content, no unrelated material).
- Video quality is acceptable (audio/video clarity).

**Explicitly not part of this task:** building a video player, a video hosting system, DRM, or any infrastructure beyond storing a YouTube reference.

---

## 10. AI Help Content Requirements

**Current implementation, prototype-level, not a general AI system.** AI Help is entirely **content-driven**, not a live AI integration:

- A fixed list of `quickPrompts` (buttons).
- A `replies` map, keyed by **exact prompt text** — the student clicking a quick prompt (or typing that exact string) gets that specific canned reply.
- One `defaultReply` shown for literally everything else the student types.
- Short `concepts` tags, shown as breadcrumb context inside the AI Help panel (distinct from `keyConcepts`, which is longer and shown in the Learn panel).

**What the Content Team provides:** the quick prompts, a reply for each one, one default reply, and the concept tags — i.e., exactly the fields above. That's the entire AI Help authoring surface for the MVP.

**What this document deliberately does not do:** design a prompt-engineering framework, a prompt library/versioning system, or any kind of AI-management CMS. The current mechanism is closer to a small FAQ than an AI system, and the authoring structure matches that reality rather than a more sophisticated one that doesn't exist yet. A real AI Tutor architecture (if built later) is out of scope — see §23.

---

## 11. Content Team Responsibilities

The Content Team may be outsourced, hired, or internal — the workflow is identical either way.

- NextStep² provides the authoring structure (this document, §14).
- The Content Team prepares content **outside the LMS**, using the human-readable template.
- The Content Team delivers a complete **Content Package** (§13) containing everything needed to render one or more full Sessions.
- The Content Team does **not** need direct access to the Student LMS for the MVP.
- The Content Package must be self-contained — every field required to render a Session must be present in the package, not assumed to exist elsewhere.

---

## 12. Content Manager Responsibilities

**The Content Manager is not primarily an authoring tool — it is the quality gate.** Its job is to make sure nothing reaches a student that hasn't been reviewed against the real student experience.

Review areas, per session:
1. Course / Subject / Session structure and identifiers
2. Learning content (objective, key concepts, examples)
3. Video (exists, opens, correct session, appropriate, acceptable quality)
4. Video Check (relevant, correct, unambiguous)
5. Practice (clear instructions, correct language, starter code runs, Self-Check items make sense as *self*-review, not phrased as automatic grading)
6. AI Help (quick prompts have matching replies, default reply exists)
7. Exercise (clear objective/requirements, correct language, starter code — if present — runs)

**The final review must be based on what the student will actually see** — ideally a live preview of the real Session Workspace UI with the candidate content loaded, not a raw data/form view. (Building that preview is future work — see §22 — but the *requirement* that review reflects the real UI is decided now.)

---

## 13. Content Package Structure

**MVP CONTENT DESIGN.** Must support multiple courses from day one — the package format is not allowed to assume "exactly one course," even though the first real course is "AI Full-Stack Development."

```
content-package/
├── package-manifest.json         # package version, contents index, submitted-by info
├── courses/
│   └── <course-id>/
│       ├── course.json           # { id, title, description }
│       └── subjects/
│           └── <subject-id>/
│               ├── subject.json  # { id, courseId, title, description, subtitle, order }
│               └── sessions/
│                   └── <session-id>/
│                       ├── session.json  # { id, subjectId, title, description, order }
│                       └── content.json  # the full Session Content Contract (§7)
├── assets/
│   └── <session-id>/
│       └── ...                   # starter files, images, documents — see §14
└── metadata/
    └── content-team.json         # who prepared this, when, package notes
```

- `<course-id>` / `<subject-id>` / `<session-id>` are the **stable, permanent identifiers**, never derived from array position or file order.
- `order` fields (on subject and session) control display order independently of identity — reordering never changes an id, and never re-keys progress/performance/submissions tied to that id.
- The video field (§9) references an external YouTube URL — no video *file* lives in `assets/`.
- This structure is designed to be importable later without redesign; the importer itself is not built in this task.

---

## 14. Content Authoring Template (human-readable)

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
SESSION
================================================================
Session ID:                    (stable — never reuse/rename after publishing)
Session Title:
Objective:
Estimated Duration:            [PROPOSED FIELD — not yet read by the app; capture it anyway
                                 for future use, but do not expect it to appear anywhere today]
Order (position within the subject):

----------------------------------------------------------------
LEARNING
----------------------------------------------------------------
[Explain the session topic clearly. There is no fixed subsection template —
use whatever structure best teaches this specific topic. For a topic like
Async / Await, that might include: what the concept means, why it's used,
core building blocks, examples, and common mistakes. That's a SAMPLE
breakdown for this topic, not a mandatory structure for every session.]

Key Concepts:                  (bulleted statements — optional)
  -
Examples:                      (short code snippets or examples — optional)
  -
Concepts (tags):                (short keywords — used only for AI Help context)
  -

----------------------------------------------------------------
VIDEO
----------------------------------------------------------------
YouTube URL:                    (private/unlisted)
Video Title:
Duration:                       (optional)

----------------------------------------------------------------
VIDEO CHECK
----------------------------------------------------------------
Question:
Options:                        (2 or more)
  1.
  2.
  3.
Correct Answer:                 (which numbered option is correct)

----------------------------------------------------------------
PRACTICE
----------------------------------------------------------------
Objective/Task:
Instructions:
Language:                       (javascript / typescript / python / java / csharp / cpp / c / sql / html)
Starter Code:                   (shown as a copy-paste reference to the student)
Self-Check:                     (a checklist for the student to compare their OWN code
                                 against — write it as self-review guidance, never as
                                 if the system will grade it automatically)
  - [ ] Label 1
  - [ ] Label 2

----------------------------------------------------------------
AI HELP
----------------------------------------------------------------
Session Context:                (the concept tags/context AI Help shows the student)
Guidance:                       (quick prompts + a reply for each, plus one default reply)
  Quick Prompt: "..."   → Reply: "..."
  Quick Prompt: "..."   → Reply: "..."
  Default Reply: "..."

----------------------------------------------------------------
EXERCISE
----------------------------------------------------------------
Objective:
Instructions:
Requirements:                   (bulleted list)
  -
Language:
Starter Code:                   (optional — auto-loaded into the student's editor if provided)

----------------------------------------------------------------
SESSION SETTINGS
----------------------------------------------------------------
Required Activities:            (Learning / Video Check / Practice / Exercise — default: all four)
Project Connection (optional):
================================================================
```

Fields marked `[PROPOSED FIELD]` above do not exist in the running application today; they are captured now so the structure doesn't need to change shape again once they're implemented.

---

## 15. Required / Optional / Conditional Fields

| Field | Requirement | Basis |
|---|---|---|
| Session id, title, description, objective | Required | Always rendered; id is the permanent key |
| subjectId, order | Required (MVP design) | Needed for package structure and hierarchy; no in-app equivalent yet but mandatory for import to work at all |
| Key Concepts | Optional | UI only renders the section if non-empty |
| Examples | Optional | UI only renders the section if non-empty |
| Concepts (tags) | Optional | UI only renders the AI Help breadcrumb line if non-empty |
| Estimated Duration | Optional (proposed) | No current UI consumer — capture opportunistically |
| Video (`youtubeUrl`, `title`) | **Required for MVP going forward** once the Video field ships — every session should have one | New content requirement; not yet enforced anywhere since it doesn't exist in the app |
| Video Check (question/options/correct) | Required whenever the session includes Video Check (i.e. unless `requiredActivities` excludes it — currently only true for live-format sessions) | `requiredActivities` gates completion; the UI always renders some checkpoint for recorded sessions |
| Practice task | Required | Always rendered on the Practice tab |
| Practice language | Required | Drives which OneCompiler embed loads; wrong/missing value silently falls back to JavaScript |
| Practice starter code | Optional | Reference block only renders if present |
| Practice Self-Check list | Optional, but strongly recommended | Renders whatever exists, even `[]`, but an empty list gives the student nothing to self-review against |
| AI Help quick prompts / replies | Optional | Falls back entirely to `defaultReply` if empty |
| AI Help default reply | Required | Always needed as the catch-all |
| Exercise objective | Required | Always rendered |
| Exercise requirements | Optional (but should never realistically be empty) | Renders gracefully empty, but gives the student no target |
| Exercise language | Required | Same reasoning as Practice language |
| Exercise starter code | **Optional by design** | An exercise may legitimately start from a blank editor — the embed only auto-populates `if (starterCode)` |
| Required Activities | Optional, defaults to all four | Matches the only curated example in the app today |
| Project Connection | Optional | Renders only if present |
| Delivery (live sessions) | Conditional — only for the small number of live sessions | Separate scheduling concern, not lesson content — see §23 |

---

## 16. Content Quality Checklist

For the Content Team to complete before delivering a session:

```
SESSION: ____________________   SUBJECT: ____________________   COURSE: ____________________

□ Session id is final and will not change after this package is delivered
□ Session title/description/objective are clear and student-facing
□ Key Concepts and Examples are provided (or intentionally left empty)
□ YouTube video link is private/unlisted, opens correctly, and is the right video for this session
□ Video Check has a clear question, 2+ options, and exactly one marked correct
□ Practice objective/instructions are unambiguous
□ Practice language matches the actual language of the starter code
□ Practice starter code (if provided) is valid, runnable code
□ Practice Self-Check items are phrased as self-review guidance, not automatic grading
□ AI Help has a default reply; every quick prompt has a matching reply
□ Exercise objective is clear
□ Exercise requirements are specific enough for a student to self-assess against
□ Exercise language is set; starter code (if provided) is valid and runnable, or intentionally blank
□ Required Activities is set (or left at the default: all four)
□ Project Connection (if included) genuinely relates to this session's skill
□ Course/Subject/Session identifiers don't collide with existing content (unless intentionally replacing it)
```

---

## 17. Review Workflow

**MVP CONTENT DESIGN — conceptual flow only, not implemented.**

```
Content Team prepares a content-package/
        ↓
IMPORT       — Content Manager brings the package into NextStep²
        ↓
VALIDATE     — every session's content.json is checked against §7's contract using §15's rules
        ↓
PREVIEW      — the content is rendered using the REAL student Session Workspace UI, so the
               Content Manager reviews exactly what a student would see — not a raw data form
        ↓
REVIEW       — Content Manager works through §12's review areas
        ↓
   ┌─────────┴─────────┐
   ↓                   ↓
CHANGES REQUESTED    APPROVE
   ↓                   ↓
Content Team        PUBLISH
updates package
   ↓
Re-import / update
   ↓
back to REVIEW
```

None of Import, Validate, Preview, Review, Approve, or Publish exist yet — this section defines the flow the future tooling must implement, not a working feature.

---

## 18. Publish Definition

**PUBLISH means:** the approved Session becomes available to students in the live LMS.

Students must **never** see:
- Draft content
- Imported-but-unreviewed content
- Content currently under review
- Content with outstanding "changes requested"
- Any unapproved content

**Only published content is student-visible.** This is a hard rule for the eventual implementation, decided now so the lifecycle (§19) and any future data model respects it from the start.

---

## 19. Content Lifecycle

```
DRAFT
  ↓
IN REVIEW
  ↓
   ├── CHANGES REQUESTED → (Content Team updates) → back to IN REVIEW
  ↓
APPROVED
  ↓
PUBLISHED
```

- **DRAFT** — package imported, not yet reviewed.
- **IN REVIEW** — Content Manager is actively reviewing.
- **CHANGES REQUESTED** — Content Manager sent it back with notes; Content Team updates and it returns to IN REVIEW.
- **APPROVED** — Content Manager has signed off, but it is not yet live.
- **PUBLISHED** — the only state a student can actually see, per §18.

This is intentionally a simple, linear MVP lifecycle — no parallel review branches, no multi-approver workflow, no versioning system beyond "the currently published version."

---

## 20. Sample Session — "Async / Await"

> **SAMPLE CONTENT — NOT PRODUCTION CONTENT.** This session does not exist in the application today. It illustrates exactly what the Content Team would prepare using the template in §14.

```
================================================================
COURSE
================================================================
Course Name: AI Full-Stack Development
Course ID:   ai-fullstack-development

================================================================
SUBJECT
================================================================
Subject Name: Backend Development
Subject ID:   backend-development
Order:        2

================================================================
SESSION
================================================================
Session ID:       async-await
Session Title:    Async / Await
Objective:        By the end of this session you'll be able to write
                   asynchronous JavaScript using async/await instead of
                   raw Promise chains, and understand why you'd choose to.
Estimated Duration: 25 minutes
Order:             4

----------------------------------------------------------------
LEARNING
----------------------------------------------------------------
[SAMPLE breakdown for this topic — not a mandatory structure]

What asynchronous programming means:
JavaScript runs on a single thread. Asynchronous code lets slow operations
(like network requests) happen in the background without freezing
everything else.

Why async/await is used:
Promise chains (.then().then().catch()) work, but get hard to read once
you have several steps. async/await lets you write asynchronous code that
reads top-to-bottom like normal, synchronous code.

async:
Marking a function `async` means it always returns a Promise, and lets you
use `await` inside it.

await:
`await` pauses execution of an async function until the Promise it's
given resolves — without blocking the rest of the browser.

Common mistakes:
Forgetting `await` (you get a Promise object instead of the resolved
value); using `await` outside an `async` function; not wrapping awaited
calls in try/catch for error handling.

Key Concepts:
  - `async` functions always return a Promise.
  - `await` pauses only that function, not the whole program.
  - Errors from an awaited call are caught with a normal try/catch block.

Examples:
  - Example: async function getUser() { const res = await fetch("/api/user"); return res.json(); }
  - Example: try { const data = await getUser(); } catch (err) { console.error(err); }

Concepts (tags):
  - async-await
  - promises
  - error-handling

----------------------------------------------------------------
VIDEO
----------------------------------------------------------------
YouTube URL:  https://youtu.be/EXAMPLE_UNLISTED_ID   (private/unlisted)
Video Title:  Async / Await Explained
Duration:     8:45

----------------------------------------------------------------
VIDEO CHECK
----------------------------------------------------------------
Question: What does the `await` keyword do?
Options:
  1. Pauses the current async function until the Promise resolves
  2. Stops the entire browser until the request finishes
  3. Converts a synchronous function into an async one
  4. Cancels a Promise
Correct Answer: 1

----------------------------------------------------------------
PRACTICE
----------------------------------------------------------------
Objective/Task:
Rewrite the given Promise-chain function to use async/await instead.

Instructions:
The starter code fetches a user and then their posts using .then().
Convert it to a single async function using await, with a try/catch
around the two calls.

Language: javascript

Starter Code:
function loadUserAndPosts(userId) {
  return fetch(`/api/users/${userId}`)
    .then((res) => res.json())
    .then((user) => fetch(`/api/users/${userId}/posts`)
      .then((res) => res.json())
      .then((posts) => ({ user, posts })));
}

Self-Check:
  - [x] Function is declared with `async`
  - [x] Both fetch calls use `await`
  - [x] A try/catch wraps the awaited calls
  - [ ] No `.then()` chains remain

----------------------------------------------------------------
AI HELP
----------------------------------------------------------------
Session Context: async-await, promises, error-handling

Guidance:
  Quick Prompt: "Explain this topic"
    → Reply: "async/await is just a cleaner way to write Promise-based
      code — `await` pauses an async function until a Promise settles,
      so the rest of your code reads top-to-bottom instead of nesting
      in .then() callbacks."
  Quick Prompt: "Give me an example"
    → Reply: "const data = await fetch('/api/data').then(r => r.json());
      — read this as \"wait for the fetch, then wait for the JSON, then
      continue.\""
  Quick Prompt: "Give me a hint"
    → Reply: "Every `await` must be inside a function marked `async`.
      If you see a syntax error near `await`, check that first."
  Default Reply: "Good question — try asking about async, await, or
    error handling with try/catch, and I'll do my best to help."

----------------------------------------------------------------
EXERCISE
----------------------------------------------------------------
Objective:
Independently write an async function with proper error handling.

Instructions:
Write a function `getWeather(city)` that fetches weather data for a city
from a (mock) endpoint and returns the parsed result, handling failures
gracefully.

Requirements:
  - Function is declared `async`
  - Uses `await` for the fetch call
  - Wraps the awaited call in try/catch
  - On failure, returns `null` instead of throwing
  - On success, returns the parsed JSON response

Language: javascript
Starter Code: (intentionally omitted — student starts from a blank editor)

----------------------------------------------------------------
SESSION SETTINGS
----------------------------------------------------------------
Required Activities: learning, videoCheck, practice, exercise
Project Connection:
This is the same async/await pattern you'll use when your full-stack
project's frontend calls its backend API.
================================================================
```

---

## 21. Authored Content vs. Student-Generated Data

These must never be mixed into the same data model.

**Content Team authors:**
- Course, Subject, Session (identity + metadata)
- Learning (objective, key concepts, examples)
- Video (YouTube reference + title)
- Video Check (question, options, correct answer)
- Practice (task, language, starter code, Self-Check list)
- AI Help (quick prompts, replies, default reply, concept tags)
- Exercise (objective, requirements, language, starter code)

**Student generates (at runtime, never authored):**
- Completion status and progress percentages
- Performance scores
- Exercise submissions and attempt numbers
- Portfolio / project data

The current implementation already respects this separation structurally — `sessionContent.ts` (authored) versus `progress.tsx` / `performance.ts` / `exerciseSubmissions.ts` (student-generated) are entirely separate files with no shared storage keys. The MVP content design continues that separation rather than introducing any exception to it.

---

## 22. MVP Scope

The full Content MVP consists of seven pieces:

1. Content Authoring Structure — **this document.**
2. Content Package (format) — defined in §13, not implemented.
3. Import — not implemented.
4. Validation — not implemented (rules defined in §15).
5. Review (including a real-UI Preview) — not implemented (flow defined in §17).
6. Approval — not implemented (lifecycle defined in §19).
7. Publish — not implemented (definition in §18).

**This document finalizes only item 1.** Items 2–7 are specified conceptually so they can be built consistently later, but none of them are built now.

---

## 23. Future Items Intentionally Deferred

- **Content Manager UI, Import screen, Validation engine, Preview renderer, Review/Approval workflow UI, Publish pipeline** — all conceptually defined above, none implemented.
- **A real AI Tutor architecture.** Today's AI Help is a small, content-authored FAQ-style mechanism (exact-match prompts → canned replies). A genuinely conversational or generative AI Help experience is a distinct, future architectural decision, not something this document designs.
- **Automated Exercise/Practice evaluation.** Neither Practice's Self-Check nor Exercise submissions are graded today. Requirements (§7 `exercise.requirements`) are written clearly enough that a future evaluator could plausibly be built around them, but building that evaluator is explicitly out of scope here.
- **Personalized "what you did well / what to improve" feedback** on the session completion screen — currently two hardcoded generic sentences, not content-authored. Whether this becomes authored content or AI-generated per-submission feedback is an open product decision, not resolved here.
- **Delivery/scheduling for live sessions** — an existing, separate feature (`SessionContent.delivery`) for the small number of sessions run live rather than recorded. It's part of the technical contract (§7) since the current implementation includes it, but it's a scheduling/operations concern, not lesson content, and whether the Content Team or a separate Ops role owns it is unresolved.
- **Multi-course support in the student-facing app** (course selection, enrollment across courses, cross-course navigation). Only the *content structure* has been made multi-course-ready in this document — the actual student app still assumes one course today, and changing that is a separate, larger task.
- **Asset hosting beyond a YouTube reference** — no NextStep²-hosted video/image/file infrastructure is being built. If a future need arises for hosted images or downloadable resources beyond starter code, that's a new decision, not something this document pre-builds.

---

## 24. Open Technical Questions

1. **Video field enforcement.** Should every published session be *required* to have a video, or can some sessions ship text-only? §15 currently marks it "required going forward," but this hasn't been enforced anywhere technically and should be confirmed before validation rules are built.
2. **Required Activities granularity.** Should the Content Team ever be able to mark, say, "no Exercise for this session," or should all four activities always be required except for the existing live-session exception? Not decided.
3. **Duration field usage.** `estimatedDuration` is captured in the template (§14) with no current UI to show it. Confirm whether it should be surfaced in the Student Session UI (a scope change to the Student Flow, not part of this task) or kept purely for internal/Content Manager planning purposes.
4. **Versioning on re-publish.** The lifecycle (§19) doesn't yet define what happens to a session that's already published when new content for it goes through Draft → Review again — does publishing instantly replace the live version, or is there a staged rollout? Not decided; needs a product decision before Import/Publish is built.
5. **Cross-session identifier collisions.** Session `id` must be globally unique across the whole course (today, and likely across all courses once multi-course exists). The exact collision-detection/handling rule for the future Validate step isn't defined yet.
6. **Video privacy verification.** "Private/unlisted YouTube" relies on the Content Team correctly setting that visibility on YouTube's side — NextStep² has no technical way to enforce or verify this from the video URL alone. Whether the Content Manager's review step needs an explicit manual check for this (beyond "does it open") is worth confirming.
