# NextStep² Backend Domain Model (Approved — Frozen)

**Status:** Design document only, now **approved and frozen** (see the Frozen Decisions Summary near the end). Nothing in this document has been implemented. No backend, database, table, or framework was created. The next step is Backend Architecture & Technology Selection, not covered here.

**Builds on:** `NEXTSTEP2_BACKEND_READINESS_AUDIT.md`, which inventoried what exists today. That document mostly *asked* questions and flagged gaps without resolving them. This document exists to **answer** them — every open question in the audit gets an explicit decision here, with reasoning grounded in the actual MVP behavior, not invented functionality.

**Scope:** Student, Content Manager, Admin. Company/Hiring is out of scope and does not appear below except where explicitly noted as excluded.

**Guiding principle (per instructions):** the prototype supports exactly one student; the real backend must support **N students from day one**. Nothing below re-introduces the prototype's single-student assumption into the schema, even though only one student will initially be seeded.

---

## 1. User / Auth Model

**Decision: a single `User` table with a `role` column, not separate identity tables per role.**

```
User
  id            — server-generated, globally unique, stable
  email         — unique
  passwordHash
  role          — "student" | "content_manager" | "admin"
  status        — "active" | "pending_verification" | "disabled"
  name          — display name (today's ContentManagerAccount/AdminAccount already carry only name+email — no reason for Student to carry more)
  createdAt
  updatedAt
```

**Why one table, not `User → Role` as a separate join or three separate identity tables:** every role in the current app is authenticated the same way (email + password) and needs the same baseline fields (id, email, password, "who is this," when created). Nothing today gives a user more than one role at a time, and nothing in the MVP implies a user ever needs multiple roles simultaneously. A single table with a `role` column is the minimal structure that satisfies every current login flow (Student, Content Manager, Admin) without inventing a permissions/role-assignment system the MVP doesn't have.

**Does Student need a separate `StudentProfile`? Decision: No, not for MVP.** Every Student-owned entity below (Enrollment, SessionCompletion, SessionPerformance, ExerciseSubmission, Portfolio) can FK directly to `User.id` where `role = "student"`. Today's actual Student data (`STUDENT = {name}` in `mock.ts`) has no field beyond what `User` already carries. Introducing a separate profile table now would be modeling for fields that don't exist yet (bio, avatar, phone, etc.) — easy to add later as a 1:1 table the moment a real field shows up, with no migration pain to the entities that already reference `User.id`. Content Manager and Admin have the identical reasoning (their current accounts are also just `{name, email}`) — no separate profile tables for them either.

`status` exists mainly to give the real Signup → Email Verification flow (which already exists as UI, `EmailVerification.tsx`, but is currently decorative) somewhere real to land — **this is a field, not a feature**; account suspension/disabling as an *Admin capability* remains explicitly out of scope per every prior MVP task in this project.

---

## 2. Student Model

```
User (role = student)
  │
  ├── Enrollment          (1 per course the student is enrolled in — see §4)
  ├── SessionCompletion   (0..* — one per completed session, see §10)
  ├── SessionPerformance  (0..* — one current record per attempted session, see §11)
  ├── ExerciseSubmission  (0..* — every attempt, retained, see §12)
  └── Portfolio           (exactly 1)
        └── PortfolioProject (0..*)
```

Every one of these FKs `studentId → User.id` directly (per §1's decision — no intermediate `StudentProfile`). This is the one structural change from the prototype that matters most: **every Student-owned table now has a real, stable, globally-unique `studentId` to scope by** — today, none of them do (they're flat, unscoped, single-tenant-by-assumption stores). The backend supports any number of students from the moment this FK exists; the MVP simply seeds one.

---

## 3. Course / Subject / Session — the canonical model

This is the most consequential decision in this document, because the audit found **two unreconciled sources of truth** (the hardcoded `mock.ts` tree that drives the real Student UI, and the package-embedded tree that Content Manager imports). The backend must have exactly one.

**Decision: `Course`, `Subject`, and `Session` are standalone, platform-owned entities with stable ids — never embedded inside a `ContentPackage`, and never hardcoded in application code.**

**Ownership vs. operation, stated precisely:** curriculum structure (`Course`/`Subject`/`Session`) is **platform-owned** — it does not belong to Content Manager as a domain the way `ContentPackage`/`ContentReview`/`Publication` do. Content Manager is, for this MVP, simply **the only operational actor that creates/updates it**, and only as a side effect of publishing (below). That distinction is deliberate, not pedantic: it's what leaves room for a future Admin curriculum-management capability (creating/editing a Course or Subject directly, independent of any package) without requiring Course/Subject/Session to be re-homed out of Content Manager's domain later. **No such Admin capability is being proposed or needed now** — this is purely about not baking today's one-actor reality into the ownership model itself.

