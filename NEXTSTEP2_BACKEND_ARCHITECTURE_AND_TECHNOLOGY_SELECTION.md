# NextStep² Backend Architecture & Technology Selection

**Status:** Architecture / technology-selection document only. No backend code, database, migration, API route, or dependency was created or installed to produce this document. No frontend application code was modified.

**Built on, and does not re-decide:**
- `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` — frozen entity model, versioning invariant, ownership rules. This document maps that model onto real tables/technology; it does not reopen any decision already frozen there.
- `NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md` — the exact, verified inventory of what the current frontend reads/writes/derives today, including every finding, contradiction, and open decision. This document treats that audit as ground truth for "what exists now."
- `NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md` and `NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md` — the frozen authoring UX and document-first content pipeline. Both predate the Content Author/Content Reviewer role split and predate the Practice Self-Check removal; both supersessions are noted explicitly wherever relevant, not silently ignored.
- `NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md` — the frozen video checkpoint design (§A–M) and its two completed implementation slices.
- The actual current `app/src` code, re-verified directly while writing this document, as the single source of truth for "what the frontend currently does."

**What this document is not:** it does not implement anything. Every table, endpoint, and technology named below is a decision *to build*, not a thing that now exists.

---

## How frozen documents are reconciled here

Two real supersessions exist between the older authoring-workflow documents and the current, actually-implemented frontend. Both are stated once, here, rather than causing confusion later:

