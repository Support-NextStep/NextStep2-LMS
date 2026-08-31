# NEXTSTEP² — Frontend ↔ Backend Data Contract Audit (Final)

**Status:** Final. Pure audit/documentation — no application code was changed to produce this document.
**Scope:** all 25 areas requested — Student, Content Author, Content Reviewer, Admin, Authentication/role isolation, Courses, Subjects, Sessions, Session content, Content versions, DOCX authoring/extraction, Video, Video checkpoints, Practice, Exercise, Exercise submissions, AI Help, Student progress, Performance, Portfolio, Review/approval/publishing, Version replacement, File/assets requirements, current localStorage/mock data, synthetic IDs/prototype assumptions.
**Method:** every fact below was verified directly against the current `app/src` codebase (as of Video Checkpoint Slice 2, the most recently approved feature work). The frozen `NEXTSTEP2_BACKEND_DOMAIN_MODEL.md` and the other design docs (`NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md`, `NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md`, `NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md`, etc.) are used only as the source of truth for *intended* domain behavior — this document does not redesign, re-decide, or silently amend anything they already settled. Where current code and a design doc disagree, or where something is genuinely unclear, it is flagged explicitly (see **Contradictions** and **Open Decisions** near the end) rather than resolved.
**Out of scope:** Company/Hiring (per every prior MVP task in this project) — mentioned only where its isolation pattern or a storage key needs to be accounted for, never analyzed in depth.
**Supersedes:** an earlier draft of this same filename, written before the Content Manager role was split into Content Author + Content Reviewer and before the Video Checkpoint System's two slices landed. This version reflects the current codebase exactly; do not use the prior version as a reference.

---

## How to read this document

Every data object gets, wherever applicable: current frontend type/model, current storage location, current owner, current read operations, current write operations, future persisted entity/concept (mapped to the frozen domain model), whether it is immutable or mutable today, whose data it is (student-owned / author-owned / reviewer-owned / system-owned), and whether the backend must enforce a rule around it. "Today" always means this prototype, `localStorage`-only, no server.

---

## Cross-cutting fact: there is still no real authentication anywhere

This is unchanged since the domain model was frozen, and now spans **four** roles instead of three:

- **Student** (`Login.tsx`): validates form input client-side, waits 700ms, navigates to `/dashboard`. Creates no session, writes nothing to `localStorage`. `StudentLayout.tsx`'s logout literally just navigates back to `/login` — its own comment says "Mock auth — no real session to invalidate." Every student route is reachable with zero authentication gate.
- **Content Author** (`ContentLogin.tsx`): accepts any email/password, manufactures a display name from the email's local-part (`deriveContentAuthorName`), stores `{name, email}` in `localStorage["nextstep2:contentAuthorAccount"]`. No password stored or checked anywhere. Gated by `useRequireContentAuthorAccount()` on every `/content/*` page.
- **Content Reviewer** (`ReviewLogin.tsx`): identical pattern, its own key `nextstep2:contentReviewerAccount`, its own hook `useRequireContentReviewerAccount()`. A Content Author session does **not** satisfy this guard and vice versa — verified both in code (two separate hooks reading two separate keys) and in `tests/contentRoleSeparation.spec.ts`.
- **Admin** (`AdminLogin.tsx`): identical pattern, key `nextstep2:adminAccount`, hook `useRequireAdminAccount()`.

**So today:** Student = no gate at all; Content Author, Content Reviewer, and Admin = a client-side "is this exact `localStorage` key present" check, with no real credential verification, no token, no expiry, no server round-trip. Opening devtools and hand-writing any of these four keys grants that role's UI instantly. **Every "Auth requirement: yes" / "Authorization requirement" cell below means a real backend mechanism must be introduced, not that an existing one needs replacing.**

---

## 1. Student

| Screen | Data read | Data written | Current source | Future entity | Auth today | Authorization today |
|---|---|---|---|---|---|---|
| Login (`Login.tsx`) | none | none | n/a | `User` (role=student) | This screen *is* the auth step — authenticates nothing | n/a |
| Dashboard (`Dashboard.tsx`) | `STUDENT.name`, `COURSE` (`mock.ts`), `useCourseData()` | none | `nextstep2:completedSessionIds` | `Student`, `Enrollment`, `Course`, `Subject`, `Session`, `SessionCompletion` | Not enforced | Must see only own progress |
| My Course (`MyCourse.tsx`) | same as Dashboard | none | same | same | Not enforced | same |
| Subject (`SubjectPage.tsx`) | `useCourseData().subjects/getSubjectDetail`, `getSessionDelivery()` | none | `completedSessionIds` + hardcoded `SESSION_DELIVERY` map | `Subject`, `Session`, `SessionCompletion`, delivery/schedule entity | Not enforced | Must see only own enrolled course |
| Session (`SessionPage.tsx` + `SessionWorkspace.tsx`) | `getSessionContext()`, `getSessionContent()` (published → curated → generated fallback), `getSubmissionsForSession()` | `completeSession()`, `recordSessionPerformance()`, `createSubmission()` | `completedSessionIds`, `performanceRecords`, `exerciseSubmissions`, `contentPackages`/curated `sessionContent.ts` | `ContentVersion` (read), `SessionCompletion`, `SessionPerformance`, `ExerciseSubmission` (write) | Not enforced | Must only complete/submit for own enrolled sessions |
| Performance (`Performance.tsx`) | `useCourseData()` → `performanceRecords`, `getSubjectPerformance`, `getCoursePerformance` | none | `performanceRecords` | `SessionPerformance` | Not enforced | Own data only |
| Portfolio (`Portfolio.tsx`) | `loadPortfolio(STUDENT.name)` | `savePortfolio()` — full overwrite | `nextstep2:portfolio` | `Portfolio`, `PortfolioProject` | Not enforced | Own data only |
| Portfolio View (`PortfolioView.tsx`) | `portfolioDemoContent.ts` (everything except Education) + `useCourseData()` (Education only) | none | see finding below | same | Not enforced | n/a (public-facing page concept, not built) |

**Confirmed-still-true findings from the prior audit** (all re-verified against current code, unchanged):
- **`PortfolioView.tsx` renders fabricated demo content, not the student's real portfolio.** Only "Education" reads real data (`useCourseData()`); Profile/About/Skills/Projects/Achievements/Contact all come from `portfolioDemoContent.ts` verbatim. The file's own header calls this out explicitly.
- **No real code evaluation exists anywhere.** `ExerciseSubmission` is "what was turned in," permanently ungraded.
- **`STUDENT`/`COURSE`** (`mock.ts`) are single hardcoded constants standing in for "the logged-in student" / "the one course" — referenced directly (not through any session) by `SessionPage.tsx`, `Portfolio.tsx`, `Performance.tsx`, `AdminStudents.tsx`, `AdminStudentDetail.tsx`, `exerciseSubmissions.ts`.