```
Course   { id, title, description }
  └── Subject { id, courseId, title, description, order }
        └── Session { id, subjectId, title, description, order }
```

The subtlety is **when** a Course/Subject/Session row's `title`/`description`/`order` change, because a naive "import always writes the canonical table" design would leak an in-review Content Manager's draft renaming of a subject to students immediately — breaking the isolation guarantee (Draft/Changes Requested/Approved → invisible; Published → visible) that the whole MVP is built around.

**Rule: a canonical `Course`/`Subject`/`Session` row's display fields always reflect "as of the last publish." Draft/Review changes never touch these tables until Publish.**

- **Who creates these records:** operationally, the Content Manager import/publish pipeline is the only path that creates or updates them today — there is no separate curriculum-authoring UI in this MVP, matching current reality (Content Manager only ever imports pre-authored packages, per the audit's §12/§26 findings). The records themselves remain platform-owned, per the distinction above.
- **How Content Manager imports content against them:** while a package is Draft / Changes Requested / Approved, its authored course/subject/session/content tree lives entirely **inside the package's own scope** (exactly like today's `ContentPackageRecord.courses`, just normalized — see §6). It does not touch the canonical tables at all during review.
- **What happens at Publish:** for each session the package authors, the pipeline looks up the canonical `Session` by the author-supplied id:
  - **If it doesn't exist yet** (this is the first time this session has ever been published), create the canonical `Course`/`Subject`/`Session` rows (creating parents as needed) using this version's title/description/order.
  - **If it already exists**, update its `title`/`description`/`order` to match this newly-published version, and create the new `ContentVersion` + `Publication` for it (§5/§7/§9).
- **How IDs remain stable:** the author-supplied id *becomes* the canonical id the first time it's published. Every subsequent import that reuses the same id targets the same canonical row — this depends on the Content Team consistently reusing ids across re-imports, which (as the audit noted) nothing enforces today. This document does not solve that process problem, but flags it as a real operational requirement, and a natural place for the Import UI to eventually warn "this id already exists — you are updating it" vs. "this is new" (a **SHOULD HAVE**, not required to design further here).
- **What happens when content is updated:** a new `ContentVersion` is authored, goes through its own Draft → Review → Approve → Publish cycle, and — only at the moment it is actually published — becomes the session's new current content and refreshes the canonical `Session`'s display fields. The previous `ContentVersion`'s `Publication` is superseded in the same operation (§7).
- **How Student accesses them:** the Student-facing Course/Subject/Session navigation reads **only** the canonical tables — never package data directly, never a "most recent" sort over packages. It's a direct, unambiguous read.

---

## 4. Enrollment

**Decision: yes, introduce `Enrollment`.** The prototype has none because it only ever needed to imply "the one student is in the one course." That assumption cannot survive a multi-student backend — the backend needs a real, queryable fact linking a student to a course.

```
Enrollment
  id
  studentId   → User.id (role = student)
  courseId    → Course.id
  status      — "active" (the only value the MVP produces; "completed"/"withdrawn" are plausible future values, not built now)
  enrolledAt
```

- **Uniqueness:** `(studentId, courseId)` unique — a student cannot double-enroll in the same course.
- **Created by:** the existing Enrollment/Welcome UI flow (`/enroll` → `/welcome`) — this maps directly onto "create an Enrollment row," no new flow invented.
- **No payments/subscriptions** — explicitly excluded, matching instructions and the fact that nothing in the current UI implies billing.
- Kept intentionally minimal: this is a link + a timestamp + a status, nothing more.

---

## 5. Session Content

**Decision: there is no separate "SessionContent" entity distinct from `ContentVersion`. `ContentVersion` *is* the versioned session content.**

The audit already established that `SessionContent` has no identity of its own — it's identified only by the Session it's attached to, and it's exactly the thing that changes shape every time a Content Manager publishes a correction. Modeling it as a separate, unversioned "current content" table *in addition to* a versioned `ContentVersion` table would create two sources of truth that must be kept in sync by hand. Instead:

```
ContentVersion
  id
  sessionId       → Session.id
  packageId       → ContentPackage.id (which import produced this version)
  objective
  concepts[]
  keyConcepts[]
  examples[]
  video?            { youtubeUrl, title, durationSeconds? }
  videoCheckpoint?  { question, options[], correctIndex }
  practice          { task, starterCode?, checklist: string[] (labels only, never pass/fail — matches current authoring contract exactly), language }
  aiHelp            { quickPrompts[], replies: map, defaultReply }
  exerciseId        → Exercise.id (see §12 — Exercise is its own small entity, not an inline blob)
  requiredActivities[]
  projectConnection?
  delivery?         { format: "recorded" | "live", scheduledAt?, durationMinutes? }
  createdAt
```