1. **Role split.** Both `NEXTSTEP2_CONTENT_TEAM_AUTHORING_WORKFLOW.md` and `NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md` were written when "Content Team" and "Content Manager" were one account/role. The current frontend has since split this into two separate roles, logins, and route namespaces — **Content Author** (`/content/*`) and **Content Reviewer** (`/review/*`) — exactly the "harder author-vs-reviewer permission split" both documents flagged as a **Future** item. That future item has already happened at the frontend layer. This document designs the backend's auth model around **four** roles (`student`, `admin`, `content_author`, `content_reviewer`), not three.
2. **Practice Self-Check removed.** Both authoring documents describe an authored Self-Check checklist as part of Practice. A later cleanup pass (`NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md`'s findings, acted on directly) removed Self-Check completely — from DOCX extraction, the authoring draft, the package conversion, and `SessionContent` — because it was authored, persisted, and converted end-to-end but never shown to students and never scored. Practice today is exactly `{task, starterCode, language}`. This document's database mapping (Part 3) reflects that current reality, not the older documents' Self-Check field.

Everything else in both authoring documents — the document-first pipeline, the 8-section field contract, Exercise's Edge-Cases-stays-separate resolution, the strict-template-parsing decision, the versioning/review mechanism — is unchanged and is treated as still frozen.

One further, smaller gap worth naming up front because Part 6/7 depend on it: the authoring workflow documents describe a "pause the video preview and click Add Checkpoint Here to capture `getCurrentTime()`" authoring interaction. **This was never built.** The current authoring UI (`ContentSessionAuthoring.tsx`'s `CheckpointCard`) only offers manual `mm:ss` text entry. This document does not redesign authoring UX (out of scope, per instructions) — it's noted here only because Part 7 must be precise about what the backend can and cannot assume was captured accurately.

---

# PART 1 — Current System Baseline

Restated compactly from the audit, oriented toward what a backend needs to replace. No redesign proposed in this part.

| Area | Current implementation (unchanged, no redesign) | Current storage |
|---|---|---|
| **Student** | No real auth at all — `Login.tsx` validates a form and navigates, creating no session | none |
| **Admin** | Mock account via `localStorage["nextstep2:adminAccount"]`, gated by `useRequireAdminAccount()`; every page read-only | `nextstep2:adminAccount` |
| **Content Author** | Mock account via `localStorage["nextstep2:contentAuthorAccount"]`, gated by `useRequireContentAuthorAccount()`; creates/edits/submits sessions, never approves/publishes | `nextstep2:contentAuthorAccount` |
| **Content Reviewer** | Mock account via `localStorage["nextstep2:contentReviewerAccount"]`, gated by `useRequireContentReviewerAccount()`; reviews/requests changes/approves/publishes, never edits source content | `nextstep2:contentReviewerAccount` |
| **Course** | One hardcoded object (`COURSE` in `mock.ts`) | compiled into the app |
| **Subject** | Six hardcoded subjects (`SUBJECTS_BASE`) | compiled into the app |
| **Session** | Curated sessions for one subject, generated 4-per-subject placeholders elsewhere; a Content Author's "Add Session" mints a new id via `slugifyTitle()`, no uniqueness check | compiled into the app; new ids only ever appear inside a package record |
| **Content authoring** | `ContentSessionAuthoring.tsx` + `authoredSession.ts` — an `AuthoredSessionDraft` per session, saved via `saveDraft()` into the same `ContentPackageRecord` shape ZIP-era imports used | `nextstep2:contentPackages`, one flat array |
| **Content review** | `ContentPackageDetail.tsx` (`role="reviewer"`) — editable checklist/notes, Request Changes / Approve / Publish; a single mutable `review` object per package, **not** append-only | same key |
| **Content publishing** | `saveReview("published")` sets `status: "published"` on one record; "current content for a session" is resolved by `getPublishedSessionContent()` — a full-table scan picking the most-recently-touched published record per `(course, subject, session)` key | same key |
| **Student progress** | `ProgressProvider`/`useCourseData()` — a `Set<string>` of completed session ids, first-completion-wins | `nextstep2:completedSessionIds` |
| **Practice** | `{task, starterCode, language}` only — Self-Check removed; "completed" = student opened the tab; contributes no score | inside the resolved `SessionContent` |
| **Video** | `{youtubeUrl, title}`; real YouTube IFrame Player API playback (`youtubePlayer.ts`) when present; original mock/simulated timer when absent | inside `SessionContent`/`ContentSessionContent` |
| **Video checkpoints** | `VideoCheckpoint[]` — `{id, timestampSeconds, question, options[], correctIndex, feedback, required}`; real sequential playback, required-checkpoint forced rewind, resolved-id set preventing retrigger (`useVideoCheckpoints.ts`) | same |
| **Exercise** | `{objective, requirements[], starterCode?, language, scenario?, expectedBehaviour?, evaluationCriteria?[], edgeCases?[], submissionInstructions?}` — all 8 authored fields now survive the full pipeline to `SessionContent` (fixed in the data-contract cleanup pass) | same |
| **Exercise submissions** | `ExerciseSubmission {id, studentId, sessionId, exerciseId, language, files[], submittedAt, attemptNumber}` — every attempt retained, `attemptNumber` client-counted, `exerciseId` currently equals `sessionId` (borrowed, not a real id) | `nextstep2:exerciseSubmissions` |
| **Performance** | `SessionActivitiesInput {learning:{completed}, videoCheck:{completed,correct}, practice:{completed}, exercise:{completed}}`; `calculateSessionScore()` scores only Video Check; one record per session, overwrite-on-redo; the Complete screen and the persisted record now call the identical function (unified in the cleanup pass) | `nextstep2:performanceRecords` |
| **Portfolio** | `{profile, skills, projects, links}`, full-document overwrite | `nextstep2:portfolio` |

Full field-by-field detail, every `localStorage` key, every synthetic id, and every currently-unenforced business rule is already documented in the audit and is not repeated exhaustively here — Part 2 onward builds directly on it.

---

# PART 2 — Backend Responsibilities

## MUST be server-side

| Responsibility | Why it cannot stay client-trusted |
|---|---|
| **Authentication for all four roles** | Today there is no real authentication at all — see the audit's cross-cutting finding. This is the single largest gap. |
| **Authorization on every write** | Content Author cannot approve/publish; Content Reviewer cannot edit source content; Admin cannot write anything; a student can only touch their own records. Today every one of these is a UI affordance, not an enforced rule. |
| **Published-content resolution** | "What is currently live for this session" must be a single indexed fact (`Publication` with `supersededAt IS NULL`), not a client-side recency scan over every record on every read. |
| **Content status state machine** | `draft → changes_requested/approved → published` transitions, and specifically that Approve requires a complete checklist and Publish requires prior Approval, must be enforced at the data layer — today both are enforced only by which button happens to render. |
| **Version supersession** | Setting the previous live `Publication`'s `supersededAt` and creating the new one must be one atomic transaction. A backend that let these drift apart would recreate the exact ambiguity the audit already found. |
| **Ownership derivation** | `studentId` on every student write, and `authoredByUserId` on every authored write, must come from the authenticated session — never a client-supplied value (today: `STUDENT.name` passed as a plain parameter everywhere). |
| **Attempt numbering** | `ExerciseSubmission.attemptNumber` must be assigned by the server inside the same transaction as the insert, not computed by the client counting its own prior records. |
| **Session/subject/course id uniqueness** | Nothing today prevents two independently-authored sessions colliding on the same `slugifyTitle()` id. The server must guarantee uniqueness (unique constraint, collision handling). |
| **Score computation** | The server must independently recompute `videoCheck.correct` (and any future scoreable activity) from the *raw answers submitted* against the *authored correct answer it holds* — never accept a client-reported "correct: true" or a client-reported aggregate score as authoritative. This is the direct backend counterpart of Part 7's checkpoint-answer verification below. |
| **DOCX validation and parsing** | The authoritative parse must run against the bytes the server actually received, not a client-computed JSON payload the server merely stores. A client could otherwise submit fabricated "already extracted" content with no real document behind it — see Part 6. |
| **Upload validation** | File type/size limits must be re-checked server-side; client-side checks are a UX convenience only, never a security boundary. |
| **Draft/Approved/Changes-Requested isolation from students** | A student-scoped API token must be structurally unable to fetch anything but `Publication`-resolved current content — not merely "the client happens not to ask." |

## SHOULD be server-side

| Responsibility | Reasoning |
|---|---|
| **Append-only review history** (`ContentReview`) | Already a frozen domain-model decision (§8) not yet implemented anywhere. Enforcing insert-only at the schema/service layer is what actually delivers the "why was this rejected, even after later approval" guarantee. |
| **Audit logging** (`AuditEvent`) | Domain model already classifies this SHOULD HAVE, not MUST HAVE, for MVP — every activity Admin needs today is reconstructible from the core entities once actor fields exist on `ContentReview`/`Publication`. Worth adding the moment something needs logging that isn't naturally a domain entity (login attempts, an Admin viewing a student's detail page). |
| **Original DOCX retention** | Domain model §17: SHOULD HAVE, not MUST HAVE. Cheap with object storage (Part 13); do it from day one if it doesn't slow down the MVP. |
| **Rate limiting** | Not currently a concern (no server exists), but any real login/upload endpoint needs it before it's internet-facing. |
| **Server-side aggregation for Admin dashboards** | Today's client-side full-table scan-and-reduce is fine at prototype scale and does not need to be rebuilt on day one; it should move server-side before real multi-student/multi-course data volume makes it slow. |

## MAY remain client-side

| Responsibility | Reasoning |
|---|---|
| Ephemeral UI state (active authoring section, AI-chat transcript, mock video state machine, drag-over flags, unsaved checklist state) | Never persisted today, never should be. |
| Section-completion indicators (`computeSectionState`) | A pure UI convenience. The server's own "can this be submitted for review" check (mandatory sections complete) must exist independently and is authoritative — the client-side indicator is allowed to disagree transiently (e.g., a stale client) without being a security problem, precisely because the server re-validates before accepting Submit for Review. |
| YouTube playback mechanics (polling, checkpoint-crossing detection, pause/seek handling) | Inherently a browser/third-party-embed concern — see Part 7 for exactly what still gets verified server-side underneath it. |
| OneCompiler embed/`postMessage` handling | Inherently a browser-side third-party-embed concern. |
| Presentation-only formatting (`formatDate`, `formatTimestamp`, etc.) | No security or correctness implication. |

---

# PART 3 — Domain → Database Mapping

**Ground rule, stated once:** a table is created only where the frozen domain model already calls for one, or where a genuine new need is identified and explained below — never automatically per TypeScript interface. Assumes PostgreSQL (justified in Part 12) — every "table" below is a Postgres table; JSON-shaped fields use `jsonb` or native array columns as noted.

## Tables that map directly from the frozen domain model (§18 there) — unchanged reasoning, restated as tables

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id, email (unique), password_hash, role (enum: student/admin/content_author/content_reviewer), status, name, created_at, updated_at` | One table, one `role` column — the domain model's own §1 reasoning, extended from 3 roles to 4 (see the reconciliation note above). |
| `enrollments` | `id, student_id → users, course_id → courses, status, enrolled_at` | Unique `(student_id, course_id)`. |
| `courses` | `id, title, description` | Platform-owned; written only as a side effect of publishing (§3 there). |
| `subjects` | `id, course_id → courses, title, description, order` | Same ownership rule. |
| `sessions` | `id, subject_id → subjects, title, description, order` | Same ownership rule. Display fields reflect "as of last publish" — see Part 4 for exactly how that's enforced, which the domain model named but the current frontend does not yet implement. |
| `content_versions` | `id, session_id → sessions, package_id → content_packages, objective, concepts (text[]), key_concepts (text[]), examples (text[]), video (jsonb), checkpoints_included (bool), practice (jsonb), ai_help (jsonb), required_activities (text[]), project_connection, delivery (jsonb), created_at` | Structured sub-fields stay JSON exactly per the domain model §5 — nothing here is queried, filtered, or joined independently of the whole `ContentVersion` it belongs to. `practice` is now just `{task, starter_code, language}` (Self-Check removed, see the reconciliation note). |
| `content_packages` | `id, file_name, imported_at, imported_by_user_id → users, status (enum), validation (jsonb), review (jsonb, legacy/decorative — see Part 4), original_document_ref` | `original_document_ref` is the SHOULD-HAVE object-storage pointer (Part 6/13), nullable. |
| `content_reviews` | `id, package_id → content_packages, reviewer_user_id → users, action (enum: request_changes/approve), checklist (jsonb snapshot), notes, created_at` | Append-only — insert-only at the service layer (Part 4). |
| `publications` | `id, content_version_id → content_versions, session_id → sessions (denormalized), published_by_user_id → users, published_at, superseded_at (nullable)` | **Partial unique index:** `UNIQUE (session_id) WHERE superseded_at IS NULL` — this single constraint is what makes "at most one live version per session" a database-enforced fact, not a convention. |
| `session_completions` | `id, student_id → users, session_id → sessions, completed_at` | Unique `(student_id, session_id)`. Insert-ignore-on-conflict — preserves the frontend's exact first-write-wins semantics. |
| `session_performance` | `id, student_id → users, session_id → sessions, activities (jsonb), score (int, nullable), recorded_at` | Unique `(student_id, session_id)`, upsert on conflict — preserves the frontend's exact overwrite-on-redo semantics. `activities` stays JSON (matches `SessionActivitiesInput` exactly, no independent query need). |
| `exercises` | `id, content_version_id → content_versions, objective, scenario, requirements (text[]), expected_behaviour, evaluation_criteria (text[]), edge_cases (text[]), submission_instructions, starter_code, language` | See below — promoted to its own table for the same reason the domain model already gave, now applying to **every** authored Exercise field, not just the ones that survived before the cleanup pass. |
| `exercise_submissions` | `id, student_id → users, session_id → sessions, exercise_id → exercises, language, files (jsonb array of {name, content}), attempt_number, submitted_at` | Unique `(student_id, session_id, attempt_number)` — prevents a race from assigning the same attempt number twice (Part 2). |
| `portfolios` | `student_id → users (PK, 1:1), headline, bio, skills (jsonb)` | Skills stays a structured field, not normalized — domain model §13, unchanged; no current consumer queries across students by skill. |
| `portfolio_projects` | `id, portfolio_id → portfolios, title, description, technologies (text[]), project_url, github_url` | Real child entity — already has real identity in the prototype. |

## New tables this document adds, beyond the original domain model — each justified individually

**`video_checkpoints`** — `id, content_version_id → content_versions, timestamp_seconds, question, options (text[]), correct_index, feedback, required (bool)`.

*Why a real table, when the domain model kept `videoCheckpoint` as a JSON field:* the domain model was written when a session had **one** singular checkpoint object with no independent identity worth preserving. The Video Checkpoint System (§A, both implementation slices) changed this to an **array** of checkpoints, each with a stable `id` that is independently referenced — a student's answer to checkpoint 3 must be distinguishable from their answer to checkpoint 1, and a future "which checkpoints do students get wrong most often" report needs to group by checkpoint identity across many students and sessions. This is the *exact same reasoning* the domain model already applied to `Exercise` ("its id is currently borrowed from `sessionId`, which is unsafe... a small, real entity, not an inline blob"), now extended to `VideoCheckpoint` for the identical reason. It is not a general "normalize every array" policy — `concepts[]`, `examples[]`, `requirements[]` etc. stay as plain array/JSON columns precisely because nothing ever needs to reference one of *those* items independently.

**`video_checkpoint_answers`** — `id, student_id → users, checkpoint_id → video_checkpoints, session_id → sessions (denormalized, for a direct per-session index), selected_index, correct (bool, server-computed — see Part 7), answered_at`.

*Why this exists:* today, "did the student answer every required checkpoint, and were they right" is computed entirely client-side and handed to `recordSessionPerformance()` as an already-reduced boolean pair (`videoCheck.completed`, `videoCheck.correct`). Part 2 already establishes that scoring must be server-verified. That requires the server to hold the *raw, per-checkpoint answer*, not just the client's summary of it — this table is that raw record. `SessionPerformance.activities.videoCheck` becomes a value the server *derives* from querying this table at completion time, not a value the client asserts.

## Entities the task asked to evaluate, and explicitly NOT promoted to their own table

| Candidate | Decision | Why |
|---|---|---|
| **`StudentProfile`** | **Rejected**, per the domain model §1 (unchanged). Every field a student currently has (`STUDENT.name`) is already on `users`. Add a 1:1 profile table the moment a real field (avatar, bio, phone) actually appears — not speculatively now. |
| **`Role`** (as its own join table) | **Rejected**, per the domain model §1 (unchanged). A flat `role` enum column on `users` covers every current need — no user ever needs more than one role at once, no dynamic/custom-role capability exists or is requested anywhere in the current app. If NextStep² ever needs data-driven, per-permission roles (not just four fixed ones), that's a real future migration, not a speculative table today. |
| **`SessionProgress`** (as distinct from `SessionCompletion`) | **Rejected** — the current frontend has exactly one progress fact per session (completed or not); percentage progress is always derived at read time from counting completions, never stored. `session_completions` already is this. |
| **`Performance`** (as a name, separate from `SessionPerformance`) | Already covered — `session_performance` above is the one and only performance table; course/subject aggregates stay derived reads (see the domain model's "Derived read models" table, unchanged). |

---

# PART 4 — Content Versioning

## The exact backend representation

```
content_packages          -- one row per import/authoring event, its own workflow status
  id, status, review (legacy/decorative — see below), ...

content_versions          -- one row per authored snapshot of one session's content
  id, session_id, package_id, ...
  (immutable once created — never UPDATEd; a revision is always a new row)

exercises                 -- 0..1 per content_version
content_reviews           -- append-only: one INSERT per review action, never an UPDATE
  id, package_id, reviewer_user_id, action, checklist, notes, created_at

publications              -- the fact that a content_version is (or was) live for a session
  id, content_version_id, session_id, published_by_user_id, published_at, superseded_at
```

- **Immutable published content:** enforced by never issuing an `UPDATE` against `content_versions` after creation — the service layer simply has no "edit content_version" operation, only "create a new draft" (which is a new `content_packages` + `content_versions` row from the start).
- **New version creation:** identical to the already-implemented frontend rule (`findResumableAuthoredPackage()`'s "only resume draft/changes_requested" behavior) — a session with a `published` or `approved` current record always gets a brand-new `content_packages` row when a Content Author opens it again. The backend makes this a real guarantee (no endpoint exists to mutate a published/approved package's content) rather than a client-side lookup convention.
- **Previous published version stays live until the replacement publishes:** guaranteed by the transaction described below — there is no window where a session has zero live rows or two live rows.
- **Append-only review history:** `content_reviews` has no `UPDATE`/`DELETE` operation exposed anywhere — only `INSERT`. `content_packages.status` remains the single current-status field (matches the domain model §8 exactly); `content_reviews` is the full "why did we get here" trail behind it.
- **Deterministic published-version resolution:** always `SELECT ... FROM publications WHERE session_id = $1 AND superseded_at IS NULL` joined to `content_versions` — one indexed row, never a scan or a sort.
- **Author/resolver separation:** `content_packages.imported_by_user_id` must carry a `role = content_author` user; every write to `content_reviews`/`publications` must carry a `role = content_reviewer` user; the service layer rejects a mismatch regardless of what any client sends.

## The publish transaction, explicitly

```sql
BEGIN;
  UPDATE publications
     SET superseded_at = now()
   WHERE session_id = :session_id AND superseded_at IS NULL;

  INSERT INTO publications (content_version_id, session_id, published_by_user_id, published_at)
       VALUES (:content_version_id, :session_id, :reviewer_id, now());

  UPDATE content_packages SET status = 'published' WHERE id = :package_id;

  UPDATE sessions SET title = :title, description = :description, "order" = :order
   WHERE id = :session_id;  -- "as of last publish" rule, see below
COMMIT;
```

The partial unique index (`UNIQUE(session_id) WHERE superseded_at IS NULL`, Part 3) makes it structurally impossible for this transaction to ever leave two live rows for one session, even under concurrent publish attempts — the second one fails the constraint and must retry, rather than silently corrupting the "one live version" invariant.

## Addressing the current frontend limitation directly

**The task's framing — "an old published package remains marked published" — is precise, but the *fix* is not to change that marking.** `content_packages.status = 'published'` for a superseded package is not a bug to erase; it is a true historical fact ("this package really was published, on this date, by this reviewer"). Retroactively flipping it to some other status would destroy real audit history for no benefit.

**The actual current gap is that nothing else exists to answer "but is it still live."** Today's frontend conflates two different questions — "did this package ever complete its workflow" (a fact about the package, permanent) and "is this the content students currently see" (a fact about the *session*, which changes over time) — into one field. The recommended fix, already implicit in the domain model and made explicit here: **`content_packages.status` answers only the first question, forever; `publications.superseded_at IS NULL` answers only the second, and is the *only* thing any student-facing or "what's currently live" query is ever allowed to consult.** No code path may derive "current" from package status, recency-sorting, or any per-package field, ever — only from `publications`.

**"As of last publish" for `sessions.title`/`description`/`order`:** the publish transaction above updates the canonical `sessions` row's display fields in the same transaction that flips the live `Publication`. This is what the domain model's §3 rule ("draft/review changes never touch these tables until Publish") requires and what the audit found the current frontend does not actually implement (a Content Author's own session-listing view can reflect an in-review draft's title before publish, even though the real Student route never leaks it). The backend closes this gap structurally: there is no write path to `sessions.title`/`description`/`order` other than this one transaction.

---

# PART 5 — Author → Reviewer → Student Flow

```
Content Author (role=content_author)
  │
  ├─ POST /content/sessions/:sessionId/drafts               [create draft]  — 201, owns the new content_packages row
  │     authz: must be content_author; sessionId may be new or existing
  │
  ├─ PATCH /content/drafts/:packageId                        [save]         — 200
  │     authz: content_author AND imported_by_user_id = self
  │            AND status IN (draft, changes_requested)   -- never approved/published
  │
  ├─ POST /content/drafts/:packageId/submit                  [submit]       — 200, status -> draft (already "awaiting review")
  │     authz: same as save, PLUS server re-validates every mandatory section
  │            server-side (never trusts the client's own completeness check)
  │
  ▼
Content Reviewer (role=content_reviewer)
  │
  ├─ GET  /review/queue?status=draft                         [read]         — authz: content_reviewer only
  │
  ├─ POST /review/packages/:packageId/request-changes         [reject]       — 200, status -> changes_requested
  │     authz: content_reviewer; requires non-empty notes (server-enforced,
  │            not just a UI alert); inserts one content_reviews row
  │
  ├─ POST /review/packages/:packageId/approve                 [approve]      — 200, status -> approved
  │     authz: content_reviewer; server independently recomputes "every
  │            mandatory checklist item checked" — never trusts a client
  │            boolean; inserts one content_reviews row
  │
  ├─ POST /review/packages/:packageId/publish                 [publish]      — 200, status -> published
  │     authz: content_reviewer; server rejects unless current status is
  │            exactly 'approved' (today: only a hidden button prevents this)
  │            runs the Part 4 publish transaction
  │
  ▼
Student (role=student)
  │
  └─ GET /sessions/:sessionId/content                         [student-read] — 200, resolves ONLY via publications
        authz: student; enrolled in the session's course (future: enforced
               once Enrollment is real — see Part 9); the endpoint has no
               parameter or header that can select draft/approved/changes-
               requested content under any circumstance
```

**Authorization at every transition, stated as a table:**

| Transition | Who | Extra server-side check |
|---|---|---|
| Create/save draft | `content_author` | `imported_by_user_id = self` on every subsequent save |
| Submit for review | `content_author`, own draft | Mandatory sections complete (server-recomputed) |
| Request changes | `content_reviewer` | Notes non-empty; package status is `draft` or `changes_requested` |
| Approve | `content_reviewer` | Checklist fully complete (server-recomputed); package status is `draft` or `changes_requested` |
| Publish | `content_reviewer` | Package status is exactly `approved` |
| Read content (student) | `student` | Resolves via `publications` only — structurally cannot see anything else |
| Read own submission status | `content_author`, own package only | — |
| Read/act on any package | `content_reviewer` | No ownership restriction — any reviewer can act on any package, matching current product behavior; the server does record *which* reviewer, though (Part 2) |

---

# PART 6 — DOCX Content Pipeline

```
Content Author uploads a .docx (Learning / Practice / Exercise / AI Help — one file per section, per the frozen document-first model)
  ↓
Server receives the raw file bytes (multipart upload)
  ↓
Server-side validation: extension, size limit (Part 14), and that it's a real zip container
  ↓
Server-side deterministic parsing — the SAME algorithm currently in docxParser.ts,
ported to run in the backend runtime, not re-run in the browser as the source of truth
  ↓
Structured extraction result (LearningExtraction / PracticeExtraction / ExerciseExtraction / AiHelpExtraction)
  ↓
Merged into the session's in-progress draft content_version (still status=draft)
  ↓
(Optional, SHOULD HAVE) original file bytes persisted to object storage, referenced by content_packages.original_document_ref
```

## Where parsing should happen: the server, not the browser

**Recommendation: move the authoritative parse server-side.** The current implementation is entirely client-side (`docxParser.ts`, `jszip` + the browser's native `DOMParser`), which was the right MVP choice when there was no server to send anything to. Once a backend exists, the parse must move, for a reason directly tied to the whole point of the document-first model: **the document-first model's entire value proposition is a verifiable link between one specific uploaded artifact and the structured content it produced** (`NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md` §9/§11 — deterministic, reviewable, and comparable against the original). If parsing stays client-side and the browser merely POSTs the *result* to the server, nothing stops a modified client (or a direct API call) from POSTing fabricated "extracted" JSON with no real document behind it at all — silently defeating the model's own reason for existing. Running the same deterministic algorithm server-side, against the bytes the server itself received, closes that gap completely.

**This is a runtime relocation, not an algorithm change.** `docxParser.ts`'s functions (`readDocx`, `extractLearningContent`, `extractPracticeContent`, `extractExerciseContent`, `extractAiHelpContent`) take plain data in and return plain data out — they use `jszip` (works identically in Node) and the browser's `DOMParser` (a Node-compatible XML parser, e.g. a small `xmldom`-family library, is a drop-in substitute for the one DOM API call the code makes). The strict-template-parsing *rules* — exact Word heading styles, never AI, never a heuristic, precise per-heading error messages — are unchanged and are exactly what Part 6 was told not to touch; only *where the function executes* changes.

**What may still happen client-side, as UX polish, not as the source of truth:** an optional "does this look right" preview pass in the browser before upload, purely for faster feedback — but the persisted `content_version` must always come from the server's own re-parse of the uploaded bytes, never from trusting whatever the client says it extracted.

## Original DOCX retention

Per the frozen decision (domain model §17, restated in the document-first model §11): **SHOULD HAVE, not MUST HAVE.** The load-bearing artifact is the normalized structured content, which the pipeline above already produces and persists regardless. Retaining the original file is valuable specifically because the Document-First Model's Content Reviewer capability (§11 there — "open the original uploaded document directly alongside the extracted result") depends on it, and because it gives real re-processing/audit ability if the parser ever changes. **Recommendation: do it from day one** — with object storage (Part 13) it is a single extra `PUT` per upload and one nullable pointer column, genuinely cheap, not worth deferring past the initial backend build. This is a recommendation to build it early, not a reclassification of it as MUST HAVE.

---

# PART 7 — Video Checkpoints

## Mapping

The current `VideoCheckpoint` shape maps field-for-field onto `video_checkpoints` (Part 3) with nothing invented or dropped:

| Frontend field | Backend column |
|---|---|
| `id` | `video_checkpoints.id` (server-generated on creation, stable thereafter) |
| `timestampSeconds` | `timestamp_seconds` |
| `question` | `question` |
| `options[]` | `options` (`text[]`) |
| `correctIndex` | `correct_index` |
| `feedback` | `feedback` |
| `required` | `required` |

No stored `order` column, matching the already-frozen decision (Video Checkpoint System §A) — checkpoints are always sorted by `timestamp_seconds` at read time, never by array position.

## What the server trusts, and what it does not

**Trusts from the client (student browser):** which option index the student selected, and when. That's it. The client's own `useVideoCheckpoints.ts` hook already computes `videoCheckCorrect`/`videoCheckDone` locally so the student gets instant feedback — that computation is fine to keep, purely as UX, because the client already has the authored content (it has to, to render the question and options at all).

**Does NOT trust from the client, ever, for anything that affects a persisted score:**
- Whether the answer was correct — the server independently compares the submitted `selected_index` against its own `video_checkpoints.correct_index` and writes the result into `video_checkpoint_answers.correct` itself (Part 3). A tampered client reporting "correct: true" for a wrong answer is simply overwritten by the server's own comparison.
- The aggregate "was every required checkpoint answered, and correctly" — `session_performance.activities.videoCheck` is *derived* server-side by querying `video_checkpoint_answers` for that student/session against `video_checkpoints.required = true`, at the moment `POST /sessions/:id/complete` is called — never accepted as a client-submitted boolean pair.
- That a checkpoint was "reached" via legitimate forward playback vs. skipped/seeked — the server has no way to verify playback position at all (nor should it try to; see below), so it does not attempt to. It only ever verifies the *content* of a submitted answer against the *authored* correct answer, which is sufficient to prevent the score itself from being spoofed even if playback enforcement is bypassed.

**Explicitly, and deliberately, not the backend's job to solve:** the already-frozen Video Checkpoint System design (§G) states plainly that seek/pause enforcement is "good-faith UX enforcement, not tamper-proof," and this document does not revise that. A student who bypasses the client-side forward-seek blocking (e.g., via devtools) can still reach and answer any checkpoint out of the intended order — but they still have to submit *some* answer for the server to check, and the server's check of that answer against the real correct index cannot be bypassed the same way. The backend's contribution is exactly this: closing the score-fabrication gap, not attempting to make client-side video playback itself tamper-proof (a genuinely different, much larger problem — custom playback controls, DRM-adjacent techniques — explicitly out of scope, matching the already-frozen "not achievable for free" framing in both the Video Checkpoint System and the Content Team Authoring Workflow documents).

**YouTube playback architecture itself is unchanged** — `youtubePlayer.ts` (the loader), `useVideoCheckpoints.ts` (the hook), and `VideoCheckpointPlayer.tsx` (the component) are exactly what the backend sits underneath; nothing in this document proposes touching any of the three.

---

# PART 8 — Exercise + Future Evaluation

All 8 authored fields are preserved verbatim in the `exercises` table (Part 3): `objective`, `scenario`, `requirements[]`, `expected_behaviour`, `evaluation_criteria[]`, `edge_cases[]`, `submission_instructions`, `starter_code`, `language`. This directly continues the data-contract cleanup pass that already fixed the frontend pipeline to stop silently dropping most of these fields before they ever reached `SessionContent`.

**Structured, not further normalized — per the frozen model's own instruction.** `requirements[]`, `evaluation_criteria[]`, and `edge_cases[]` stay as native Postgres array columns (or `jsonb` if a richer per-item shape is ever needed — plain strings today, so `text[]` is the simpler, sufficient choice) directly on the `exercises` row. They do **not** become their own child tables (`Requirement`, `EvaluationCriterion`, ...) — nothing in the current app, or in any plausible near-term evaluator, needs to query, filter, or join across these items independently of the one `Exercise` they belong to. This is the exact same reasoning the domain model already applied to `ContentVersion`'s own sub-fields (§5) and to `Portfolio.skills` (§13) — structured JSON/array fields inside one row are correct exactly when nothing consumes the pieces independently, and normalization would be complexity spent for its own sake.

**Why `Exercise` itself is still its own table (not folded into `content_versions` as one more JSON field), restated precisely:** the reason is identity, not richness of content — `exercise_submissions.exercise_id` needs a real, stable id to reference, one that doesn't change if the exercise's own text is later revised, and one that isn't borrowed from `session_id` (today's actual, audit-confirmed risk). That reasoning is orthogonal to whether the exercise's own fields are structured JSON internally — they are, and that's correct and unchanged.

**What a future evaluator would consume, without any schema change:** `exercise_submissions.files` (the student's submitted code) joined against `exercises.evaluation_criteria[]`/`edge_cases[]`/`expected_behaviour` (what a correct solution must satisfy). Both already exist in the shape above the moment this backend is built. **No evaluator is designed, specified, or implied beyond stating that this join is what it would need** — consistent with the instruction not to design evaluation here.

---

# PART 9 — Student Data

| Data | Backend owner | Table(s) | Authored or student-generated? |
|---|---|---|---|
| Student identity | `users` (role=student) | `users` | Platform-owned identity |
| Enrollment | Student | `enrollments` | Student-generated (one row per enrollment action) |
| Session progress (completion) | Student | `session_completions` | Student-generated |
| Video checkpoint answers | Student | `video_checkpoint_answers` | Student-generated |
| Exercise submissions / attempts | Student | `exercise_submissions` | Student-generated |
| Completion (per session) | Student | `session_completions` | Student-generated |
| Performance | Student | `session_performance` | **Server-derived** from student-generated raw answers — not itself "authored," not itself directly "typed" by the student either; it's a computed fact about student activity |
| Portfolio | Student | `portfolios`, `portfolio_projects` | Student-authored (the student is the author of their own portfolio content) |

**Authored content vs. student-generated data, stated as the one rule that governs every table above:** `courses`, `subjects`, `sessions`, `content_versions`, `exercises`, `video_checkpoints` are **authored content** — owned by the platform/Content Author/Content Reviewer chain, immutable once published, and read-only to every student. Every table in the list above is the opposite: **student-generated data**, owned by the individual student, writable only by that student's own authenticated session, and never writable by Content Author, Content Reviewer, or Admin (Admin gets read-only access — domain model §14, unchanged). No table anywhere mixes the two — a `content_versions` row never gains a student-specific column, and a `session_performance` row never gains authored content duplicated into it.

**Enrollment scoping, once real:** every student-data read/write above should additionally verify the student is enrolled in the course the session belongs to (via `enrollments`), closing the audit's finding that nothing today checks this. Not urgent for a single-course MVP, but the schema (Part 3) already supports it from day one.

---

# PART 10 — API Boundaries (proposed, not implemented)

| Resource | Read | Create | Update | Submit | Approve | Publish | Student-read |
|---|---|---|---|---|---|---|---|
| **Auth / session** | own session | login | refresh token | — | — | — | — |
| **Courses / Subjects / Sessions** | content_author, content_reviewer, admin (structure) | — (side effect of publish only) | — (side effect of publish only) | — | — | — | ✅ published sessions' structure only |
| **Content draft** (`content_versions` in progress) | own drafts (author), any (reviewer) | content_author | content_author, own, pre-approval | content_author | — | — | ❌ never |
| **Content review** (`content_reviews`) | content_reviewer, admin (read) | — | — | — | content_reviewer | — | ❌ never |
| **Publication** | admin, content_reviewer (status), student (resolved content only) | — | — | — | — | content_reviewer | ✅ (resolved content only, not the row itself) |
| **Session content (resolved)** | — | — | — | — | — | — | ✅ the one student-facing read endpoint |
| **Video checkpoint answers** | own (student), admin (read) | student (submit answer) | — | — | — | — | n/a (this *is* the student endpoint) |
| **Exercise submissions** | own (student), admin/content_reviewer (read, for future evaluation) | student | — | — | — | — | n/a |
| **Performance** | own (student), admin (read) | — (server-derived only) | — | — | — | — | n/a |
| **Portfolio** | own (student), public (future, unbuilt — matches today's unbuilt `PortfolioView`) | student | student | — | — | — | n/a |
| **Admin aggregates** | admin only | — | — | — | — | — | n/a |

**Deliberately not over-engineered:** no GraphQL layer, no separate "gateway" service, no per-resource microservice — a single REST (or tRPC, if the team prefers end-to-end TS types without a schema layer) API surface grouped by these resources is sufficient for this MVP's actual shape. Nothing here proposes an endpoint that doesn't map to a UI interaction the frontend already has today.

---

# PART 11 — Authentication & Authorization

**Current state:** four separate `localStorage` "is this exact key present" checks, no password verification, no token, no expiry (audit, cross-cutting finding) — this document replaces all four with one real mechanism.

## Model

- One `users` table, one `role` enum (`student | admin | content_author | content_reviewer`) — matches Part 3 exactly, no per-role identity tables.
- **Password storage:** `argon2id` (or `bcrypt` if the chosen framework's ecosystem makes that meaningfully simpler) — never plaintext, never reversible encryption.
- **Session mechanism:** short-lived JWT access token (role + user id claims) + a longer-lived, rotating refresh token stored server-side (allows real revocation — a pure stateless JWT with no revocation list cannot support "log this user out everywhere," which a real product eventually needs).
- **Transport:** `httpOnly`, `secure`, `sameSite` cookies for the browser app (avoids the XSS-exfiltration risk of storing a token in `localStorage`, which is also a clean, deliberate contrast with the app's *current* pattern of literally storing the "session" in `localStorage`).

## Authorization boundaries (restates Part 5/9's specifics as one summary)

| Role | Can write | Can read | Cannot |
|---|---|---|---|
| `student` | own progress/performance/checkpoint-answers/submissions/portfolio | published content only, own data only | anything unpublished; any other student's data; anything Content Author/Reviewer-owned |
| `content_author` | own drafts (`draft`/`changes_requested` only) | own drafts, published content | approve/publish/request-changes; any other author's *unsubmitted* drafts; any student data |
| `content_reviewer` | review actions, publish | any package at any status, published content | edit source content directly; any student data (write) |
| `admin` | nothing | everything (aggregated) | write anything, anywhere — read-only, no exceptions, matching the domain model §14 exactly |

**Not implemented here, per instructions** — only the model above is specified; no login endpoint, no middleware, no token library is wired up.

---

# PART 12 — Technology Selection

## Comparison

| Concern | Options considered | Evaluation |
|---|---|---|
| **Database** | PostgreSQL, MySQL, MongoDB | The domain model's core invariant — "at most one live `Publication` per session" — needs a real partial unique index and transactional multi-row atomicity (Part 4's publish transaction). Postgres supports both natively and cleanly; MySQL can approximate it with more friction (weaker partial-index support); a document store (MongoDB) would require reimplementing referential integrity and multi-document transactions the relational model gets for free, for a domain that is fundamentally relational (users → enrollments → sessions → versions → publications, all real foreign keys). **Postgres is the clear fit, not a default choice.** |
| **Runtime/language** | Node.js/TypeScript, Python, Go, Java | The frontend is TypeScript. One language across the stack means shared types for shapes like `SessionActivitiesInput`/`VideoCheckpoint` (via a shared package or generated client), one hiring/onboarding profile, and no context-switch for a small team. Nothing about this LMS's actual workload (no numerical/ML compute today) benefits from Python/Go/Java's strengths enough to offset that cost. |
| **Framework** | NestJS, Fastify, Express | See below — full discussion, not a one-line pick. |
| **ORM/query layer** | Prisma, Drizzle, raw SQL | Prisma: mature migrations, generated types, large community, best onboarding story. Drizzle: closer to raw SQL, lighter runtime, better cold-start (relevant only if deploying serverless), less mature migration tooling as of writing. Raw SQL/query builder (e.g., `pg` + `kysely`): maximum control, most manual work. For an MVP team prioritizing developer productivity and correctness of the versioning invariants (Part 4), **Prisma** is recommended; Drizzle is a legitimate alternative if the team already prefers SQL-adjacent tooling or targets serverless deployment specifically. |
| **Object storage** | AWS S3, Cloudflare R2, Supabase Storage | All three are S3-API-compatible; R2 has no egress fee (relevant if DOCX/media downloads scale up), Supabase Storage is convenient if also using Supabase for Postgres. No functional difference for this MVP's volume — pick based on the hosting decision, not the storage API. |
| **Auth** | Self-hosted (argon2 + JWT), managed provider (Auth0/Clerk/Supabase Auth) | Self-hosted: full data ownership (relevant for an education product handling student records), no per-monthly-active-user vendor cost, and the actual requirement (4 flat roles, no SSO, no social login currently wired despite `GoogleButton.tsx` existing as an unwired UI stub) is simple enough not to need a managed provider's more advanced features. Managed: faster to stand up, offloads security maintenance. **Recommendation: self-hosted for MVP** — the requirement genuinely is simple, and owning student data end-to-end is a defensible default for an education platform; revisit if/when SSO or social login becomes a real, requested feature. |
| **Deployment** | VPS (self-managed), serverless (Lambda/Vercel Functions), managed container host (Render/Fly.io/Railway) + managed Postgres (RDS/Neon/Supabase) | Raw VPS: too much ops burden for a small team's MVP stage. Serverless: cold starts and awkward long-lived-DB-connection pooling don't fit a stateful Postgres-backed app well, and NestJS/Fastify's request-lifecycle model doesn't map cleanly onto Lambda without extra adaptation layers. **Managed container host + managed Postgres is the recommended middle ground** — low ops burden, predictable cost, straightforward to reason about, and every framework option above deploys to it without modification. |

## Framework decision, discussed fully (not chosen by popularity)

- **Express:** most familiar, largest ecosystem, but provides *no* structure — every module boundary (auth, content, review, student, admin), every guard, every DTO validation would be hand-rolled and hand-maintained. For a system with a real 4-role authorization matrix (Part 11) that must be gotten right, this is exactly the kind of thing a framework should provide, not reinvent per-project.
- **Fastify:** faster runtime, good TypeScript support, lighter weight than Nest — a strong choice if the team values minimal abstraction and is comfortable building its own conventions for module boundaries and role guards. Legitimate alternative, not a wrong choice.
- **NestJS:** built-in dependency injection, module system, and **guards** — a first-class primitive that maps directly onto "this route requires role X, and additionally an ownership check Y" (Part 5's authorization table becomes a set of guards almost verbatim). Its module boundaries map cleanly onto this system's actual domain boundaries (an `AuthModule`, `ContentAuthoringModule`, `ContentReviewModule`, `StudentModule`, `AdminModule` — mirroring the four roles almost exactly). The extra structure Nest imposes is exactly the kind of "pay for it once, benefit every time a new role-gated endpoint is added" tradeoff that suits a system expected to grow a future evaluation module (Part 16) without a rewrite.

**Recommendation: NestJS**, specifically because this system's defining technical challenge is a real, non-trivial authorization matrix across four roles plus a strict content-versioning state machine — exactly the shape Nest's guards/modules/DI are built for — not because it's the most popular option. Fastify remains a reasonable, lighter-weight fallback if the team explicitly prefers less framework structure; Express is not recommended given how much of its missing structure this system would otherwise have to reinvent correctly by hand.

## Suitability for future AI/evaluation workloads

Nothing above blocks adding an evaluation capability later: a future evaluator can be built as an additional Nest module (or a genuinely separate service, if it turns out to need different scaling characteristics — e.g., calling an LLM API is I/O-bound and could run as its own worker process consuming a queue) that reads `exercise_submissions` and `exercises` (Part 8) — no schema change required to start that work, and no part of the technology stack chosen here is hostile to adding it.

---

# PART 13 — Storage Architecture

| Data category | Where it lives | Why |
|---|---|---|
| **Relational data** (users, courses, sessions, publications, completions, performance, submissions metadata, portfolio) | PostgreSQL | Needs real foreign keys, transactions, and uniqueness constraints (Part 3/4). |
| **Structured content** (video/aiHelp/delivery JSON blobs inside `content_versions`; `activities` inside `session_performance`) | PostgreSQL `jsonb` columns, same database | No independent query need across these sub-fields (Part 3's own reasoning); keeping them in the same transactional store as everything else avoids a second datastore's consistency problems for zero benefit. |
| **Uploaded DOCX files** (original retention, SHOULD HAVE) | Object storage (S3-compatible), referenced by a pointer column | Files, not rows — object storage is the correct tool; Postgres large-object storage is unnecessary complexity for this. |
| **Potential future media** (video files, if NextStep² ever hosts its own video instead of YouTube — not proposed now) | Object storage, same bucket family | Same reasoning; explicitly a Part 16 future item, not built now. |
| **Student submissions** (`exercise_submissions.files`) | PostgreSQL `jsonb` for MVP (small text files, matches today's `{name, content}[]` shape exactly); reassess to object storage only if submissions grow to include large binary artifacts | The current shape is small source-code text — no reason to introduce a second storage system for it yet. Revisit if/when submissions stop being "a few text files." |
| **Logs / audit history** (`AuditEvent`, SHOULD HAVE) | PostgreSQL table for MVP volume; migrate to a dedicated logging/observability system only once volume genuinely demands it | Domain model §16 already classifies this SHOULD HAVE, not MUST HAVE — no need to stand up separate log infrastructure before there's real log volume to justify it. |

**Object storage vs. database storage, stated as the one rule governing the table above:** if it's a queryable *fact* the application logic reasons about (a status, a score, a foreign key relationship), it belongs in Postgres. If it's an opaque *blob* the application only ever stores and retrieves whole (an uploaded file), it belongs in object storage. Nothing in this system's current or near-future shape needs a third category.

---

# PART 14 — Security

| Requirement | Design |
|---|---|
| **Authentication** | Real password verification (argon2id), JWT access + rotating refresh tokens, httpOnly cookies (Part 11). |
| **Authorization** | Role guard on every endpoint (Part 11); ownership checks layered on top where the role alone isn't sufficient (a `content_author` guard still isn't enough to let author A edit author B's draft — Part 5). |
| **Tenant/data isolation** | No multi-tenant/company-per-org concept exists in the current product (Company/Hiring is explicitly out of scope everywhere this project has touched it) — isolation here means **per-student** data isolation, not per-organization. Every student-data query is scoped by the authenticated `student_id`, never a client-supplied id. |
| **Published-content isolation** | Structural, not conventional — the student-facing content endpoint has no code path that can resolve anything other than `publications WHERE superseded_at IS NULL` (Part 4/5). |
| **Content-author/reviewer separation** | Enforced by role guards plus the state-machine checks in Part 5 — a `content_author` token is rejected by every reviewer endpoint at the guard level, before any business logic runs. |
| **Upload validation** | Re-validated server-side regardless of client checks: file extension, real-zip-container check, size limit (matching today's 5MB client-side limit as a floor, tunable), and the deterministic parse itself as the final validation (Part 6). |
| **File size/type restrictions** | Enforced at the upload endpoint before any parsing begins — reject oversized/wrong-type files immediately, not after spending parse time on them. |
| **Input validation** | DTO-level validation on every endpoint (a natural fit for NestJS's `class-validator` pipes, if that framework is chosen) — reject malformed payloads before they reach any service logic. |
| **Rate limiting** | Applied at minimum to `/auth/login` (credential-stuffing protection) and file upload endpoints; a general per-IP/per-user limit on the rest is a reasonable SHOULD HAVE, not blocking MVP launch. |
| **Audit trail** | `content_reviews` (append-only) + `publications` (supersession history) already provide this for content; a generic `AuditEvent` table (Part 2, SHOULD HAVE) extends it to non-domain-entity events (logins, admin views) when actually needed. |
| **Student submission protection** | `exercise_submissions` and `video_checkpoint_answers` are insert-only from the student's perspective (no update/delete endpoint) — a submission, once made, cannot be silently altered by the student or anyone else after the fact, matching the current frontend's own "every attempt retained" behavior and strengthening it (today nothing technically prevents a direct `localStorage` edit; a real backend removes that entirely). |

---

# PART 15 — Migration Strategy

**The current `src/data/*.ts` files are already, structurally, the seam a real migration needs — this is not a coincidence, it's why they were built as isolated load/save function modules in the first place.** Every one of them (`progress.tsx`, `performance.ts`, `portfolio.ts`, `exerciseSubmissions.ts`, `contentPackages.ts`, `authoredSession.ts`, `adminAccount.ts`, `contentAuthor.ts`, `contentReviewer.ts`) exposes a small set of named functions (`loadX`/`saveX`/`createX`) that every page/component already calls instead of touching `localStorage` directly. **Migrating means changing what's inside those functions — from a `localStorage.getItem/setItem` body to a `fetch()` call against the new API — without changing a single call site.** No page, no component, and no test needs to change shape for this to happen; `useCourseData()`, `SessionWorkspace.tsx`, `ContentSessionAuthoring.tsx`, etc. keep calling the exact same functions they already call.

## Phased rollout (no big-bang rewrite required)

| Phase | What migrates | What stays on `localStorage` |
|---|---|---|
| **0 — Backend stands up** | Auth (real login replaces the four mock account files), Course/Subject/Session/Publication resolution (`getSessionContent`/`getPublishedSessionContent` bodies become API calls) | Everything else, unchanged |
| **1 — Content authoring/review writes** | `authoredSession.ts`'s `saveDraft`/upload functions, `contentPackages.ts`'s review/approve/publish functions | Student-generated data still local |
| **2 — Student-generated data** | `progress.tsx`, `performance.ts`, `exerciseSubmissions.ts`, `portfolio.ts` — each becomes API-backed, one file at a time, independently (they have no interdependency on each other today, so they can migrate in any order) | Nothing — by end of Phase 2 nothing meaningful remains in `localStorage` |
| **3 — Cleanup** | Remove the now-dead `localStorage` fallback code paths from each adapter file (the `typeof window === "undefined"` guards, the try/catch-around-`JSON.parse` bodies) | — |

**Why this order:** Phase 0 (auth + read path) is the prerequisite for everything else and delivers the single most valuable fix (real authentication) first. Phase 1 (authoring/review) is next because it's the smaller, more contained surface (two roles, one shared record type) and directly closes the versioning/append-only-review gaps (Part 4) that are the audit's most serious structural findings. Phase 2 (student data) is last among the functional migrations because it's the widest-blast-radius change (touches every student page) and benefits most from the backend, auth, and content-read path already being proven stable first.

**Explicitly not required:** rewriting `SessionWorkspace.tsx`, `ContentSessionAuthoring.tsx`, or any page component during this migration. They already depend only on the adapter functions' signatures, which do not need to change (only `loadPortfolio(studentName)` → `loadPortfolio()` reading the authenticated session instead of a parameter, as one concrete example of a signature that *does* need to narrow, since the whole point of Part 2/9 is removing client-supplied identity — this is the one deliberate, necessary signature change, not an oversight).

---

# PART 16 — MVP vs. Future

## MVP backend (build now, in the order Part 17 recommends)

- Real authentication for all four roles (Part 11).
- `users`, `enrollments`, `courses`, `subjects`, `sessions`, `content_packages`, `content_versions`, `exercises`, `video_checkpoints`, `content_reviews`, `publications` (Part 3/4).
- Content Author → Content Reviewer → Student flow with real server-side enforcement at every transition (Part 5).
- Server-side DOCX parsing (Part 6).
- Server-verified video checkpoint answers (Part 7).
- Exercise contract fully preserved for a future evaluator, without building one (Part 8).
- `session_completions`, `session_performance`, `exercise_submissions`, `video_checkpoint_answers`, `portfolios`, `portfolio_projects` (Part 9).

## Explicitly future — do not build as part of this MVP backend

| Future item | Why it's future, not MVP |
|---|---|
| **AI/automated exercise evaluator** | Part 8 explicitly preserves the data shape for this without designing or building it — no evaluator exists anywhere in the current product, and none is proposed here. |
| **Analytics** (which sessions have low completion, authoring velocity, checkpoint difficulty reporting) | No current screen needs this; the schema above (especially `video_checkpoint_answers`) makes it possible later without a redesign, but nothing computes it now. |
| **Notifications** (email/push for review status changes, etc.) | No notification mechanism exists anywhere in the current frontend. |
| **Real-time collaboration on one draft** | The authoring workflow document (§15) already flags concurrent multi-author editing of the same session as an explicitly open, unsolved question — "assume one author at a time" remains the honest MVP answer. |
| **Multiple content authors per session / assignment** | Same source — a lightweight "assigned to" note was flagged as a reasonable future Should-Have, not designed now. |
| **Content scheduling** (publish-at-a-future-date) | No such capability exists in the current review/publish flow; Publish is always immediate. |
| **Richer media** (self-hosted video, images in Learning Content, PDFs) | Video stays YouTube-only (unchanged, Part 1); Learning Content images are explicitly not extracted or shown anywhere today (audit finding, unchanged). |
| **Certificates** | No such concept exists anywhere in the current product. |
| **Multi-tenant / Company / Hiring capabilities** | Explicitly out of scope for every task in this project to date; this document does not introduce tenancy. |
| **`AuditEvent` (generic)** | Domain model already classifies this SHOULD HAVE for MVP, not MUST HAVE — buildable early if convenient, not blocking. |
| **Custom/dynamic roles beyond the fixed four** | The `Role`-as-table rejection in Part 3 is specifically because nothing today needs this; revisit only if a real requirement appears. |

---

# PART 17 — Final Recommendation

1. **Recommended architecture:** a single modular monolith (not microservices) — NestJS modules mirroring the four roles/domains (Auth, Content Authoring, Content Review, Student, Admin) — backed by one PostgreSQL database and one object-storage bucket. Microservices are not justified at this scale or by any current requirement; a monolith with clean internal module boundaries (which Nest's structure provides directly) gets nearly all the maintainability benefit without the operational cost of running/coordinating multiple services.
2. **Recommended technology stack:** Node.js + TypeScript, NestJS, Prisma.
3. **Database choice:** PostgreSQL — chosen specifically for the versioning invariant's transactional/partial-unique-index needs (Part 4), not by default.
4. **Storage choice:** PostgreSQL for all relational and structured-JSON data; S3-compatible object storage for uploaded DOCX files (and any future media) — see Part 13's governing rule.
5. **Authentication approach:** self-hosted email/password, argon2id hashing, JWT access token + rotating server-tracked refresh token, httpOnly cookies — not a managed auth vendor, given the genuinely simple 4-flat-role requirement and the value of full data ownership for an education product.
6. **API approach:** a single REST API (or tRPC, if the team prefers shared TS types over a schema layer) grouped by the resource boundaries in Part 10 — no GraphQL layer, no gateway, no premature service split.
7. **Deployment approach:** managed container host (e.g., Render/Fly.io/Railway) + managed Postgres (e.g., Neon/Supabase/RDS) + S3-compatible object storage — avoiding both raw-VPS operational burden and serverless's poor fit for a stateful, connection-pooled Postgres app.
8. **What we should build first:** authentication for all four roles, then the canonical `courses`/`subjects`/`sessions`/`content_versions`/`publications` read path (so the Student app can read real published content), then the Content Author → Content Reviewer write/review/publish flow with real server-side enforcement — in that order, because each step is both independently valuable and a prerequisite for the next (Part 15's Phase 0 → 1 ordering, restated as the build order).
9. **What we should explicitly NOT build yet:** any AI/automated evaluator, analytics, notifications, real-time collaborative authoring, content scheduling, richer media beyond YouTube, certificates, or any multi-tenant/Company capability — every one of these is listed in Part 16 as future, and none of the schema or architecture decisions above blocks adding them later without a redesign.

---

*This document is an architecture/technology-selection artifact only. No backend code, database, migration, or API was implemented. Stopping here, as instructed.*