**New finding since the last audit — Practice's Self-Check checklist is now authored, persisted, and converted through the entire pipeline, but is dead data at runtime.** As part of the Student Session UI Cleanup, the Practice tab in `SessionWorkspace.tsx` no longer renders any Self-Check UI at all (confirmed: the "practice" workspace view only shows task + starter code + the OneCompiler embed). `handleCompleteSession()` now hardcodes `practice: { completed: practiceViewed, passedCount: 0, totalCount: 0 }` regardless of what `content.practice.checklist` actually contains — the comment in the code says so directly ("No Self-Check anymore, so nothing here is scoreable"). Yet `content.practice.checklist` is still: authored via the Practice document's Self-Check section (`docxParser.ts`'s `extractPracticeContent`), carried on `AuthoredSessionDraft.practice.selfCheck`, written into `ContentSessionContent.practice.checklist` (`authoredSession.ts`), and converted into `SessionContent.practice.checklist` with every item hardcoded `passed: true` (`toPreviewSessionContent()`). **Nothing downstream ever reads it for scoring any more.** This checklist is genuinely inert — a Content Author can spend real effort authoring Self-Check items that a student never sees and that never affect anything.

**Sharper version of a previously-known finding — the on-screen "Performance %" and the persisted score now disagree even more than before.** `SessionWorkspace.tsx`'s Complete screen still computes and displays `performancePercent = Math.round((practicePercent + checkpointPercent) / 2)`, where `practicePercent` is still derived from `content.practice.checklist`'s pass ratio (the same now-dead-elsewhere data described above) and `checkpointPercent` is `videoCheckCorrect ? 100 : 50`. Meanwhile the *persisted* `SessionPerformanceRecord.score` (`performance.ts`'s `calculateSessionScore`) only ever factors in `videoCheck.correct` — `practice` never contributes a score because `totalCount` is now always hardcoded to `0` (see previous finding), and `calculateSessionScore` correctly guards `totalCount > 0` before scoring Practice. So: the checkpoint/video-check half of these two formulas is now **unified** (both read the same `videoCheckCorrect` value, a genuine improvement from Video Checkpoint Slice 2) — but the Practice half now diverges **more** than before: the on-screen number still reacts to the (dead, always-`true`-for-authored-content) checklist, while the persisted number ignores Practice entirely. A student can see one "Performance: 100%" on the Complete screen and have a different, lower number land in their actual `SessionPerformanceRecord`.

---

## 2. Content Author

Route namespace `/content/*`, shell `ContentAuthorLayout.tsx`, nav = Dashboard / Courses / My Submissions. Owns creating and preparing content; **never** approves, publishes, or requests changes (verified structurally: `ContentPackageDetail.tsx`'s `role="author"` branch renders no such controls, and the only write path that can change `status`/`review` — `saveReview()` — is gated `if (!pkg || !isReviewer) return;`).

| Screen | Data read | Data written | Current source | Future entity |
|---|---|---|---|---|
| Dashboard (`ContentDashboard.tsx`) | `loadContentPackages()` (all statuses' counts), `listCourses()` | none | `nextstep2:contentPackages` | `ContentPackage` |
| Courses (`ContentCourses.tsx`) | `listCourses()`, `resolveSessionStatuses()` | none | `mock.ts` (hardcoded) + `contentPackages` | `Course` |
| Course detail (`ContentCourseDetail.tsx`) | `listCourses()`, `listSubjectSummaries()`, `resolveSessionStatuses()` filtered | none | same | `Subject` |
| Subject detail (`ContentSubjectDetail.tsx`) | `listSessionSummaries()` (curated/generated) merged with any session only a package knows about, `resolveSessionStatuses()` | "Add Session" navigates into authoring with a client-`slugifyTitle()`-derived id — no persistence here itself | `mock.ts` + `contentPackages` | `Session` |
| Session Authoring (`ContentSessionAuthoring.tsx` + `authoredSession.ts`) | `loadDraftForSession()` — resumes only `draft`/`changes_requested`; else `createEmptyDraft()` even if an approved/published package already exists | `saveDraft()` → `upsertPackageRecord()` → same `nextstep2:contentPackages` key | `nextstep2:contentPackages` | `ContentPackage`, `ContentVersion` |
| Submit for Review | `canSubmitForReview(draft)` (client-computed) | `saveDraft()`, navigate to `/content/submissions/:id` — status stays `"draft"`, which **is** "awaiting review" | same | workflow transition |
| My Submissions (`ContentSubmissions.tsx`) | `loadContentPackages()` — every package, unfiltered by author identity | none | same | `ContentPackage` list, scoped by `importedBy` in a real backend |
| Submission status (`ContentPackageDetail.tsx`, `role="author"`) | `getContentPackage(id)` | none (read-only for this role) | same | `ContentPackage.review` (read) |
| Preview (`ContentPreviewSession.tsx`, `role="author"`) | `findSessionInPackage()`, `toPreviewSessionContent()` | none — `handleCompleteSession`/`handleSubmitExercise` are explicit no-ops/in-memory only | in-package data only | n/a — never touches student records |

**Findings:**
- **`ContentSubmissions.tsx` shows every package in the store, not just this Content Author's own.** There is no per-author filter anywhere — `loadContentPackages()` returns the full flat array. This is only "correct" today because there is exactly one Content Author account possible per browser; a real multi-author backend must scope this by `importedByUserId`.
- **Session ids for new sessions are still client-generated via `slugifyTitle()`, with no uniqueness check** — two Content Authors independently titling a session "Async Basics" in the same subject would silently collide on the same id (unchanged from the original audit's finding, still true).
- **YouTube URL format is still never validated anywhere** in the authoring workspace (only client-side "does this look parseable enough to build a preview iframe" — no author-facing error at any point in the pipeline). Confirmed by re-reading `VideoPanel` in `ContentSessionAuthoring.tsx`: an invalid URL only produces `<p>This doesn't look like a valid YouTube URL yet.</p>` under the optional Preview button; it never blocks Save/Submit.
- **Two authored fields are silently discarded and never reach the student**, confirmed in code:
  - `AuthoredSessionDraft.prerequisites` (Session Information panel) is never read by `buildContentSessionContent()` — it has no corresponding field in `ContentSessionContent` at all.
  - `AuthoredSessionDraft.video.description` is captured in the Video panel but `buildContentSessionContent()` writes only `{ youtubeUrl, title }` into `ContentSessionContent.video` — the description never survives.
  - `AuthoredSessionDraft.estimatedDuration` *does* survive into `ContentSessionContent.estimatedDuration` (per `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md`'s contract), but `toPreviewSessionContent()` (`contentPackages.ts`) never copies it into `SessionContent` — so it is authored, packaged, reviewed, and published, and then dropped at the very last conversion step before a student would ever see it. Neither Preview nor the real Student Session ever displays an estimated duration anywhere.

---

## 3. Content Reviewer

Route namespace `/review/*`, shell `ContentReviewerLayout.tsx`, nav = Dashboard / Pending Review / Changes Requested / Approved / Published. Owns reviewing, requesting changes, approving, and publishing; **never edits authored source content** (verified structurally: `ContentPackageDetail.tsx` never exposes any of the source-content fields to either role — it only ever renders a read-only tree of course/subject/session titles plus the checklist/notes; the only place source content can be edited at all is `ContentSessionAuthoring.tsx`, which the Content Reviewer has no route to and no account that would pass `useRequireContentAuthorAccount()`).

| Screen | Data read | Data written | Current source | Future entity |
|---|---|---|---|---|
| Dashboard (`ReviewDashboard.tsx`) | `loadContentPackages()`, filtered/counted per status | none | `nextstep2:contentPackages` | `ContentPackage` |
| Queue screens (`ReviewQueue.tsx`, 4 statuses) | `loadContentPackages()` filtered by one status | none | same | same |
| Review workstation (`ContentPackageDetail.tsx`, `role="reviewer"`) | `getContentPackage(id)` | `saveReview(status)` → `updatePackageState()` — **full record replace** of `status` + `review: {checklist, notes, reviewedAt, approvedAt, publishedAt}` | same | `ContentPackage.review`, `ContentReview` (domain model wants append-only history — see §21) |
| Preview (`ContentPreviewSession.tsx`, `role="reviewer"`) | any status with usable `courses` data — not restricted to `draft` (a Reviewer must be able to preview at any review stage) | none | in-package data only | n/a |

**Findings (all still true, re-verified against current code):**
- **"Every checklist box ticked" is the only gate before Approve, enforced only by a disabled React button** (`handleApprove()` checks `allChecked` client-side; nothing at the data layer stops a direct `updatePackageState()` call — or a hand-edited `localStorage` value — from setting `status: "approved"` with an empty checklist).
- **Publish has no server-side transition guard.** `saveReview("published")` performs the write unconditionally; the Publish button only *renders* inside the `isApproved` UI branch. A `draft` or `changes_requested` package could be published directly by calling `saveReview` from outside the rendered UI.
- **Reviewing a package does not update the authoring draft's own embedded copy of its status.** `saveReview()` spreads `...pkg` and overwrites only the top-level `status`/`review` — the nested `pkg.authoring.status` (the `AuthoredSessionDraft`'s own `status` field, embedded verbatim inside the record via `toPackageRecord()`) is never touched and goes stale immediately. Nothing currently reads that nested copy for anything real (`resolveSessionStatuses`, `getPublishedSessionContent`, `findResumableAuthoredPackage` all read the top-level field), so nothing is functionally broken — but the record genuinely carries two copies of "this package's status," kept in sync only because one of them is simply never read again.
- **No distinction between "the author" and "the reviewer" at the data layer.** Any Content Reviewer account can approve/publish any package regardless of who authored it — this is by product design (separate roles, not separate reviewer identities), but a real backend must still record *which* reviewer took each action (`review.publishedAt`/`approvedAt` have no accompanying `publishedByUserId`/`approvedByUserId` field today, only a timestamp).

---

## 4. Admin

Route namespace `/admin/*`, shell `AdminLayout.tsx`, nav = Dashboard / Students / Content. Every Admin page is read-only by construction — verified in the app's own test suite (`adminFlow.spec.ts`: no `<input>`/`<textarea>`, no Edit/Save controls anywhere in Admin).

| Screen | Data read | Data derived | Current source |
|---|---|---|---|
| Dashboard (`AdminDashboard.tsx`) | `useCourseData()` → `performanceRecords`; `getAllStudentIds()`; `loadContentPackages()`; `resolveSessionStatuses()` | `studentsCount` (always 1), `activeStudentsCount` (crude: nonzero iff any performance record exists), `coursesCount` **hardcoded to `1`** directly in the component, `publishedSessionsCount`, `draftPackageCount`, `changesRequestedPackageCount`, a merged/sorted `recentActivity[]` (package + performance timestamps, capped to 8) | `contentPackages` + `performanceRecords` |
| Students (`AdminStudents.tsx`) | `getAllStudentIds()`, `STUDENT.name`/`COURSE.title`, `useCourseData()` | per-row `progressPercent`, `averageScore`, `lastActivityAt`; `email` hardcoded `null` for every row | same, through `adminStudents.ts`'s single-student adapter |
| Student Detail (`AdminStudentDetail.tsx`) | `STUDENT.name`/`COURSE.title`; `useCourseData()`; `loadPortfolio(STUDENT.name)`; `getAllSubmissions()` | totals, sorted records | `getAllSubmissions()` returns **every** submission across the whole app, unfiltered — correct only because there is exactly one student |
| Content overview (`AdminContent.tsx`) | `resolveSessionStatuses()` — the exact same function the student-facing publish resolution uses, so Admin can never disagree with what students see | per-course rollup (`subjectCount` via `Set`, `sessionCount`, per-status counts) | `contentPackages` |
| Content detail (`AdminContentDetail.tsx`) | `resolveSessionStatuses()` filtered by `courseId` | per-subject grouping, per-session status + timestamp label | same |

**Findings (re-verified):**
- **"This student roster" is not a data model — it's a one-student adapter.** `adminStudents.ts`'s own header says so; `getAllStudentIds()` always returns a one-element array; `ADMIN_STUDENT_ID` is `slugify(STUDENT.name)`, a display name turned into an id, not a real account id.
- **`coursesCount = 1` is hardcoded directly in `AdminDashboard.tsx`**, with an inline comment acknowledging it.
- **New minor finding — stale role-name copy.** `AdminContent.tsx`'s subtitle still reads *"Review, approve, and publish happen in Content Manager."* — a leftover from before the Content Manager → Content Author/Content Reviewer split. Harmless (informational text only, no functional dependency), but factually wrong today: review/approve/publish happen in the **Content Reviewer** workspace, not any screen called "Content Manager" (that name no longer exists anywhere in the running app).

---

## 5. Authentication and role isolation

Covered in depth in the cross-cutting section above and §§1–4. Summary of what a real backend must introduce, precisely:

| Role | Today | Must become |
|---|---|---|
| Student | No gate at all | Real session (token/cookie), scoping every read/write to the authenticated student's id |
| Content Author | `localStorage["nextstep2:contentAuthorAccount"]` presence check | Real credential check + role claim `content_author` (or equivalent) |
| Content Reviewer | `localStorage["nextstep2:contentReviewerAccount"]` presence check | Real credential check + role claim `content_reviewer` |
| Admin | `localStorage["nextstep2:adminAccount"]` presence check | Real credential check + role claim `admin`, read-only enforced server-side (not just UI) |

**Isolation that *is* already correctly modeled today** (verified in `tests/contentRoleSeparation.spec.ts` and `tests/appShellLayout.spec.ts`, and by inspecting the actual guard hooks): the four accounts are stored under four entirely separate keys, checked by four entirely separate hooks, with no shared state — a Content Author session literally cannot satisfy the Content Reviewer's guard and vice versa, and refreshing one role's tab never disturbs another role's tab. **This is a correctly-shaped foundation for real multi-role auth** — the backend work is "make the credential check real and put a server behind it," not "redesign how roles are kept apart."

**Isolation the backend must additionally enforce that the frontend currently cannot:**
- A Content Author's write access must be scoped to packages they authored (today: none of them are scoped at all).
- A student's read access to `ContentVersion`/`ContentPackage` must be limited to `Publication`-resolved current content only — never anything in draft/review/approved state. Today this is "enforced" only by the client simply never constructing a request for anything else; nothing stops a crafted request.
- Every write claiming to belong to "a student" (completions, performance, submissions, portfolio) must derive `studentId` from the authenticated session, never a client-supplied value — today every one of these functions takes the id as a plain parameter (`STUDENT.name`, verbatim) with no verification at all.

---

## 6–9. Courses / Subjects / Sessions / Session Content

These four are tightly coupled in the current implementation and are documented together, per data object.

### Course / Subject / Session structure

| | |
|---|---|
| Current type | `mock.ts`: `COURSE` (one hardcoded object), `SUBJECTS_BASE` (6 hardcoded subjects), `SUBJECT_SESSIONS` (curated sessions for exactly one subject, `frontend-development`) or `buildDefaultSessions()` (4 generated placeholder sessions per subject with no curated list) |
| Current storage | Hardcoded in application code — not persisted, not editable through any UI |
| Current owner | Nobody edits this at runtime. Content Author's authoring workspace can only *target* one of these existing ids (via `listCourses()`/`listSubjectSummaries()`/`getSubjectSummary()`) or introduce a brand-new session id via "Add Session" — it can never create a new Course or Subject |
| Read | `listCourses()`, `listSubjectSummaries()`, `getSubjectSummary()`, `listSessionSummaries()` (Content Author); `getSubjects()`, `getSubjectDetail()`, `getSessionContext()` (Student, status-annotated) |
| Write | None — this data is compiled into the app |
| Future entity | `Course`, `Subject`, `Session` — platform-owned per the frozen domain model §3, created/updated only as a side effect of publishing |
| Mutable? | Effectively immutable at runtime (source-code constant) |
| Ownership | System-owned (compiled constant) |
| Backend must enforce | The entire "publish creates/updates the canonical row" mechanism described in the domain model §3 does not exist yet — today a session's *display* title/description shown to the Content Author (`ContentSubjectDetail.tsx`'s row) reflects the **draft/package's own** title/description the moment one exists, not "as of last publish" as the domain model requires. This is a genuine gap: the domain model's isolation guarantee (draft renaming never leaks) is not yet implemented anywhere in the frontend's session-listing logic — the closest equivalent to a leak exists precisely in `resolveSessionStatuses()`, whose `sessionTitle`/`sessionDescription` come from **whichever package record currently "wins,"** including a `changes_requested` one, not only a published one. Today this only affects the Content Author's/Admin's own internal views (never the real Student route, which resolves content independently via `getSessionContent()`), so no student-facing leak exists — but it is worth flagging precisely because the domain model's stated rule ("draft/review changes never touch these tables until Publish") is not something the current code path actually implements; it is only true by coincidence, because nothing has yet built the canonical-table write step at all.

### Session Content

| | |
|---|---|
| Current type | Two parallel shapes, bridged by one conversion function: `ContentSessionContent` (`contentPackages.ts`, the authored/reviewed/published shape) and `SessionContent` (`sessionContent.ts`, what `SessionWorkspace.tsx` actually renders) |
| Current storage | `ContentSessionContent` lives inside `ContentPackageRecord.courses[].subjects[].sessions[].content`, in `nextstep2:contentPackages`. `SessionContent` is never stored — it's produced at read time by `toPreviewSessionContent()` (from a package) or resolved directly from the hardcoded `SESSION_CONTENT` map / `buildDefaultSessionContent()` (`sessionContent.ts`) |
| Current owner | Content Author writes `ContentSessionContent`; nobody writes `SessionContent` directly |
| Read | `getSessionContent(sessionId, fallback, courseId, subjectId)` resolves, in order: **(a)** live published package content via `getPublishedSessionContent()`, else **(b)** a curated `SESSION_CONTENT[sessionId]` entry (today: exactly one, `components-and-state`), else **(c)** `buildDefaultSessionContent()` |
| Write | `saveDraft()` (author) → `upsertPackageRecord()`; publish transition (reviewer) → `updatePackageState()` |
| Future entity | `ContentVersion` per the domain model §5 — no separate "SessionContent" entity, exactly as decided there |
| Mutable? | A given `ContentPackageRecord`'s content is mutated in place while `draft`/`changes_requested` (every `saveDraft()` call overwrites); the domain model requires `ContentVersion` rows to become **immutable once created**, which is not true of today's `ContentPackageRecord` (a Content Author can keep editing the same record's content indefinitely while it's resumable) |
| Ownership | Content Author-owned while unpublished; becomes read-only, system-served content the moment it's published |
| Backend must enforce | Immutability of a published version; "only published is visible to students" (already true today by construction — `getPublishedSessionContent()` filters `status === "published"` — but only because the client chooses to filter, not because the server refuses to serve anything else) |

**Confirmed-resolved-since-domain-model finding:** the domain model's §5 already anticipated `delivery` should be "folded into `ContentVersion`, correcting a real prototype gap" where live/recorded delivery lived in a separate hardcoded map. **This has not happened** — `SESSION_DELIVERY` (`sessionContent.ts`) is still a completely separate hardcoded map, still disconnected from the Content Package pipeline, still with its one entry's fixed calendar date (`routing-and-forms`, `2026-08-25T10:00:00.000Z`) that will simply become "in the past" over time. `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md`'s own comment in `contentPackages.ts` confirms this is intentional for now ("delivery is intentionally not part of the authoring contract — see §23"), so this is a known, accepted gap rather than an oversight — flagged here so the backend design doesn't assume it was already closed.

---

## 10. Content Versions

| | |
|---|---|
| Current type | No explicit version number, no `supersedes`/`previousVersionId` field anywhere. "A new version" is simply a brand-new `ContentPackageRecord` (new synthetic id) targeting the same `(courseId, subjectId, sessionId)` |
| Current storage | `nextstep2:contentPackages` — one flat array holding every version of every session ever authored, forever |
| Read | `resolveSessionStatuses()` and `getPublishedSessionContent()` both scan the **entire flat array** on every call and reduce it to "which record currently represents this (course, subject, session)," using a status-rank + most-recent-timestamp rule (`lastTouchedAt()` = `publishedAt ?? approvedAt ?? reviewedAt ?? importedAt`) |
| Write | A "new version" write is just `upsertPackageRecord()` with a new id — nothing marks the old record as superseded; both simply continue to exist and the read-time reduction picks a winner |
| Future entity | `ContentVersion` + `Publication`, with the atomic supersession the domain model §7 requires |
| Mutable? | Each individual record is mutable while resumable (see §9 above); the *version history as a whole* has no immutability or supersession guarantee at the data layer — it's a read-time convention only |
| Backend must enforce | The domain model's entire §7 invariant ("at most one `Publication` per `sessionId` may have `supersededAt IS NULL`, set atomically") does not exist today. Today's "current version" is a *derived, sorted guess*, not a stored fact — this is the single largest structural gap between the current implementation and the frozen domain model, and it is already correctly identified as such in that document ("a fragile, coincidentally-correct rule") |

**Verified exact behavior of `findResumableAuthoredPackage()`:** only ever resumes a `draft`/`changes_requested` record for the same `(courseId, subjectId, sessionId)` — an approved/published record is deliberately never returned, so re-opening a published session's authoring workspace always starts a genuinely fresh draft rather than mutating the live record. This is the one place today's code *does* correctly implement "never edit a live version in place" — but it is a client-side lookup convention, not a data-layer guarantee (nothing prevents a direct `upsertPackageRecord()` call with the live record's own id from overwriting it in place).

---

## 11. DOCX authoring/extraction

| | |
|---|---|
| Current type | Real, deterministic, heading-based extraction — `docxParser.ts`. Never AI, never a heuristic guess from visual formatting; a paragraph is a heading only because its XML says so (`Heading1`/`Heading2` style ids, matched case/whitespace-insensitively). Implements `NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md` §9's strict-template-parsing decision exactly |
| Current storage | The file itself is never persisted or uploaded anywhere — parsed entirely client-side (unzipped via `jszip`, `word/document.xml` read via the browser's native `DOMParser`) and discarded immediately after extraction. Only the extraction *result* is kept, folded into the relevant `AuthoredSessionDraft` section |
| Read | An uploaded `File`, in-browser only — there is no upload endpoint |
| Write | Extraction result merges into the draft, then persists via the normal `saveDraft()` path |
| Validation | Entirely client-side, entirely about the **document container** (`.docx` extension, ≤5MB, does the required `Heading1` section exist) — never about the *content's* correctness. Four independent extractors exist: Learning Content, Practice, Exercise, AI Help — each requires its own named `Heading1` section (`LEARNING CONTENT`, `PRACTICE`, `EXERCISE`, `AI HELP`) and fails with a specific, human-readable error if missing |
| Future entity | Same `ContentVersion`/`Exercise` fields the extraction populates — no separate "uploaded document" entity exists or is required for parsing itself |
| Backend consideration (explicitly still open per the domain model and `NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md` §9) | Whether a production backend should retain the original `.docx` for audit trail / re-processing, or accept the current design's "parse once, discard the source" behavior, is an **open decision**, not resolved by this audit or by the domain model (which addresses only the analogous question for the retired ZIP transport, §17 — "SHOULD HAVE, not a MUST HAVE" — and does not explicitly re-examine it for the current `.docx`-based transport) |

---

## 12. Video

| | |
|---|---|
| Current type | `SessionContent.video?: { youtubeUrl, title }` (student-facing, `sessionContent.ts`); `ContentSessionContent.video?: { youtubeUrl, title, durationSeconds? }` (authored, `contentPackages.ts` — note `durationSeconds` is declared on the authored type but nothing ever sets it: `buildContentSessionContent()` never populates it, and no authoring UI field exists for it); `AuthoredCheckpoint`'s sibling `VideoDraft { youtubeUrl, title, description }` (authoring UI state, `authoredSession.ts`) |
| Current storage | Inside the same package/session content tree as everything else — no separate storage |
| Read | `VideoPanel` (authoring, "Preview Video" button — regex-parses a video id client-side just to build an iframe preview); `VideoCheckpointPlayer.tsx` (real playback — Student and Preview, identical component, see §13) |
| Write | `draft.video` fields, plain text inputs — no file upload, no server-side validation |
| Future entity | `ContentVersion.video` — a structured JSON field per the domain model, not its own table |
| Findings | (1) `video.description` is captured but never survives to `ContentSessionContent` (§2's finding, restated here). (2) YouTube URL format is never validated anywhere (§2's finding, restated here) — an author can publish a broken URL and the only symptom is `VideoCheckpointPlayer`'s own "This doesn't look like a valid YouTube URL" message shown to the student at runtime, with no earlier warning anywhere in the pipeline. |

**Resolved since the domain model was written — the real YouTube IFrame Player API now exists.** As of Video Checkpoint Slice 2, `src/data/youtubePlayer.ts` is a genuine (not mocked, not simulated) wrapper around `window.YT.Player`: it loads the real `iframe_api` script, constructs a real player with `enablejsapi/rel/modestbranding/fs:0/playsinline`, and exposes `getCurrentTime()`/`pauseVideo()`/`playVideo()`/`seekTo()`. This directly closes a gap the Video Checkpoint audit (which predates this document) found completely absent. It only activates when `content.video` is truthy — sessions with no authored video (all curated/generated fallback content) still use the original mock/simulated video state machine in `SessionWorkspace.tsx`, by deliberate design (documented in `NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md`'s Slice status section).

---

## 13. Video Checkpoints

| | |
|---|---|
| Current type | `VideoCheckpoint { id, timestampSeconds, question, options[], correctIndex, feedback, required }` (`sessionContent.ts`) — an array, `SessionContent.checkpoints: VideoCheckpoint[]`. Authoring-side twin: `AuthoredCheckpoint` (`authoredSession.ts`), field-for-field identical minus `id` generation details, deliberately not imported from the student-facing type (kept as a distinct authoring-layer concern even though the shapes currently coincide) |
| Current storage | Same package/session content tree |
| Read (authoring) | `CheckpointCard` in `ContentSessionAuthoring.tsx` — manual `mm:ss` entry only, no YouTube Player API integration on the authoring side (a Content Author cannot "play the video and click to capture the current timestamp") |
| Read (Student/Preview) | `useVideoCheckpoints.ts` hook + `VideoCheckpointPlayer.tsx` — identical component for both, differing only via the pre-existing `mode` prop |
| Write | `buildContentSessionContent()` sorts all authored checkpoints by `timestampSeconds` and writes the full array — never just the first one |
| Future entity | `VideoCheckpoint`, one-to-many under a `ContentVersion`, per the domain model |
| Required semantics | `required: true` = must be *answered* (not necessarily correctly) before it's resolved; blocks session completion and (since Slice 2) forward-seeking past it. `required: false` = skippable, never blocks anything |
| Mutable? | Mutable while the owning package is a resumable draft; otherwise immutable (a new version must be authored to change a checkpoint) |
| Ownership | Content Author-owned (authoring) → system-served (published) |

**Major resolved finding — multi-checkpoint playback now works, for the real-video path.** The original audit's headline finding here ("only the FIRST authored checkpoint ever plays for a student — checkpoints `[1..n]` are functionally inert everywhere else") is **no longer true for any session with a real authored video**. Video Checkpoint Slices 1–2 fully resolved it: `buildContentSessionContent()` now maps every authored checkpoint (not just the first) into the array; `useVideoCheckpoints.ts` polls the real player and sequentially triggers every checkpoint in timestamp order, with verified forward-seek-past-a-required-checkpoint rewind behavior, forward-seek-past-a-non-required-checkpoint silent skip, and backward-seek never retriggering an already-resolved checkpoint (all covered by `tests/videoCheckpoints.spec.ts`'s Slice 2 tests using a fake, fully scriptable `window.YT.Player`).

**What remains exactly as before — the no-video mock path still shows only `checkpoints[0]`.** Curated content (`components-and-state`) and the generic `buildDefaultSessionContent()` fallback have no `video` field at all; for these, `SessionWorkspace.tsx`'s original mock/simulated video timer still drives a single "Quick Check" using `content.checkpoints[0]` only, exactly as before Slice 1. This is a deliberate, documented boundary (see `NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md`'s Slice status section), not an oversight — but it means "how many checkpoints actually play" still depends on whether the session has a real video, which is worth stating precisely rather than leaving as an implicit assumption.

**Enforcement is explicitly good-faith UX only, not tamper-proof** — stated in the design doc itself (§G) and unchanged: a student could still manipulate the real YouTube iframe outside the polled interface (e.g., via devtools) to bypass a required checkpoint. A real backend cannot rely on client-reported `videoCheck.completed`/`correct` values without some form of independent verification, and none is designed or proposed anywhere in this project's history.

---

## 14. Practice

| | |
|---|---|
| Current type | `SessionContent.practice: { task, starterCode, checklist: PracticeCheck[], language }` (student-facing); `ContentSessionContent.practice: { task, starterCode?, checklist: string[] (labels only), language }` (authored) |
| Current storage | Same content tree |
| Read | `PracticeCodeEmbed` (OneCompiler iframe, via `practiceExecution.ts`'s provider abstraction) — task text, starter code (informational only, not auto-injected — Practice's embed never uses `codeChangeEvent`/`populateCode`, unlike Exercise) |
| Write | Nothing directly from the student; only feeds `practiceViewed` (opened the tab at all) into completion |
| Future entity | `ContentVersion.practice` |
| Completion semantics | "Completed" = the student opened the Practice tab at all — no correctness signal of any kind (deliberate product decision from the Student Session UI Cleanup) |
| **Dead-data finding** | See §1 above — the entire `checklist`/Self-Check concept is authored, extracted from DOCX, converted, and persisted through the whole pipeline, but is never rendered to the student and never contributes to the persisted score any more. It still silently contributes to the **on-screen, unpersisted** `performancePercent` shown at the moment of completion (see §1's finding) — an inconsistency worth resolving deliberately (either remove the checklist from the pipeline entirely, or restore some real use for it) rather than carrying forward by accident. |

---

## 15. Exercise

| | |
|---|---|
| Current type | `SessionContent.exercise: { objective, requirements[], starterCode?, language }` (student-facing); `ContentSessionContent.exercise` (same shape, authored); `AuthoredSessionDraft.exercise` (authoring UI state — additionally carries `scenario`, `expectedBehaviour`, `evaluationCriteria[]`, `edgeCases[]`, `submissionInstructions`, none of which survive into `ContentSessionContent.exercise` at all — only `objective`/`requirements`/`starterCode`/`language` make it through `buildContentSessionContent()`) |
| Current storage | Same content tree |
| Read | `ExerciseCodeEmbed` — OneCompiler iframe with `codeChangeEvent: true`; starter code is genuinely injected via the documented `populateCode` postMessage once the iframe loads (verified empirically per the file's own comment, with a 600ms settle delay); the student's typed code is captured live via a validated `window.addEventListener("message", ...)` handler that checks `event.source`, `event.origin === ONECOMPILER_ORIGIN`, `data.action === "change"`, and a well-formed `files[]` array before trusting anything |
| Write | `createSubmission()` on Submit |
| Future entity | `ContentVersion.exercise` for the definition; `Exercise` as its own small entity per the domain model §12 (see next section) |

**Significant authored-but-discarded finding — most of the Exercise authoring contract never reaches students or the future evaluation pipeline.** `scenario`, `expectedBehaviour`, `evaluationCriteria[]`, `edgeCases[]`, and `submissionInstructions` are all: extracted from the Exercise document (`docxParser.ts`'s `extractExerciseContent` — all five fields are genuinely parsed), shown back to the Content Author in `ExercisePanel`'s read-only preview, and then **entirely dropped** by `buildContentSessionContent()`, which only ever writes `objective`/`requirements`/`starterCode`/`language` into `ContentSessionContent.exercise`. This matters more than the Video/Practice drops above because `evaluationCriteria[]` is explicitly authored *for the future AI evaluator* — its own UI copy says "Written as statements that can be checked as true or false — this drives future AI-assisted evaluation" — yet there is currently no path for that data to ever reach a submission, an evaluator, or even the published session content a student is shown. **This is the single most consequential authored-but-orphaned field in the whole system**, since it represents Content Author effort specifically aimed at a capability (§16 below) that cannot currently receive it even if built today.

---

## 16. Exercise Submissions

| | |
|---|---|
| Current type | `ExerciseSubmission { id, studentId, sessionId, exerciseId, language, files: {name, content}[], submittedAt, attemptNumber }` |
| Current storage | `nextstep2:exerciseSubmissions` — a flat array, every attempt retained, never overwritten |
| Read | `getSubmissionsForSession()` (scoped to one session, oldest-first — used to render "Previous submissions" and to compute the next `attemptNumber`); `getAllSubmissions()` (every submission across the whole app, unfiltered — used only by Admin, "correct" only because exactly one student exists) |
| Write | `createSubmission()` — always appends, attempt numbering = `existing.length + 1`, computed by counting the caller's own prior localStorage entries |
| Future entity | `ExerciseSubmission`, exactly as specified in the domain model §12 — every attempt retained |
| Mutable? | Immutable once created (never edited or deleted anywhere in the app) |
| Ownership | Student-owned |
| Backend must enforce | (1) `studentId` must come from the authenticated session, never the current plain parameter (`STUDENT.name`, trivially spoofable). (2) `attemptNumber` must be server-assigned, not client-counted (trivially spoofable today — a client could submit a fabricated `attemptNumber` by bypassing `createSubmission()` entirely and writing to `localStorage` directly). |
| exerciseId today | Per the domain model's own already-identified risk: `exerciseId` is set to `sessionId` verbatim at the one call site (`SessionPage.tsx`'s `handleSubmitExercise`) — "exercise identity" doesn't really exist yet, confirming the domain model §12's decision to give `Exercise` its own real entity/id going forward is still exactly the right call, unchanged. |

---

## 17. AI Help

| | |
|---|---|
| Current type | `SessionContent.aiHelp: { quickPrompts[], replies: Record<string,string>, defaultReply }` (student-facing); `AiHelpDraft { import, quickPrompts: {prompt,reply}[], defaultReply }` (authoring) |
| Current storage | Same content tree |
| Read | The "Need Help?" floating widget (`SessionWorkspace.tsx`, bottom of file) — no longer a tab (Student Session UI Cleanup) |
| Write | Nothing from the student except the ephemeral chat transcript, which is component state only, never persisted, reset on session change |
| Future entity | `ContentVersion.aiHelp` |
| **Not AI, on either side** | Confirmed unchanged: a student's typed question is matched via an **exact string lookup** against `content.aiHelp.replies` (`sendChat()`); anything that doesn't match verbatim falls through to `defaultReply`. There is no LLM, no fuzzy matching, no context awareness anywhere in this implementation. Worth restating plainly given the "AI Help" name, since a genuine LLM integration (if ever planned) is wholly new backend capability, not a wiring change to existing code. |

---

## 18. Student Progress

There is still no dedicated `/progress` route — it is the cross-cutting concept `progress.tsx`'s `ProgressProvider`/`useCourseData()` implements, unchanged in shape from the prior audit.

| | |
|---|---|
| Current type | `Set<string>` of completed session ids |
| Current storage | `nextstep2:completedSessionIds` |
| Read | Every subject/session status, every progress percentage, "current session" — 100% derived at read time from this one flat set (`getSubjects`/`getSubjectDetail`/`getCourseProgress`/`getSessionContext`/`getCurrentSessionContext`, all in `mock.ts`) |
| Write | `completeSession(sessionId)` — the only mutation; **first-completion-wins** (`if (prev.has(sessionId)) return prev;` — redoing an already-completed session never updates anything) |
| Seeding | `getDefaultCompletedSessionIds()` seeds a fake "already partway through" baseline (all of Subject 1 + the first session of Subject 2) for any first-time visitor with no saved progress — a demo convenience, not real data |
| Future entity | `SessionCompletion`, one row per student per completed session, `(studentId, sessionId)` unique, per the domain model §10 |
| Mutable? | Effectively append-only (first-write-wins per session id) |
| Backend must enforce | Ownership scoping (§5's cross-cutting note) and the exact first-completion-wins semantics if that behavior is to be preserved (the domain model explicitly calls for preserving it) |

---

## 19. Performance

| | |
|---|---|
| Current type | `SessionPerformanceRecord { sessionId, subjectId, completedAt, activities: SessionActivitiesInput, score: number\|null }` |
| Current storage | `nextstep2:performanceRecords`, keyed by `sessionId` — **overwrite-on-redo**, the opposite semantics from `completedSessionIds` (this asymmetry is deliberate and already documented in the domain model §11 as "preserved deliberately, not accidentally") |
| Read | `Performance.tsx` (course/subject/session breakdowns); `AdminStudentDetail.tsx`; `AdminDashboard.tsx` (activity feed + crude "active students" proxy) |
| Write | `recordSessionPerformance()`, called from `SessionPage.tsx`'s `handleCompleteSession` |
| Future entity | `SessionPerformance`, latest-only for MVP, upserted, exactly per the domain model §11 |
| Score algorithm | `calculateSessionScore()` — averages only `videoCheck.correct` and `practice`'s pass ratio, each only when actually completed and scoreable; returns `null` (never fabricated) when nothing scoreable was completed. **As of this audit, `practice` can never contribute** — see §1/§14's finding that `totalCount` is now permanently hardcoded to `0` |
| Live-session quirk (pre-existing, still present) | For a live-delivery session, `videoCheck` is correctly excluded from `requiredActivities` (`getSessionContent()`'s `format === "live"` filter) — but `SessionWorkspace.tsx`'s on-screen `performancePercent` still always averages in a `checkpointPercent` derived from `videoCheckCorrect`, which is `null`→`50` for a session with no checkpoints at all. The displayed percentage for a live session is therefore always dragged toward 50% by a requirement that isn't even active for that session — a genuine, if minor, display inconsistency, not something this audit resolves. |

---

## 20. Portfolio

| | |
|---|---|
| Current type | `PortfolioData { profile: {name, headline, bio}, skills: {category, skills[]}[], projects: PortfolioProject[], links: {email, linkedin, github} }` |
| Current storage | `nextstep2:portfolio` — a single document, full-overwrite on save |
| Read | `Portfolio.tsx` (edit + view mode); `AdminStudentDetail.tsx` (projects/skills only) |
| Write | `savePortfolio()` — whole-document replace, no partial-field update path |
| Future entity | `Portfolio` (1:1 with `User`) + `PortfolioProject` (0..*), per the domain model §13 — Skills stays a structured field, not normalized, exactly as decided there |
| Mutable? | Fully mutable, student-owned, no history retained (unlike `ExerciseSubmission`) |
| **`PortfolioView.tsx` still does not render this data** — see §1's finding, unchanged. |

---

## 21. Review / Approval / Publishing

Fully covered per-role in §§2–3. The single shared mechanism (`ContentPackageDetail.tsx`, differentiated only by `role` prop) is the entire review/approve/publish surface — restated here as the workflow-level summary:

```
draft (= "submitted, awaiting review")
  → Reviewer: Request Changes  → changes_requested
      → Author: Continue Editing (same package, same id) → resubmits → back to "draft"
  → Reviewer: Approve (only if allChecked)  → approved
      → Reviewer: Publish → published
```

**Confirmed unenforced transitions, unchanged from the original audit:** nothing at the data layer stops `draft`/`changes_requested` → `published` directly, or `approved` with an incomplete checklist — both are prevented only by which button the current UI state happens to render.

**Review history is NOT append-only today**, contradicting the domain model §8's decision. `ContentPackageRecord.review` is a single mutable object (`{checklist, notes, reviewedAt, approvedAt, publishedAt}`), overwritten in place by every `saveReview()` call. A "Changes Requested" round's specific notes are **lost** the moment the package is later approved — there is no `ContentReview` history table or equivalent anywhere in the frontend. This is a direct, current gap against an already-frozen decision, not merely a future nice-to-have; flagged explicitly as a **MISSING BACKEND REQUIREMENT** (classification D, see the table near the end).

---

## 22. Version Replacement

Traced exactly, using the same V1→V2 scenario as the domain model:

```
Session: Async/Await

STATE 0 — nothing authored yet.

1. Content Author authors V1 → saveDraft() → ContentPackageRecord{id: A, status: "draft"}
2. Content Reviewer approves → status: "approved", review.approvedAt = T1
3. Content Reviewer publishes → status: "published", review.publishedAt = T2
   → getPublishedSessionContent()/resolveSessionStatuses() now resolve package A as "the" content
     for this session (it's the only published record for this (course,subject,session) key)

STATE 1 — V1 live. Package A: published, publishedAt=T2.

4. A DIFFERENT correction is needed. Content Author reopens the session's authoring workspace.
   findResumableAuthoredPackage() finds NOTHING resumable for this session (package A is
   "published", not "draft"/"changes_requested" — deliberately excluded), so a brand NEW
   AuthoredSessionDraft is created, with a brand NEW packageId (package B).
5. Content Author edits, saves, submits → ContentPackageRecord{id: B, status: "draft"}
   → Package A is completely untouched throughout. Both A and B now exist, independently,
     forever, in the same flat nextstep2:contentPackages array.
6. Content Reviewer approves package B → status: "approved", approvedAt = T3
7. Content Reviewer publishes package B → status: "published", publishedAt = T4

STATE 2 — BOTH A and B now have status "published".

8. getPublishedSessionContent() filters ALL published packages containing this session, then
   sorts by lastTouchedAt() descending (publishedAt ?? approvedAt ?? reviewedAt ?? importedAt),
   and returns the FIRST session match found while walking that sorted list — package B (T4 > T2)
   wins, so students now see V2's content.
9. resolveSessionStatuses() (used by Content Author/Content Reviewer/Admin's own list/overview
   screens) applies the same "most-recently-touched published wins" rule when multiple published
   records exist for the same key, so every screen agrees on "published" being the answer and
   package B being the specific one shown — but see the note below.
```

**What exactly happens to V1 (package A):** **Nothing.** It is never marked superseded, deleted, archived, or flagged in any way. It remains `status: "published"` forever, sitting in the same array, and is only *functionally* superseded because `getPublishedSessionContent()`'s recency sort happens to put package B first every time it's queried. If package B were ever deleted (there is no delete function anywhere, but nothing at the data layer prevents one from being added), students would silently see V1 again with zero warning. **This is exactly the domain model §7/§9's headline gap, verified precisely in code, unchanged from the original audit's finding.**

**What must happen to V1 and V2 in a real backend, per the domain model:** publishing V2 must, in the same atomic transaction, create `Publication(V2){supersededAt: null}` and set `Publication(V1).supersededAt = now()`. There is no equivalent of "supersededAt" anywhere in the current data model — this is a pure gap, not a partial implementation.

---

## 23. File/Assets Requirements

- **No file is ever uploaded to a server anywhere in this application.** The only file input in the entire app is the `.docx` upload in the authoring workspace (`DocumentUploadPanel.tsx`), and it is parsed entirely client-side and discarded (§11).
- **No image, video file, or other binary asset is ever stored.** Video is YouTube-hosted (external, referenced by URL only). `docxParser.ts` explicitly detects (`imageCount`) but never extracts or stores embedded document images — it only surfaces a warning that they exist and won't be shown to students.
- **Per the domain model §17:** normalized content (the parsed JSON tree) is the load-bearing artifact and is already what this app persists; retaining the *original* `.docx` (or, previously, `.zip`) is explicitly a "SHOULD HAVE, not a MUST HAVE" and remains unimplemented — consistent with, not contradicting, the frozen decision.

---

## 24. Current localStorage / mock data — full inventory

Every key found via exhaustive search of `app/src` for `localStorage.getItem/setItem/removeItem`. **No unexplained keys remain** — all eleven are accounted for below, including the three Company/Hiring keys that are out of this audit's functional scope but must not be left silently undocumented.

| Current Source (key) | Purpose | Future Backend Responsibility | Persistence Required? | Owner | Notes |
|---|---|---|---|---|---|
| `nextstep2:completedSessionIds` | Which sessions the student has finished | `SessionCompletion` table, scoped by real `studentId` | Yes | Student | First-completion-wins semantics must be preserved (§18) |
| `nextstep2:performanceRecords` | Latest activity/score breakdown per session | `SessionPerformance` table, upsert semantics | Yes | Student | Overwrite-on-redo, opposite of the completions key (§19) |
| `nextstep2:portfolio` | Student's self-authored profile/skills/projects/links | `Portfolio` + `PortfolioProject` | Yes | Student | Full-document overwrite today; no history |
| `nextstep2:exerciseSubmissions` | Every exercise attempt, all students, unfiltered | `ExerciseSubmission` | Yes | Student | Must be scoped per-student server-side; attempt numbering must move server-side (§16) |
| `nextstep2:contentPackages` | Every content package/version/review/publish record, all statuses, all sessions | `ContentPackage` + `ContentVersion` + `Exercise` + `ContentReview` + `Publication`, normalized per the domain model | Yes | System (workflow state) / Content Author (source content) | The single largest and most structurally-behind-the-domain-model store — see §10/§21/§22 |
| `nextstep2:contentAuthorAccount` | Mock Content Author session | `User (role=content_author)` + real session/token | Yes (as a real session, not this shape) | System | No password, no verification (§5) |
| `nextstep2:contentReviewerAccount` | Mock Content Reviewer session | `User (role=content_reviewer)` + real session/token | Yes (as above) | System | Isolated from the Author key by design (§5) |
| `nextstep2:adminAccount` | Mock Admin session | `User (role=admin)` + real session/token | Yes (as above) | System | Read-only role, still needs real auth |
| `nextstep2:companyAccount` | Mock Company session (out of scope) | Would map to `User (role=company)` if Company/Hiring is ever built out | Out of scope | System | Same mock-auth pattern as the other three roles; not analyzed further per scope |
| `nextstep2:companyProfile` | Company's own profile data (out of scope) | Company-owned entity, not designed here | Out of scope | Company | Not analyzed further per scope |
| `nextstep2:hiringRequirements` | Company's posted hiring requirements (out of scope) | Company-owned entity, not designed here | Out of scope | Company | Not analyzed further per scope |

**Non-persisted mock/derived data sources** (never a `localStorage` key, but load-bearing for what renders today):
- `mock.ts` — `STUDENT`, `COURSE`, `SUBJECTS_BASE`, `SUBJECT_SESSIONS`, `getDefaultCompletedSessionIds()` (§6–9, §18).
- `sessionContent.ts` — `SESSION_CONTENT` (one curated entry), `SESSION_DELIVERY` (one hardcoded live-session entry), `buildDefaultSessionContent()` (§9, §12).
- `portfolioDemoContent.ts` — every field `PortfolioView.tsx` shows except Education (§1, §20).
- `adminStudents.ts` — `ADMIN_STUDENT_ID` (a slugified display name, not a real id) and `getAllStudentIds()` (always one element) (§4).

---

## 25. Synthetic IDs and Prototype Assumptions

| ID | Generated as | Risk |
|---|---|---|
| `ContentPackageRecord.id` (authored) | `` `authored-${Date.now()}-${Math.random().toString(36).slice(2,8)}` `` | Client-generated, time-based, collision-prone under real concurrent writes. **The ZIP-era `pkg-...` id generator has been fully removed** (confirmed via exhaustive search — no trace remains) — this is a resolved item since the original audit |
| `AuthoredCheckpoint.id` | `` `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2,6)}` `` | Same pattern |
| `PortfolioProject.id` | `` `project-${Date.now()}-${Math.random().toString(36).slice(2,7)}` `` | Same pattern |
| `ExerciseSubmission.id` | `` `sub-${Date.now()}-${Math.random().toString(36).slice(2,8)}` `` | Same pattern |
| Preview-mode submission id | `` `preview-${Date.now()}-${attemptCounter.current}` `` (`ContentPreviewSession.tsx`) | In-memory only, never persisted — low risk, but confirms the same convention leaks even into throwaway preview state |
| `ADMIN_STUDENT_ID` | `slugify(STUDENT.name)` | A **display name**, not an identity, turned into an id — the entire concept of "student id" in Admin is this one synthetic slug |
| Session ids for newly-authored sessions | `slugifyTitle(sessionTitle)` (Content Author's "Add Session") | **No uniqueness check anywhere** — two sessions titled identically in the same subject silently collide on the same id |
| `useVideoCheckpoints.ts`'s player mount element id | `` `youtube-checkpoint-player-${Math.random().toString(36).slice(2)}` `` | Purely a DOM element id for the YouTube Player API to attach to — not a data identity at all, included here only for completeness since it uses the same `Math.random()` idiom |
| Company/Hiring ids (`company-...`, `req-...`) | Same `Date.now()`/`Math.random()` pattern | Out of scope; noted only so no ID-generation site in the codebase is left unaccounted for |

**None of these are server-issued primary keys.** Every one is client-generated, time-based, and collision-prone under any real concurrent-write scenario — unchanged as a category from the original audit, with the ZIP-era generator's removal as the one resolved item.

**Other standing prototype assumptions** (all previously identified, all re-verified as still true): single-browser/single-user for every one of the four roles; no session expiry once a role's key is written; no concurrency control (last write wins on every key, no version/etag); no durability guarantee (clearing site data loses everything, with no export/backup path anywhere in the app).

---

## Explicit flow traces

### STUDENT: Login → course → subject → session → content → video/checkpoints → practice → exercise → submission → completion → progress → performance → portfolio

1. **Login** (`Login.tsx`) — client-side validation only, no session created, navigates to `/dashboard`.
2. **Course** (`Dashboard.tsx`/`MyCourse.tsx`) — reads `COURSE` (hardcoded) + `useCourseData().subjects/courseProgress` (derived from `completedSessionIds`).
3. **Subject** (`SubjectPage.tsx`) — `useCourseData().getSubjectDetail(subject)`; per-session delivery via `getSessionDelivery()`.
4. **Session** (`SessionPage.tsx`) — `getSessionContext(sessionId)` (derived location) + `getSessionContent(sessionId, fallback, courseId, subjectId)` (content resolution: published package → curated → generated fallback).
5. **Content** — `SessionWorkspace.tsx` receives the resolved `SessionContent`; renders Learn/Practice/Exercise/Complete.
6. **Video/checkpoints** — if `content.video` exists: real YouTube player + sequential checkpoints via `VideoCheckpointPlayer`/`useVideoCheckpoints`, reporting `videoAnswers`/`videoEnded` back up. Otherwise: the original mock timer state machine, showing only `content.checkpoints[0]`.
7. **Practice** — `PracticeCodeEmbed` (OneCompiler, task/starter code display only); opening the tab sets `practiceViewed`; no correctness signal.
8. **Exercise** — `ExerciseCodeEmbed` (OneCompiler with live code capture via validated postMessage); "Submit Exercise" → confirm → `handleSubmitExercise()`.
9. **Submission** — `createSubmission(STUDENT.name, sessionId, sessionId, language, files)` → appends to `nextstep2:exerciseSubmissions`, `attemptNumber` = count of existing + 1.
10. **Completion** — "Complete Session" (enabled only once every `requiredActivities` entry is done) → `handleCompleteSession()` computes unified `learningDone`/`videoCheckDone`/`videoCheckCorrect` → calls `onCompleteSession(activities)`.
11. **Progress** — `SessionPage.tsx`'s handler calls `completeSession(sessionId)` → adds to `completedSessionIds` Set (first-write-wins) → every derived subject/session status/percentage across the app updates.
12. **Performance** — same handler calls `recordSessionPerformance(sessionId, subjectId, activities)` → `buildSessionPerformanceRecord()` computes `calculateSessionScore()` (video-check + practice-pass-rate average, practice currently always excluded — see §14/§19) → overwrites `performanceRecords[sessionId]`.
13. **Portfolio** — entirely separate, student-initiated, not reached through the session-completion flow at all — `Portfolio.tsx` reads/writes `nextstep2:portfolio` independently; `PortfolioView.tsx` (the "shareable" page) still renders fabricated demo content instead (§1/§20).

### CONTENT AUTHOR: Login → course → subject → session → authoring → DOCX extraction → save draft → submit → changes requested → continue editing → new version

1. **Login** (`ContentLogin.tsx`) — mock account created/loaded, `nextstep2:contentAuthorAccount`.
2. **Course** (`ContentCourses.tsx`) — `listCourses()` (hardcoded, one course).
3. **Subject** (`ContentCourseDetail.tsx` → `ContentSubjectDetail.tsx`) — `listSubjectSummaries()`, `listSessionSummaries()` merged with any package-only session; "Add Session" creates a new id via `slugifyTitle()`.
4. **Session/authoring** (`ContentSessionAuthoring.tsx`) — `loadDraftForSession()` resumes a `draft`/`changes_requested` record, else `createEmptyDraft()`.
5. **DOCX extraction** — per-section `Upload...Document()` calls → `docxParser.ts`'s strict heading-based extractors → merges into the relevant draft section.
6. **Save draft** — `saveDraft(draft)` → `toPackageRecord(draft)` → `upsertPackageRecord()` → `nextstep2:contentPackages` (same key ZIP-era packages used).
7. **Submit** — `canSubmitForReview()` (all `MANDATORY_SECTIONS` complete) gates the button; `handleSubmitForReview()` saves and navigates to `/content/submissions/:id` — status remains `"draft"`, which **is** "awaiting review."
8. **Changes requested** — a Content Reviewer's `saveReview("changes_requested")` sets `status: "changes_requested"` + `review.notes`; the Content Author sees this on `/content/submissions/:id` (read-only) with a "Continue Editing" link.
9. **Continue editing** — reopens `ContentSessionAuthoring.tsx` at the same course/subject/session; `loadDraftForSession()` resumes the same package id (still `changes_requested`, still resumable); edits, re-saves, re-submits — status returns to `"draft"`.
10. **New version** — only reachable once a session's current record is `approved`/`published` (`isAuthorable` is false in `ContentSubjectDetail.tsx`'s row); clicking "Author New Version" calls the same `goAuthor()` → since `findResumableAuthoredPackage()` never resolves an approved/published record, `createEmptyDraft()` runs and a brand-new `packageId` is created, fully independent of the live one (see §22's full trace).

### CONTENT REVIEWER: Login → pending → review → preview → request changes / approve → publish

1. **Login** (`ReviewLogin.tsx`) — mock account, `nextstep2:contentReviewerAccount`.
2. **Pending** (`/review/pending` = `ReviewQueue status="draft"`) — every package with `status === "draft"`.
3. **Review** (`/review/package/:id` = `ContentPackageDetail role="reviewer"`) — checklist + notes, editable only while `draft`/`changes_requested`.
4. **Preview** (`/review/preview/...` = `ContentPreviewSession role="reviewer"`) — renders the real `SessionWorkspace` against the package's own content, reachable at any status with usable course/subject/session data (not restricted to `draft`), with all completion/submission callbacks as no-ops.
5. **Request changes** — requires non-empty notes (`if (!notes.trim()) { alert(...); return; }`), then `saveReview("changes_requested")`.
6. **Approve** — requires `allChecked` (every checklist box), then `window.confirm()`, then `saveReview("approved")`.
7. **Publish** — `window.confirm()`, then `saveReview("published")` — no server-side check that the record is actually `approved` first (§21).

### ADMIN: Login → dashboard → students → student detail → content overview → content detail

1. **Login** (`AdminLogin.tsx`) — mock account, `nextstep2:adminAccount`.
2. **Dashboard** — metrics + recent activity, all derived client-side over `contentPackages` + `performanceRecords` (§4).
3. **Students** — `getAllStudentIds()` (always one row) + `useCourseData()`/`getCoursePerformance()` for that one row.
4. **Student detail** — `/admin/students/:studentId`, gated by `studentId === ADMIN_STUDENT_ID`; reads progress, performance, portfolio, and **every** exercise submission in the app (unfiltered).
5. **Content overview** — `resolveSessionStatuses()` grouped per course, same function the student-facing resolution shares.
6. **Content detail** — same function filtered to one `courseId`, grouped per subject, with a per-status timestamp label.

---

## Video: full pipeline trace

```
Content Author authors video + checkpoints[]  (ContentSessionAuthoring.tsx: VideoPanel + CheckpointsPanel)
  → AuthoredSessionDraft.video / .checkpoints[]
  → buildContentSessionContent()  (authoredSession.ts)
      — writes ContentSessionContent.video = {youtubeUrl, title}  (description dropped)
      — writes ContentSessionContent.checkpoints[] = every authored checkpoint, sorted by timestampSeconds
  → toPackageRecord() → upsertPackageRecord()  →  nextstep2:contentPackages
  → Content Reviewer: review / approve / publish  (ContentPackageDetail.tsx — unchanged by any of this)
  → toPreviewSessionContent()  (contentPackages.ts)
      — copies video through unchanged (video: draft.video)
      — resolveCheckpoints(draft): prefers draft.checkpoints[]; falls back to synthesizing one
        item from the deprecated singular videoCheckpoint for pre-Slice-1 records
  → SessionContent { video?, checkpoints: VideoCheckpoint[] }
  → SessionWorkspace.tsx
      — hasRealVideo = Boolean(content.video)
      — real path: <VideoCheckpointPlayer key={sessionId} video checkpoints onEnded onAnswersChange />
          → useVideoCheckpoints hook → youtubePlayer.ts's real window.YT.Player
          → sequential polling/crossing-detection/pause-resume/seek-handling (§13)
      — no-video path: original mock timer state machine, checkpoints[0] only
```

Preview (`ContentPreviewSession.tsx`) and the real Student route (`SessionPage.tsx`) both feed the identical `SessionContent` shape into the identical `SessionWorkspace`/`VideoCheckpointPlayer` components — verified in code (no duplicate rendering path exists for either).

---

## Exercise: current vs. future AI evaluation — clearly distinguished

**Exists today:**
- Full authoring capture of objective/scenario/requirements/expected-behaviour/evaluation-criteria/edge-cases/submission-instructions (`docxParser.ts`'s `extractExerciseContent` — genuinely parses all of it).
- A working code editor with live capture of the student's code (`ExerciseCodeEmbed.tsx`, validated postMessage protocol).
- Submission persistence, every attempt retained, correctly modeled per the domain model (`ExerciseSubmission`).

**Does NOT exist, anywhere, in any form:**
- Any grader, sandboxed execution engine, or automated checker.
- Any use of `evaluationCriteria[]`/`edgeCases[]`/`expectedBehaviour`/`scenario`/`submissionInstructions` past the authoring preview screen — **all five are silently dropped at `buildContentSessionContent()`** and never reach `ContentSessionContent.exercise`, `SessionContent.exercise`, or an `ExerciseSubmission` (§15's finding, restated here as the headline fact for this section).
- Any scoring of a submission's correctness.
- Any AI/LLM call of any kind, anywhere in the app (the only thing called "AI" today — AI Help, §17 — is a static lookup table, unrelated to Exercise evaluation).

**Prepared-for-but-not-built:** the domain model's own `Exercise` entity decision (§12 there) is explicitly designed to make a future "Submission → Automated Evaluation → Score" pipeline additive rather than a schema migration — but the raw material that pipeline would need (`evaluationCriteria[]` etc.) is currently authored and then thrown away before it ever reaches a place that pipeline could read it from. **Any future AI-evaluation work must first fix the `buildContentSessionContent()`/`ContentSessionContent.exercise` gap**, or it will have nothing to evaluate against beyond `objective`/`requirements`.

---

## Frontend-only business rules that MUST move to server-side enforcement

- **Role permissions** — Student/Content Author/Content Reviewer/Admin are each "whichever `localStorage` key happens to be set," with no real credential behind any of them (§5).
- **Author cannot approve/publish** — currently true only because `ContentPackageDetail.tsx`'s `role="author"` branch renders no such controls and `saveReview()` checks `isReviewer` client-side; a direct call to `updatePackageState()` bypasses this entirely.
- **Reviewer cannot edit authored source** — currently true only because no UI path exists for it, not because anything at the data layer refuses such a write.
- **Admin is read-only** — currently true only because no Admin page renders any mutating control; nothing prevents a crafted write.
- **Student isolation** — every Student-owned read/write (`completeSession`, `recordSessionPerformance`, `createSubmission`, `savePortfolio`) takes a plain, client-supplied identity value (`STUDENT.name` or nothing at all) with zero verification.
- **Published content visibility** — "only published is visible to students" holds today only because `getPublishedSessionContent()` chooses to filter `status === "published"`; nothing stops a client from requesting or fabricating anything else.
- **Version replacement** — no atomic supersession exists; "which version is current" is a client-side recency sort over every record, every time (§10/§22).
- **Immutable published versions** — a `ContentPackageRecord` remains editable in place indefinitely while its status is resumable; nothing distinguishes "immutable, ever" from "not currently being resumed."
- **Submission ownership** — `studentId` is a plain parameter, not derived from any session.
- **Attempt numbering** — computed by counting the caller's own existing records; trivially spoofable.
- **Publication state / status transitions** — every workflow transition (`draft → changes_requested/approved → published`) is gated only by which button the UI currently renders plus a `window.confirm()` dialog (§21).
- **Progress ownership** — same as Student isolation above; `completeSession(sessionId)` has no notion of "whose" completion this is beyond the single implicit browser-wide student.
- **Review history integrity** — currently a single mutable object, not append-only, contradicting the already-frozen domain model decision (§21) — flagged as a concrete gap to close, not merely a future preference.

---

## Classification

**A. READY FOR BACKEND** — the shape and behavior are already well-modeled and match (or trivially map to) the frozen domain model; building the real backend entity is mostly a direct translation:
- `SessionCompletion` (from `completedSessionIds`) — first-write-wins semantics already correct.
- `SessionPerformance` (from `performanceRecords`) — upsert semantics already correct.
- `ExerciseSubmission` — every-attempt-retained semantics already correct (only ownership/attempt-numbering need to move server-side, which is an enforcement change, not a shape change).
- `Portfolio`/`PortfolioProject` — shape matches the domain model exactly.
- `ContentPackage` status workflow (`draft → changes_requested/approved → published`) — the state machine itself is correct; only its *enforcement* needs to move server-side.
- Video + Video Checkpoints' real-video playback model (§12/§13) — the array-based checkpoint shape, the required/optional semantics, and the sequential playback behavior are all already exactly what the domain model and the approved Video Checkpoint System design call for.

**B. FRONTEND-ONLY / NO BACKEND REQUIRED**
- All ephemeral UI state: active authoring section/tab, the AI-chat transcript, the mock video state machine's `idle/playing/checkpoint/answered/finished` states, drag-over flags, mobile-nav open/close, the Portfolio edit-mode draft buffer before Save, the review checklist's in-progress unsaved state.
- Section-completion indicators in the authoring sidebar (`computeSectionState`) — correctly recomputed live, never persisted.
- The OneCompiler embed URL construction and postMessage protocol handling (`practiceExecution.ts`) — inherently a browser-side third-party-embed concern.
- Presentation-only formatting helpers (`formatDate`, `formatDateTime`, `formatTimestamp`, etc.).
- `useVideoCheckpoints.ts`'s player-mount DOM element id.

**C. PROTOTYPE-ONLY AND MUST BE REPLACED**
- `STUDENT`/`COURSE` hardcoded singleton constants (`mock.ts`).
- `adminStudents.ts`'s entire one-student adapter, including `ADMIN_STUDENT_ID`.
- `portfolioDemoContent.ts` and everything `PortfolioView.tsx` renders from it.
- Every synthetic client-generated id (`Date.now()`/`Math.random()`-based) listed in §25.
- `AdminDashboard.tsx`'s hardcoded `coursesCount = 1`.
- The `Practice.checklist`/Self-Check pipeline as currently wired — authored, extracted, converted, and then read by nothing (§1/§14) — either remove it end-to-end or give it a real purpose again; carrying it forward as dead weight is the one option that shouldn't happen.
- `AdminContent.tsx`'s stale "Content Manager" copy reference.

**D. MISSING BACKEND REQUIREMENT**
- Real authentication for all four roles (§5) — the single largest gap in the whole system.
- Atomic version supersession (`Publication.supersededAt`, §7/§9/§22) — currently a client-side recency guess, not a stored fact.
- Append-only review history (`ContentReview`, §8/§21) — currently a single mutable, overwritten object; a rejection's specific notes are lost once later approved.
- Server-assigned, collision-proof ids everywhere client-generated ids exist today (§25).
- Server-side enforcement of every rule listed in **Frontend-only business rules** above.
- Canonical, platform-owned Course/Subject/Session tables that only change "as of last publish" (§6–9) — does not exist yet in any form; today's Content Author-facing session listing can reflect an in-review draft's title/description before it's ever published (never leaking to the real Student route, but a real gap against the domain model's own stated rule).
- A real path for `Exercise`'s `evaluationCriteria[]`/`edgeCases[]`/`expectedBehaviour`/`scenario`/`submissionInstructions` to survive past the authoring preview screen (§15/§16) — required before any future AI-evaluation work can have anything to evaluate against.

**E. FUTURE / OUT OF MVP**
- Any real AI/LLM integration for AI Help (§17) — today's "AI Help" is a static lookup table by design.
- Any automated Exercise evaluation/grading pipeline (§16) — explicitly a future capability, not partially built.
- A real YouTube Player API integration on the *authoring* side (capturing "the video's current playback position" while authoring a checkpoint) — today's checkpoint timestamps are manual `mm:ss` entry only.
- Multi-question-type video checkpoints (only Multiple Choice exists, by explicit MVP decision — `NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md` §B).
- Original-document retention (`.docx` today, `.zip` historically) for audit/re-processing purposes (§11/§23) — explicitly a SHOULD HAVE, not required to start backend work.
- A generic `AuditEvent` table (per the domain model §16 — explicitly not required for MVP).
- Company/Hiring, in its entirety — out of scope for this document by instruction, not analyzed.

---

## Contradictions

A **genuine contradiction** exists between the frozen domain model and the current codebase in exactly one place, worth naming precisely rather than folding into a generic gap:

- **The domain model (§8, Frozen Decisions Summary: "Review — Append-only history (`ContentReview`)") states this decision is already frozen and approved.** The current codebase's review mechanism (`ContentPackageDetail.tsx`'s `saveReview()`) is a single mutable, overwritten object, the exact behavior the domain model's own reasoning explicitly argues against ("once a `changes_requested` package is later approved, there is no way to see what the earlier rejection actually said" — still true today, verified). This is not a case of the frontend not having caught up to a *new* decision; the decision was frozen before this document's method review, and the implementation still doesn't match it. Flagged here as a contradiction to resolve deliberately (implement append-only review history to match the frozen model, or explicitly revisit the decision) rather than silently carried forward.

No other direct contradictions were found — every other gap identified above is the frozen domain model correctly describing a *future* state the current prototype was never claimed to already implement.

---

## Open Decisions

1. **Original `.docx` retention** (§11/§23) — the domain model resolves this question only for the retired ZIP transport (§17: "SHOULD HAVE"). Whether the same reasoning applies unchanged to the current `.docx`-based transport, or whether `.docx` retention deserves separate treatment (e.g., because it's the format Content Authors actively re-edit and re-upload, unlike a one-shot ZIP import), is not explicitly re-decided anywhere and is flagged here as needing an explicit answer before backend file-storage design is finalized.
2. **Session id collision handling** (§2/§25) — nothing today prevents two independently-authored sessions in the same subject from colliding on the same `slugifyTitle()`-derived id. Whether the backend should reject a duplicate id outright, auto-disambiguate it, or require Content Authors to pick from existing session ids only (never freely type a new one) is not decided by any existing design document.
3. **What "Content Author write access scoped to own packages" should mean operationally** (§2/§5) — is a Content Author ever expected to see (read-only) another author's in-progress drafts (e.g., for handoff/collaboration), or should the scoping be a hard wall? Nothing in any design document up to and including this audit settles this.
4. **The dead `Practice.checklist`/Self-Check pipeline's fate** (§1/§14/Classification C) — this audit deliberately does not decide whether to remove it or restore a purpose for it; that is a product decision, not an audit finding, and is flagged as needing one.
5. **The orphaned Exercise-authoring fields' fate** (§15/§16/Classification D) — similarly, whether to wire `evaluationCriteria[]` etc. through to published content now (ahead of any evaluator existing) or leave them author-only until an evaluator is actually built is a product decision this audit surfaces but does not make.

---

*This document is a design/audit artifact only. No application code was modified to produce it.*