**`delivery` is folded into `ContentVersion`, correcting a real prototype gap.** Today, live/recorded delivery info lives in a completely separate hardcoded map (`SESSION_DELIVERY`) outside the Content Package pipeline entirely — the audit flagged this explicitly. There's no reason for it to stay disconnected from the rest of the authored content; it belongs with the version it describes.

**Deliberately not normalized further.** `concepts[]`, `keyConcepts[]`, `examples[]`, `video`, `videoCheckpoint`, `practice`, `aiHelp`, `delivery` stay structured JSON-shaped fields *inside* `ContentVersion` — they do not become their own tables (`Concept`, `Example`, `KeyConcept`, `Video`, `VideoOption`, `AIQuickPrompt`, `AIReply`, ...). Nothing in the MVP ever queries, filters, joins, or reports across these sub-structures independently of the `ContentVersion` they belong to — a student always reads all of them together, as one session's content, and a Content Manager always authors all of them together, as one JSON `content.json`. Splitting them into a dozen-plus tables would add real schema and query complexity purely for its own sake. The only field promoted to its own table is `Exercise` (§12), and only for the specific, concrete reason given there (its id is currently borrowed from `sessionId`, which is unsafe) — not as a general normalization policy. This is the same reasoning already applied to `Skills` in §13 and is stated once here so it's clearly a consistent, deliberate stance across the whole model, not an inconsistency.

**"The session's current content" is not a stored fact — it's the result of one query:** join `Session → Publication (where supersededAt IS NULL) → ContentVersion`. This is a direct, single lookup, not a derived computation over history (see §7/§9).

`ContentVersion` rows are **immutable once created** — never edited in place. A change means authoring a new `ContentVersion` and going through review again, exactly mirroring the "re-import a corrected package" behavior already established in the MVP.

---

## 6. Content Package

The audit's illustrative names (`ContentPackage`, `ContentVersion`, `ContentReview`, `Publication`) hold up well against the actual workflow — validated and refined below, not accepted blindly.

```
ContentPackage
  id
  fileName
  packageVersionLabel?   — free-text from the manifest; decorative today (never used in comparison logic), kept only as a display label
  contentTeamLabel?
  importedByUserId       → User.id (role = content_manager)
  importedAt
  status                 — "draft" | "invalid" | "changes_requested" | "approved" | "published"  (unchanged from the prototype — this workflow is already correct)
  validation             { valid, errors[], warnings[] }
```

**What each entity represents:**
- **`ContentPackage`** — one import event ("this ZIP was uploaded at this time by this Content Manager"). It's the batch/transaction, not the content itself.
- **`ContentVersion`** — one session's authored content produced by that batch (§5). A single package import can produce many `ContentVersion` rows (one per session it authors), exactly matching today's `courses[].subjects[].sessions[].content` shape, just normalized into real rows instead of one embedded tree.
- **`Exercise`** — a small child entity of `ContentVersion`, not an inline object (see §12).
- **`ContentReview`** — every review action taken against a package, preserved as history, not overwritten (§8).
- **`Publication`** — the fact that a specific `ContentVersion` went (or stopped being) live (§9).

`ContentPackage.status` still drives the overall workflow gate exactly as today (Draft/Changes Requested/Approved/Published) — it answers "where is this whole import in the review pipeline," while `Publication` (a separate entity) answers "what is actually live for students right now." Publishing a package is the one operation that touches both: it flips the package's status to `published` **and**, in the same transaction, creates a `Publication` row for every `ContentVersion` it produced while superseding whatever was previously live for those same sessions.

---

## 7. Content Versioning — solving the v1/v2 problem

**Decision: "what is currently live" is answered by a single, indexed query against `Publication` — never by sorting/filtering packages at read time.**

```
Publication
  id
  contentVersionId  → ContentVersion.id
  sessionId         → Session.id            (denormalized for a direct index — a version's session never changes, so this is safe and simplifies the "one live row per session" invariant below)
  publishedByUserId → User.id
  publishedAt
  supersededAt?     — null while this Publication is the live one; set the instant a newer Publication for the same session is created
```

**Invariant:** at most one `Publication` per `sessionId` may have `supersededAt IS NULL` at any time. Publishing a new version for a session is a single atomic operation: create the new `Publication` row, and set `supersededAt = now()` on whichever row previously held the live slot for that `sessionId` — both writes happen together, so there is never a moment where two rows for the same session are simultaneously "live," and never a moment where the answer to "what's live" is ambiguous or dependent on how records happen to be sorted.

Walking through the exact example from the task:

```
Session: Async/Await
  Version 1 → Publication{supersededAt: null}         ← live

  ... time passes, Version 2 authored, reviewed, approved ...

  Publish Version 2:
    Publication(Version 2){supersededAt: null}         ← now live
    Publication(Version 1){supersededAt: <publish time of V2>}   ← superseded, in the same transaction
```

Students only ever read `Publication WHERE sessionId = X AND supersededAt IS NULL` — this is **not** the client-side "sort every published package by timestamp and take the first match" logic the prototype currently depends on (documented in the audit as a fragile, coincidentally-correct rule). It's a direct fact lookup.

---

## 8. Review History

**Decision: preserve full review history. `ContentReview` is append-only — one new row per review action, never an overwritten in-place object.**

```
ContentReview
  id
  packageId       → ContentPackage.id
  reviewerUserId  → User.id (role = content_manager)
  action          — "request_changes" | "approve"
  checklist       { course, structure, sessions, videos, practice, aiHelp, exercises, ready: boolean }  — snapshotted exactly as it was at the moment of this action
  notes
  createdAt
```

**Reasoning (per the task's own preference, and independently justified against MVP needs):**
- This costs *less*, not more, than the prototype's current logic — today, `updatePackageState()` reads the previous review object and selectively overwrites fields; an append-only insert is simpler code, not more code.
- It directly closes a real gap the audit named: today, once a `changes_requested` package is later approved, there is no way to see what the earlier rejection actually said.
- It's exactly the kind of accountability a content-review workflow inherently implies — a Content Team member re-submitting a corrected package benefits from being able to see the exact prior feedback, and so does anyone auditing the process later.
- It does not require any new UI concept — the existing Review screen already displays "checklist + notes"; showing a *history* of these instead of one mutable object is an additive read, not a redesign of the workflow (per instructions, the workflow itself is not being redesigned here — only how it's persisted).

Example from the task, expressed in rows:
```
ContentReview{action: "request_changes", notes: "fix the API error example", checklist: {...}, createdAt: T1}
ContentReview{action: "approve",         notes: "",                          checklist: {...all true}, createdAt: T2}
```
Both rows persist. The package's *current* status is still just `ContentPackage.status` (§6) — `ContentReview` is the "why/how did we get here" trail behind it.

---

## 9. Publication as a first-class entity

Already introduced in §7 — restated here directly against the task's specific questions:

- **Which content version was published:** `Publication.contentVersionId`.
- **When:** `Publication.publishedAt`.
- **By whom:** `Publication.publishedByUserId`.
- **Whether it is currently live:** `Publication.supersededAt IS NULL`.
- **When it was superseded:** `Publication.supersededAt`.

**Why not rely on `status = "published"` alone (as today):** a status field on `ContentPackage` can only ever describe *that package's own* workflow state — it cannot, by itself, express "and this other, older package is now dead because of it." That relationship *between two different packages/versions* is exactly what the current prototype is missing (the audit's headline known limitation), and exactly what a dedicated `Publication` entity — with its own supersession pointer — exists to express.

---

## 10. Student Progress

```
SessionCompletion
  id
  studentId  → User.id
  sessionId  → Session.id
  completedAt
```

- **Uniqueness:** `(studentId, sessionId)` unique — matches the task's expectation exactly.
- **Write semantics — first-completion-wins, matching current behavior exactly:** the prototype's `completeSession()` is a no-op if the session is already marked complete (`if (prev.has(sessionId)) return prev;`) — it does **not** update the timestamp on redo. The backend should preserve this precisely: an insert that's ignored on conflict (the completion timestamp is "when this was first finished," not "when it was last touched").
- **Progress percentage stays derived, never stored** — computed at read time as `count(SessionCompletion joined to a subject's sessions) / count(sessions in that subject)`, exactly as `mock.ts`'s pure functions do today. No percentage field exists anywhere in this table.

---

## 11. Performance

**Recommendation: A — preserve only the latest performance record per session, matching current behavior exactly. Do not build attempt history for performance in this MVP.**

**Reasoning:**
- The current UI never displays historical performance attempts for a session — only ever "the" performance for that session (`Performance.tsx` shows one row per session, from the `performanceRecords` map, which is itself already an overwrite-on-redo structure).
- Building attempt history here would be schema/complexity spent on a capability nothing in the MVP consumes — directly against the "avoid unnecessary complexity" instruction.
- It is a **low-risk deferral, not a dead end**: `ExerciseSubmission` (§12) already proves this exact system handles "every attempt retained" cleanly. If session performance history is ever wanted, the migration is additive (stop overwriting, start appending, add `attemptNumber`) — nothing about today's design blocks it later.

```
SessionPerformance
  id
  studentId  → User.id
  sessionId  → Session.id
  activities  { learning, videoCheck, practice, exercise — same shape as today's SessionActivitiesInput }
  score       — 0-100 or null (never fabricated — matches performance.ts's existing "null when nothing scoreable was completed" rule exactly)
  recordedAt
```
- **Uniqueness:** `(studentId, sessionId)` unique, **upsert** on redo (overwrite `activities`/`score`/`recordedAt`) — matching `recordSessionPerformance()`'s exact current behavior (always overwrites, unlike `SessionCompletion`'s first-wins rule above — this asymmetry already exists in the prototype and is preserved deliberately, not accidentally).
- **Scoring algorithm is not redesigned here** — `score` is computed by the same rules documented in the audit (§10 of that document) and simply persisted as-is.

---

## 12. Exercise Submissions

Kept exactly as audited — every attempt retained, nothing overwritten:

```
ExerciseSubmission
  id
  studentId    → User.id
  sessionId    → Session.id
  exerciseId   → Exercise.id
  language
  files[]      { name, content }
  attemptNumber   — increments per (studentId, sessionId), 1-based, never reused
  submittedAt
```

**Does Exercise need its own entity? Decision: yes — a small, real `Exercise` entity, not an inline blob or a borrowed `sessionId`.**

```
Exercise
  id
  contentVersionId → ContentVersion.id
  objective
  requirements[]
  starterCode?
  language
```

**Why, given today's prototype effectively has one exercise per session:** the audit named this exact spot as a real risk — today, `exerciseId` is *literally* set to `sessionId` at the one call site that creates a submission, meaning "exercise identity" doesn't actually exist yet, it's borrowed. Giving `Exercise` its own id costs one small table and, for now, a guaranteed 1:1 relationship to `ContentVersion` — but it means "one exercise per session" is a fact about **today's content**, not a **constraint baked into the schema**. `ExerciseSubmission.exerciseId` can point at a real, independent row from day one. No multi-exercise UI or workflow is being proposed — only the identity, so a future multi-exercise session doesn't require migrating every historical submission.

---

## 13. Portfolio

```
Portfolio
  id (or reuse studentId as the primary key — it's inherently 1:1)
  studentId  → User.id  (unique — one portfolio per student)
  headline
  bio
  skills     — {category: string, skills: string[]}[]   ← kept as a structured field, NOT normalized (see below)
  linkEmail
  linkedin
  github

PortfolioProject
  id
  portfolioId → Portfolio.id
  title
  description
  technologies[]
  projectUrl
  githubUrl
```

**Skills: decision — keep as a simple structured field on `Portfolio`, do not create `Skill`/`StudentSkill` entities.** Nothing in the current MVP queries, filters, ranks, or aggregates skills across students (no "find students who know React" feature exists anywhere — that's Company/Candidate-Matching territory, explicitly out of scope). Normalizing Skills into their own tables now is complexity spent on a capability with zero current consumer. If cross-student skill search is ever genuinely needed, it's a well-understood, additive migration at that point — not something worth designing speculatively here.

`PortfolioProject` **is** its own child entity (not a JSON blob on `Portfolio`) because it already has real per-item identity in the prototype (`PortfolioProject.id`, generated client-side today) and a natural 1:many shape — no speculation required to justify it.

---

## 14. Admin

**Decision: Admin is `User (role = admin)` plus read access to other domains. No Admin-owned entity exists, and none is proposed.**

This matches the audit's own finding precisely: every current Admin page is a derived read model over Student-owned and Content-Manager-owned tables. The backend queries Admin requires (traced directly to the audit's §17):

- **Dashboard metrics:** `count(User where role=student)`; "active students" (`count(distinct studentId in SessionPerformance)` — the same coarse proxy the prototype uses today, not redefined here); `count(Course)`; `count(Publication where supersededAt IS NULL)` (Published Sessions); `count(ContentPackage where status='draft')` (Awaiting Review); `count(ContentPackage where status='changes_requested')`.
- **Recent activity:** a merged, time-sorted read across `ContentPackage.importedAt`, `Publication.publishedAt`, `ContentReview.createdAt`, and `SessionCompletion.completedAt` — exactly the same *kind* of derived merge the prototype already does client-side, just against real tables. (Whether this eventually deserves a dedicated `AuditEvent` table is decided separately in §16 — it is **not required** for this query to work.)
- **Student list / detail:** reads across `User`, `Enrollment`, `SessionCompletion`, `SessionPerformance`, `ExerciseSubmission`, `Portfolio`/`PortfolioProject` — all scoped by `:studentId`, all tables Student already owns (§2). No copy, no separate Admin-facing table.
- **Content overview / detail:** reads across `Course`/`Subject`/`Session`, `Publication`, and `ContentPackage.status` counts — all tables Content Manager already owns (§15). No copy.

Admin's authorization boundary is simple to state and enforce: **read-only, everywhere, with no exceptions** — matching the confirmed total absence of any mutation control anywhere in the current Admin UI.

---

## 15. Content Manager

**Owns:** `ContentPackage`, `ContentVersion`, `Exercise`, `ContentReview`, `Publication` — write access to all five, as the only role that ever creates/transitions them.

**Does NOT own, and must have no read access to:** `SessionCompletion`, `SessionPerformance`, `ExerciseSubmission`, `Portfolio`/`PortfolioProject` — this matches the audit's confirmed finding that no current Content Manager page imports from any Student-data file. This is a **stricter** boundary than Admin's (which can read but not write Student data) — Content Manager gets neither.

**Authorization boundary, stated plainly:**
- Content Manager role → full read/write on its five owned entities, read/write on `Course`/`Subject`/`Session` **only as a side effect of publishing** (§3) — never a direct, freeform edit capability (there is no content-authoring editor in this MVP, confirmed by the audit).
- Content Manager role → **zero** access, read or write, to any Student-owned table.
- Student role → read-only on `Publication`-resolved current content (§7) and the canonical `Course`/`Subject`/`Session` tables; **zero** access to `ContentPackage`/`ContentVersion`/`ContentReview` for anything not currently published (this is the server-side enforcement the audit's §24 flagged as currently missing — today it's "enforced" only by the client never asking).

---

## 16. Audit / Activity

**Decision: no dedicated `AuditEvent` table is a MUST HAVE for this MVP.** Reasoning: every activity the current Admin dashboard needs (content imported, changes requested, approved, published, student completed a session) is **already representable directly from the domain entities decided above**, once `ContentReview`/`Publication` carry actor fields (§8/§9) and `SessionCompletion`/`ExerciseSubmission` carry timestamps (§10/§12) — which they now do. Building a second, parallel event log that duplicates facts already captured by the entities themselves would be redundant, not additive.

- **MUST HAVE:** nothing further — `ContentPackage.importedAt`/`importedByUserId`, `ContentReview` rows, `Publication.publishedAt`/`publishedByUserId`, and `SessionCompletion.completedAt` together already satisfy every activity type named in the task.
- **SHOULD HAVE:** a lightweight, generic `AuditEvent {id, actorUserId, action, entityType, entityId, at, metadata}` table anyway — useful the moment something needs to be logged that *isn't* naturally a domain entity (login/logout events, failed auth attempts, an Admin viewing a student's detail page, etc.). This is genuinely useful observability infrastructure, but it is not required to reproduce any currently-observed Admin behavior, so it is not promoted to MUST HAVE.
- **FUTURE:** full compliance-grade audit (field-level before/after diffs, immutable/append-only guarantees enforced at the storage layer, retention policies). Not implied by anything in the current MVP.

---

## 17. File Storage

**Normalized content → MUST HAVE. Original ZIP retention → SHOULD HAVE, not a blocker.**

The parsed, normalized data (`ContentVersion`, `Exercise`, etc. — §5/§6) is the load-bearing part of this MVP; the backend cannot function without it and it is not optional. Retaining the original uploaded ZIP is a separate, smaller, genuinely optional-for-launch decision, and this document should not let it gate the core backend.

Today, the prototype parses the ZIP entirely in-browser and **discards the original binary immediately** — only the parsed JSON tree survives. That's a real (not merely theoretical) traceability gap for a production system: the source-of-truth artifact a Content Team uploaded is gone forever the moment it's been read once, with no way to re-process it if the parser changes, no way to hand it back for troubleshooting, and no way to prove exactly what was uploaded. It's worth fixing — just not worth blocking on.

**Recommendation, without choosing a storage vendor:** store the original ZIP as an opaque, content-addressed blob referenced from `ContentPackage` (a stored reference/pointer field — the exact storage mechanism is a technology decision, explicitly deferred). **If whatever backend/storage is ultimately chosen makes this cheap and simple, do it from day one.** If it adds meaningful setup cost relative to the rest of the MVP, it can follow immediately after the core backend ships, without redesigning anything — it's an additive field, not a structural dependency of any other entity in this model.

---

## 18. Final Entity List

### Core MVP entities

| Entity | Owner | Purpose | Required MVP? | Main Relationships |
|---|---|---|:---:|---|
| `User` | Platform | Identity + auth for all three roles | ✅ | root of everything below |
| `Enrollment` | Student | Links a student to a course | ✅ | `User` → `Course` |
| `Course` | Platform-owned (Content Manager is the operational actor, via publishing) | Top of the curriculum hierarchy | ✅ | → `Subject` |
| `Subject` | Platform-owned (Content Manager is the operational actor, via publishing) | Groups sessions | ✅ | `Course` → `Session` |
| `Session` | Platform-owned (Content Manager is the operational actor, via publishing) | One learning unit | ✅ | `Subject` → `Publication`/`ContentVersion` |
| `ContentVersion` | Content Manager | One authored, versioned snapshot of a session's content | ✅ | `Session`, `ContentPackage`, `Exercise` |
| `Exercise` | Content Manager | The exercise belonging to one `ContentVersion` | ✅ | `ContentVersion` → `ExerciseSubmission` |
| `ContentPackage` | Content Manager | One ZIP import event / review workflow instance | ✅ | → `ContentVersion`, `ContentReview` |
| `ContentReview` | Content Manager | One review action (request changes / approve), preserved history | ✅ | `ContentPackage`, `User` (reviewer) |
| `Publication` | Content Manager | The fact that a `ContentVersion` is (or was) live for a `Session` | ✅ | `ContentVersion`, `Session`, `User` (publisher) |
| `SessionCompletion` | Student | "This student finished this session" | ✅ | `User`, `Session` |
| `SessionPerformance` | Student | Latest score/activity breakdown per session | ✅ | `User`, `Session` |
| `ExerciseSubmission` | Student | Every exercise attempt, retained | ✅ | `User`, `Session`, `Exercise` |
| `Portfolio` | Student | Student's self-authored profile | ✅ | `User` (1:1) → `PortfolioProject` |
| `PortfolioProject` | Student | One portfolio project entry | ✅ | `Portfolio` |

### Derived read models (never stored; computed at query time)

| Read model | Computed from |
|---|---|
| Subject/Course progress % | `SessionCompletion` counts vs. session counts |
| Subject/Course performance aggregates | `SessionPerformance` rows |
| "Current live content for a session" | `Publication WHERE sessionId=X AND supersededAt IS NULL` join `ContentVersion` |
| Admin dashboard metrics (student count, active students, published-session count, awaiting-review/changes-requested counts) | Counts/filters over the core entities above — no separate storage |
| Admin recent activity feed | Merged, sorted read over `ContentPackage`/`ContentReview`/`Publication`/`SessionCompletion` timestamps |

### Audit / history entities

| Entity | Status |
|---|---|
| `ContentReview` | Already core (§8) — its append-only nature *is* the review history, no separate table needed |
| `Publication` (superseded rows) | Already core (§9) — a superseded `Publication` row *is* the version history, no separate table needed |
| `AuditEvent` (generic) | **SHOULD HAVE**, not required for MVP — see §16 |

### Future entities (explicitly not built now)

| Entity | Why deferred |
|---|---|
| `StudentProfile` / `ContentManagerProfile` / `AdminProfile` | No field exists today that `User` doesn't already cover (§1) |
| `Skill` / `StudentSkill` (normalized) | No current consumer queries/filters by skill (§13) |
| `AuditEvent` | See §16 — genuinely useful, not currently required |
| Anything Company/Hiring-shaped | Explicitly out of MVP scope |
| Multi-exercise-per-session workflow/UI | `Exercise` entity already accommodates it structurally (§12); no UI/workflow for it exists or is proposed |

---

## 19. Final Relationship Diagram

```
User (role: student)
  ├── Enrollment ──────────────────► Course
  ├── SessionCompletion ──────────► Session
  ├── SessionPerformance ─────────► Session
  ├── ExerciseSubmission ─────────► Session, Exercise
  └── Portfolio (1:1)
        └── PortfolioProject (0..*)

User (role: content_manager)
  └── ContentPackage
        ├── ContentVersion (0..*) ──► Session
        │     └── Exercise (0..1)
        ├── ContentReview (0..*, history — actor: User)
        └── Publication (created at publish time, actor: User)
                ├── points at → ContentVersion
                └── points at → Session
                     (at most one non-superseded Publication per Session — see §7)

User (role: admin)
  └── (no owned entities — read-only across everything above)

Course
  └── Subject
        └── Session
              └── Publication (current) ──► ContentVersion ──► Exercise
              └── Publication (superseded, 0..*) ──► ContentVersion (history)
```

This corrects the task's illustrative sketch in two ways the audit demanded: (1) `Session` connects to its live content through `Publication`, not directly to a "ContentVersion" that could ambiguously be one-of-many; and (2) Content Manager's review/publish trail is explicitly historical (`ContentReview` append-only, `Publication` supersession-tracked), not a single mutable status field.

---

## 20. Critical Decisions — explicit answers

1. **Canonical Course/Subject/Session model:** one platform-owned set of tables (§3); Content Manager is the operational actor that populates/updates them today, only via the publish pipeline — never embedded in packages, never hardcoded in app code. Display fields always reflect "as of last publish," so draft/review changes never leak to students. Ownership stays with the platform (not Content Manager) specifically so a future Admin curriculum capability wouldn't require re-homing these entities — no such capability is proposed now.
2. **Do we need Enrollment?** Yes (§4) — required the moment the backend supports more than one student, which it must from day one.
3. **Relationship between Session and ContentVersion:** one `Session` has many `ContentVersion`s over time (its full authored history); exactly one is "current" at any moment, determined by `Publication` (§5/§7), never by an unversioned "SessionContent" table.
4. **How is the current published version identified?** The `Publication` row for that `sessionId` with `supersededAt IS NULL` (§7/§9) — a direct, indexed lookup, not a sort.
5. **How is old content marked superseded?** The previous live `Publication`'s `supersededAt` is set atomically, in the same transaction that creates the new live `Publication` (§7).
6. **Do we preserve review history?** Yes — `ContentReview` is append-only, one row per action, never overwritten (§8).
7. **Do we preserve performance history?** No, for MVP — latest-only, upserted, matching current UI/behavior exactly; deferred, not blocked, for later (§11).
8. **Does Exercise need its own entity?** Yes — a small, real entity with its own id, currently always 1:1 with a `ContentVersion`, so future multi-exercise support doesn't require migrating historical submissions (§12).
9. **Does Portfolio need separate Project entities?** Yes, `PortfolioProject` is a real child entity (it already has real identity today). Skills stays a simple structured field, not normalized (§13).
10. **Do we need an AuditEvent table for MVP?** No — not required; every needed activity is already reconstructible from the core entities once actor fields exist on `ContentReview`/`Publication`. Recommended as a **SHOULD HAVE** for later, not a blocker now (§16).
11. **Do we retain original Content ZIPs?** Recommended, but a **SHOULD HAVE, not a MUST HAVE** — the normalized parsed data (`ContentVersion`, `Exercise`, etc.) is the required, load-bearing piece; original-ZIP retention is additive provenance that can ship on day one if the chosen storage makes it cheap, or immediately after, without blocking or redesigning the core backend (§17).
12. **Which entities are absolutely required before backend implementation begins?** The full "Core MVP entities" table in §18 — `User`, `Enrollment`, `Course`, `Subject`, `Session`, `ContentVersion`, `Exercise`, `ContentPackage`, `ContentReview`, `Publication`, `SessionCompletion`, `SessionPerformance`, `ExerciseSubmission`, `Portfolio`, `PortfolioProject`. Nothing in the "Future" list blocks starting implementation.

---

## Frozen Decisions Summary

This domain model is **approved and frozen** as of this revision. The table below is the at-a-glance reference; every row is fully specified in the sections above and does not need to be re-litigated before technology selection begins.

| Area | Decision |
|---|---|
| Users | Single `User` + `role` |
| Students | N students from day one |
| Enrollment | Yes |
| Course → Subject → Session | Canonical, platform-owned hierarchy |
| Session content | `ContentVersion` (no separate SessionContent entity) |
| Draft content | Never visible to students |
| Review | Append-only history (`ContentReview`) |
| Publication | First-class entity |
| Old publication | Explicitly superseded (`supersededAt`), set atomically |
| Progress | Per student/session (`SessionCompletion`), derived percentages |
| Performance | Latest only for MVP |
| Exercise submissions | Every attempt retained |
| Exercise | Own entity |
| Portfolio | `Portfolio` + `PortfolioProject` |
| Skills | Structured field, not separate tables |
| ContentVersion internals (concepts/examples/video/practice/aiHelp/delivery) | Structured JSON fields, not normalized into per-element tables |
| Admin | Read-only, no owned entities |
| AuditEvent | Not required for MVP (SHOULD HAVE later) |
| Original ZIP | SHOULD HAVE — day-one if cheap, otherwise immediately after core backend |
| Company/Hiring | Out of MVP |

**Next step:** Backend Architecture & Technology Selection — stack, database, authentication approach, file storage, and hosting, chosen against this frozen model and the business constraints already established, not selected first and fit to afterward. Not started in this document.

---

## 21. Technology

No database engine, backend framework, hosting provider, or auth library is chosen in this document, per instructions. Everything above is expressed conceptually (entities, relationships, invariants) so that choice can be made independently, after this model is reviewed and approved.

---

## 22. Validation

No application code was modified to produce this document. Per instructions, only the following were run to confirm nothing changed:

```
tsc -b --noEmit   → pass
npm run build     → pass
```

---

*This document is a design artifact only. No backend, database, table, or framework was implemented. Stopping here for review, as instructed.*
