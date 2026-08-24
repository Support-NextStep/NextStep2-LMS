# NextStep² Backend Readiness Audit

**Scope:** Student, Content Manager, Admin (the current MVP). Company/Hiring exists in the codebase but is explicitly OUT OF SCOPE for the backend MVP this audit informs, and is only mentioned where an existing pattern is directly relevant.

**Method:** Full inspection of `app/src/` (pages, components, hooks, data, routing), `app/package.json`, `app/tsconfig*.json`, `app/vite.config.ts`, `app/playwright.config.ts`, and every Playwright spec under `app/tests/`. Every claim below is grounded in a specific file; no schema or behavior is invented. Nothing in the application was modified to produce this document — it is a pure read/inspection pass.

---

## 1. Executive Summary

NextStep² today is a **client-only React SPA** (Vite 8 + React 19 + `react-router-dom` 7 + Tailwind 4, TypeScript 6). There is **no backend**: no server code, no database, no real network calls to any first-party API (confirmed by search — the only outbound requests are third-party `<iframe>` embeds for OneCompiler and YouTube). Every "persistence" mechanism is `window.localStorage`; every "authentication" is a client-side mock that fakes a network delay and writes a plain object to storage with no credential verification.

Three findings matter most for backend planning:

1. **Student has no account/session at all.** `STUDENT` is a hardcoded constant (`{ name: "Jordan Smith" }`) in `mock.ts`. Signup/Login never persist anything. Every other role (Content Manager, Admin, and the out-of-scope Company role) *does* persist a mock account object — Student is the odd one out, and is the role the real backend most needs to bootstrap first.
2. **Student data is single-tenant by construction.** Progress, performance, portfolio, and (mostly) exercise submissions are stored under flat, unscoped keys — there is no `studentId` column/property tying them to a specific student, because the app only ever assumes one. The one place a "student id" is threaded through (`ExerciseSubmission.studentId`) is populated with `STUDENT.name` — a display string, not a stable identifier.
3. **Admin has no independent data store.** Every Admin page is a 100% derived read model over the Student stores and the one Content Manager store (`contentPackages`). This is good news: "building the Admin backend" is mostly new *read* endpoints/queries over data the Student and Content Manager backends already own, not a new write-heavy subsystem.

The Content Manager domain (`contentPackages.ts`) is the single most structurally important store in the app — one JSON array currently plays the role of at least four different backend entities at once (import record, authored course/subject/session/content tree, review record, publication state). Content versioning has an already-documented, deliberately-not-fixed gap: publishing v2 never marks v1 "superseded" in storage — only a runtime resolution rule hides the old data from students. Section 16 lays out what a real backend needs to represent this correctly, without prescribing the schema.

---

## 2. Current MVP Architecture

**Stack** (from `app/package.json`): React `^19.2.8`, `react-dom` `^19.2.8`, `react-router-dom` `^7.18.2`, Tailwind `^4.3.3` (via `@tailwindcss/vite`), TypeScript `~6.0.2`, Vite `^8.2.0`, `jszip` `^3.10.1` (the only non-UI runtime dependency — used client-side to parse imported `.zip` content packages). Dev/test: `@playwright/test` `^1.62.1`, `oxlint` for linting. `tsconfig.app.json` runs in a fairly strict mode (`verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`).

**Routing:** One flat `<Routes>` table in `App.tsx` (`BrowserRouter`), no nested layouts/loaders/actions, no code-splitting. 34 routes total: public/marketing (Login, Signup, ForgotPassword, EmailVerification, Enrollment, Welcome), Student (Dashboard, MyCourse, SubjectPage, SessionPage, Performance, Portfolio, PortfolioView), Company (12 routes, out of scope), Content Manager (5 routes), Admin (6 routes). Unmatched paths redirect to `/login`.

**Persistence:** `window.localStorage` exclusively. No `sessionStorage`, no IndexedDB anywhere in `src/` (confirmed by search). Every read/write goes through a small `try { JSON.parse/stringify } catch { swallow }` pair, hand-written per file — there is no shared storage abstraction, no schema versioning, and no corruption recovery beyond "treat it as empty."

**Authentication:** Three structurally identical mock-auth implementations (Content Manager, Admin, Company): a `setTimeout` fake delay, then `localStorage.setItem` of a plain object, no password check, no server round-trip, first login on a fresh browser *creates* the account. Student's Login/Signup do the same fake-delay dance but persist nothing at all.

**Route guards:** Content Manager and Admin pages each self-guard in a `useEffect` (Admin was refactored into a shared `useRequireAdminAccount` hook; Content Manager pages still each repeat the same check inline) that reads `localStorage` synchronously and calls `navigate(path, { replace: true })` if the account is missing. **Student and Company pages have no route guard at all** — `/dashboard`, `/my-course`, `/session/:id`, etc. render unconditionally regardless of any "logged in" state.

**UI layout:** A shared `AppShell` component (topbar + collapsible desktop sidebar + mobile drawer) is parameterized by `navItems`/`roleLabel`/`onLogout`/`userName`, and wrapped per role by `StudentLayout` / `ContentManagerLayout` / `AdminLayout`. Company still uses an older, separate `CompanyHeader` pattern (out of scope, not touched).

**Testing:** Playwright end-to-end only — `app/tests/*.spec.ts` (`contentLifecycle`, `contentIsolation`, `adminFlow`, `appShellLayout`). No unit test runner is configured (no Jest/Vitest). Tests drive real routes and, in several places, read `localStorage` directly to assert internal state — they double as an accurate, currently-passing description of the exact storage shapes documented below.

---

## 3. Current Data Stores

Ten distinct `localStorage` keys exist, all discovered by searching for `nextstep2:` and `localStorage.(get|set|remove)Item` across `src/`. No others exist.

| Key | Defined in | Structure | Writers | Readers | Purpose | Role | → Backend? |
|---|---|---|---|---|---|---|---|
| `nextstep2:completedSessionIds` | `data/progress.tsx` | `string[]` (session ids) | `completeSession()` (ProgressProvider), called from `SessionPage.handleCompleteSession` | `useCourseData()` → Dashboard, MyCourse, SubjectPage, SessionPage, Performance, Portfolio, all Admin pages | Which sessions the (one) student finished | Student (Admin reads) | **Yes** — becomes a real per-student progress fact table |
| `nextstep2:performanceRecords` | `data/progress.tsx` | `Record<sessionId, SessionPerformanceRecord>` — a **map keyed by sessionId**, so re-completing a session **overwrites**, never accumulates | `recordSessionPerformance()`, same call site as above | `useCourseData()` → Performance.tsx, AdminDashboard, AdminStudents, AdminStudentDetail | Per-session score + activity breakdown | Student (Admin reads) | **Yes**, with an open question — see §9 |
| `nextstep2:portfolio` | `data/portfolio.ts` | One `PortfolioData` object: `{profile:{name,headline,bio}, skills:{category,skills[]}[], projects:PortfolioProject[], links:{email,linkedin,github}}` | `savePortfolio()` (Portfolio.tsx "Save Portfolio") | Portfolio.tsx, PortfolioView.tsx (**only its "Education" section** — see §27), AdminStudentDetail.tsx | Student's self-authored portfolio | Student (Admin reads) | **Yes** |
| `nextstep2:exerciseSubmissions` | `data/exerciseSubmissions.ts` | `ExerciseSubmission[]`, each `{id, studentId, sessionId, exerciseId, language, files:{name,content}[], submittedAt, attemptNumber}` | `createSubmission()` — `SessionPage.handleSubmitExercise` only | `getSubmissionsForSession()` (SessionWorkspace "previous submissions"), `getAllSubmissions()` (Admin only) | Every exercise attempt, append-only | Student (Admin reads) | **Yes** — see ID gap in §5 |
| `nextstep2:contentPackages` | `data/contentPackages.ts` | `ContentPackageRecord[]` — see §14 | `saveImportedPackage()` (Import), `updatePackageState()` (Request Changes/Approve/Publish) | Every Content Manager page; `publishedContent.ts` (consumed by Student session lookup **and** every Admin content page) | The entire Content Manager domain | Content Manager (writes); Student + Admin (read-derived) | **Yes** — the single biggest/most-decomposition-needed store |
| `nextstep2:contentManagerAccount` | `data/contentManager.ts` | `{name, email}` | ContentLogin.tsx | Every CM page's guard, `ContentManagerLayout` logout | Mock CM session | Content Manager | Replace with real auth; key disappears |
| `nextstep2:adminAccount` | `data/adminAccount.ts` | `{name, email}` | AdminLogin.tsx | `useRequireAdminAccount`, `AdminLayout` logout | Mock Admin session | Admin | Replace with real auth; key disappears |
| `nextstep2:companyAccount` | `data/company.ts` | `{id, companyName, workEmail, contactPerson, phone, website?, verificationStatus}` | CompanySignup/CompanyLogin | Company pages | Mock Company session | **Out of MVP scope** | Not designed here |
| `nextstep2:companyProfile` | `data/company.ts` | `{companyName, logo, description, industry, website, location, contactPerson, contactEmail, phone}` | CompanyProfile.tsx | Company pages | Company profile | **Out of MVP scope** | Not designed here |
| `nextstep2:hiringRequirements` | `data/hiring.ts` | `HiringRequirement[]` | CompanyHiringForm.tsx | Company pages | Job requirements | **Out of MVP scope** | Not designed here |

**Notable absence:** there is no `nextstep2:studentAccount` (or equivalent) key. Nothing in the codebase ever persists a Student identity — this is itself a finding, not an oversight in this table.

---

## 4. Entity Inventory

For each candidate entity: why it exists, where it lives today, its identifier, relationships, lifecycle, and whether it should be a stored entity vs. a derived/read model.

- **User** — Does not exist as a unified concept in the frontend at all. Each role has its own disconnected mock-account shape (`ContentManagerAccount`, `AdminAccount`, `CompanyAccount` — no `StudentAccount` at all). **Recommendation:** a backend `User` entity is the natural root of real auth even though the frontend has no equivalent yet.
- **Student** — `STUDENT` constant, `{name}` only, no id. "Owns" (implicitly, by being the only student) completedSessionIds/performanceRecords/portfolio/exerciseSubmissions, but none of those stores actually key by a student id today. Lifecycle: none — it's a compile-time constant. **Needs to become a real DB entity before anything else can be properly scoped.**
- **Content Manager account / Admin account** — `{name, email}`, no `id` field on either (contrast with Company's `CompanyAccount`, which *does* have a generated id, plus a documented backfill path in `loadCompanyAccount()` for accounts created before that field existed — a useful precedent for how this codebase has evolved a stored shape before). **DB entity:** yes, as a `User` with a role.
- **Course** — Exists in **two unreconciled places**: (a) `mock.ts`'s single hardcoded `COURSE = {id:"full-stack-web-development", title, description}`, the one course the real Student experience is built around, and (b) `ContentCourseFull` inside every imported package's `courses[]`, which can carry an *arbitrary* `id`/`title`/`description` with no enforced relationship to (a) unless a Content Manager deliberately matches the id. **DB entity: yes, but this dual-model split must be resolved as part of backend design** (not decided here — see §27).
- **Subject** — Same dual-model story: `mock.ts SUBJECTS_BASE[]` (6 hardcoded subjects) for the real Student experience, vs. `ContentSubjectFull` (author-supplied) inside packages.
- **Session** — `mock.ts`'s per-subject session lists are **partly hardcoded** (`SUBJECT_SESSIONS`, one subject: `frontend-development`) and **partly generated at read time**: `buildDefaultSessions()` synthesizes ids as `` `${subject.id}-session-${i+1}` `` for every other subject — meaning most session ids in the running app are recomputed from array position on every render, never stored anywhere. Packages separately carry author-supplied `ContentSession` (id/title/description/order). **DB entity: yes, but the generated mock.ts sessions need a deliberate migration decision** (materialize as real rows, vs. some other approach) — flagged, not resolved.
- **Session Content** — `SessionContent` (sessionContent.ts): objective/concepts/keyConcepts/examples/videoCheckpoint/practice/aiHelp/exercise/requiredActivities/projectConnection/delivery. Sourced from one of three places at read time: a hand-curated map (`SESSION_CONTENT`, exactly one entry today), a generic fallback (`buildDefaultSessionContent()`), or a published package override (`getPublishedSessionContent()`). It has no id of its own — it's identified only by the session it's attached to (1:1). `delivery` (live vs. recorded, `scheduledAt`, `durationMinutes`) is a **separate hardcoded map** (`SESSION_DELIVERY`), never authored through the Content Package pipeline — a distinct gap, see §27.
- **Content Package** — `ContentPackageRecord`: a whole ZIP-import event (id, fileName, packageVersion?, contentTeam?, importedAt/By, status, counts, validation, review sub-object, and — if valid — the *entire parsed course/subject/session/content tree embedded inline*). **DB entity: yes, but must be decomposed** — see §14/§20.
- **Content Review** — Not its own object; it's the `review` sub-object embedded in `ContentPackageRecord` (`{checklist: 8 booleans, notes, reviewedAt?, approvedAt?, publishedAt?}`). No reviewer identity is ever recorded. A new review **overwrites** the previous checklist/notes in place — there is no history of what an earlier "changes requested" round said once a later round approves. **DB entity candidate: yes, and probably its own table so history isn't destroyed** (not decided here).
- **Publication** — Not modeled as its own concept at all; it's just `status === "published"` plus `review.publishedAt` on the same package record. "Which package is live for this session" is answered by an *algorithm* (`resolveSessionStatuses()` / `getPublishedSessionContent()`), not a stored fact. **DB entity: yes — should become explicit** (see §16).
- **Enrollment** — Does not exist anywhere. There is exactly one Course and one implicit Student; nothing ever stores "this student is enrolled in this course" as a fact (Welcome.tsx just prints static text after signup). **Not required to reproduce current behavior**, but a real `Student` table will need *some* link to a course the moment it exists — flagged as an open backend design question, not resolved here.
- **Progress** — A derived read model today: percentages/statuses are pure functions over `completedSessionIds`, computed on every render, never stored. **DB entity:** the raw fact ("session X completed at time T by student Y") should be a table; percentages/statuses should stay derived, exactly mirroring current behavior.
- **Performance** — Same split: `SessionPerformanceRecord` (raw fact, currently one-per-session, overwritten on redo) should persist; `SubjectPerformance`/`CoursePerformance` (aggregates) are pure functions today (`performance.ts`) and should stay derived.
- **Exercise Submission** — Real append-only fact already (never overwritten, carries `attemptNumber`) — the closest thing in the codebase to an already-correct "event" shape. **DB entity: yes, low redesign risk.**
- **Portfolio / Portfolio Project** — Portfolio is a 1:1 profile-like object per student (not a list), with a nested list of Projects. **DB entity: yes** for Portfolio-as-profile and Projects as a child collection; Skills is currently an unnormalized `{category, skills:string[]}[]` blob — a modeling choice for later, not decided here.

---

## 5. ID Inventory

| ID | Current source | Type | Stable? | Globally unique? | Generated? | Hardcoded? | Safe for backend as-is? |
|---|---|---|---|---|---|---|---|
| `COURSE.id` (`"full-stack-web-development"`) | Literal in `mock.ts` | string | Yes (constant) | Only by convention | No | **Yes** | Only as a seed value — the frontend has no mechanism for more than one course |
| `Subject.id` (e.g. `"frontend-development"`) | Literal array (`SUBJECTS_BASE`) in `mock.ts` | string | Yes | Only by convention | No | **Yes** | Same caveat |
| `Session.id` | **Two origins**: (a) hardcoded literals in `SUBJECT_SESSIONS`, (b) **generated at read time** as `` `${subject.id}-session-${i+1}` `` in `buildDefaultSessions()` | string | (a) yes, (b) only as long as ordering/count never changes | Only by convention | (b) yes, from **array index** | (a) yes | **No** — (b) is effectively "array index used as identity"; must be materialized as stored ids before a backend can reference sessions reliably |
| `ContentPackageRecord.id` | `` `pkg-${Date.now()}-${Math.random().toString(36).slice(2,8)}` `` | string | Yes once created | **Not guaranteed** — no collision check | Yes, client-side | No | **No** — must become a server-generated id (same pattern repeats verbatim in `company.ts` `company-...`, `hiring.ts` `req-...`, `exerciseSubmissions.ts` `sub-...`, `portfolio.ts` `project-...`, and the never-persisted `preview-...` in `ContentPreviewSession.tsx`) |
| `course.id` / `subject.id` / `session.id` **inside an imported package** | Author-typed JSON in the ZIP (`course.json`/`subject.json`/`session.json`) | string | Only if the Content Team reuses the same id on re-import (nothing enforces or guides this) | **Not enforced across packages** — `validatePackage()` only checks uniqueness *within one package* | No | Effectively (hand-authored) | Needs a uniqueness/collision strategy before becoming a primary/foreign key |
| `ExerciseSubmission.studentId` | `STUDENT.name` (the display string `"Jordan Smith"`), passed at the one call site in `SessionPage.tsx` | string | **No** — breaks if the display name is ever edited | **No** — two students named "Jordan Smith" would collide | No | Effectively (a name reused as an id) | **No** — must become a real student id |
| `ExerciseSubmission.exerciseId` | Literally passed as `sessionId` at the one call site (`createSubmission(STUDENT.name, sessionId, sessionId, ...)`) | string | Tied to sessionId | Tied to sessionId | No | Effectively | Only safe as long as "exactly one exercise per session" stays permanently true; needs its own id the moment that changes |
| `ADMIN_STUDENT_ID` | `slugify(STUDENT.name)` in `adminStudents.ts`, generated purely to have something for the `/admin/students/:studentId` URL; the file's own header documents it as "not a real account id" | string | Yes (deterministic from name) | No | Yes (derived) | No | **No** — exists only because no real student id exists yet |
| Admin/Content Manager account id | **Does not exist** — `AdminAccount`/`ContentManagerAccount` have no `id` field at all | — | — | — | — | — | **No** — needed before a real `User` table can reference these |
| `packageVersion` (`PackageManifest.packageVersion`) | Free-text string from `package-manifest.json`, entirely optional | string | Author-controlled | Not enforced | No | Effectively | **Decorative today** — confirmed by search that it is stored/displayed but never read by any comparison/sorting logic; version resolution actually uses `importedAt`/`publishedAt` timestamps (§16) |

**React-key note:** wherever the UI maps over subjects/sessions (`.map((subject, index) => ...)`), the React `key` prop is always the real `id`, not the index — the index-as-identity problem is isolated to `buildDefaultSessions()`'s id *generation*, not to rendering.

---

## 6. Authentication Audit

| | Student | Content Manager | Admin |
|---|---|---|---|
| Login mechanism | `Login.tsx`: client-side field validation, `setTimeout(700ms)`, navigate to `/dashboard`. **Nothing is persisted.** | `ContentLogin.tsx`: same fake-delay pattern, then `saveContentManagerAccount({name: deriveContentManagerName(email), email})` | `AdminLogin.tsx`: identical pattern, `saveAdminAccount({name, email})` |
| Account storage | **None** | `nextstep2:contentManagerAccount` | `nextstep2:adminAccount` |
| Password handling | Typed, validated for presence + `/^\S+@\S+\.\S+$/` email shape (Signup additionally requires ≥8 chars + confirm-match); **never stored, never checked again by Login** | Same (Login only checks presence/shape) | Same |
| Session mechanism | None — there is nothing to expire or restore | `localStorage` key presence = "logged in", checked synchronously per page | Same, via shared `useRequireAdminAccount` hook |
| Route guards | **None** — every Student route renders unconditionally | Each CM page repeats the same `useEffect` guard inline | Centralized in `useRequireAdminAccount` |
| Logout | `StudentLayout`'s Log Out button just `navigate("/login")` — nothing to clear | `clearContentManagerAccount()` + navigate | `clearAdminAccount()` + navigate |
| Role isolation | N/A | Own key, never read/written by any other role's code | Own key, never read/written by any other role's code |
| What's known about "the current user" | Nothing — `STUDENT` is a global constant, not a session value | `{name, email}` derived from the typed email | `{name, email}` derived from the typed email |

**Security reality check (see §24 for the full list):** because "logged in" is nothing more than *a particular key existing in `localStorage`*, with no token/signature/expiry, any user can open devtools and run `localStorage.setItem('nextstep2:adminAccount', '{"name":"x","email":"x@x.com"}')` to self-grant Admin. This is expected and acceptable for a prototype, but it means **zero** of the current role isolation is a real security boundary — it holds today only because nothing malicious is attempting to break it.

**What the backend must eventually provide** (derived from what the frontend needs, not decided here): a `User` with `id`, `email` (unique), `passwordHash`, `role` (`student | content_manager | admin`), `createdAt`, `updatedAt`, some `status` (active/disabled — nothing in the current UI has a disabled-account concept, but Admin's "no destructive actions" boundary implies one may eventually be needed), and a real session/token mechanism (cookie or JWT) checked server-side on every request — not just used to decide what the client renders.

---

## 7. Role / Authorization Matrix

Built strictly from observed behavior (including what Playwright tests assert is *absent*, e.g. Admin's lack of Approve/Publish buttons).

| Capability | Student | Content Manager | Admin |
|---|:---:|:---:|:---:|
| View own dashboard/progress | ✓ | | |
| Complete a session | ✓ | | |
| Submit an exercise | ✓ | | |
| View/edit own portfolio | ✓ | | |
| View **published** content | ✓ | | |
| View **draft/unpublished** content | | ✓ (via Preview) | (metadata/status only — not the authored content body, see §12) |
| Import a content package | | ✓ | |
| Review a content package (checklist + notes) | | ✓ | |
| Request changes | | ✓ | |
| Approve content | | ✓ | |
| Publish content | | ✓ | |
| View all students | | | ✓ |
| View a student's detail (learning/performance/portfolio) | | | ✓ (read-only) |
| View content overview / status by course | | | ✓ (read-only) |
| Mutate any student data | | | **No — confirmed no `<input>`/`<textarea>` exists on any Admin page** |
| Mutate any content (approve/publish/edit) | | | **No — confirmed absent from the UI, verified by tests** |

**Backend authorization rules implied (not decided in detail here):**
- A Student must only ever read/write records where `studentId === self`.
- A Content Manager must be able to write `ContentPackage`/`Review`/`Publication` records, but must never read Student progress/performance/portfolio data (the current frontend never does this either — no CM page imports anything from `progress.tsx`/`performance.ts`/`portfolio.ts`/`exerciseSubmissions.ts`).
- Admin must have read access across Students and Content, but **zero write access** to either domain — this must be enforced server-side, not just by omitting buttons client-side as today.
- **Unpublished content must never be served to a Student-scoped request**, regardless of what the Student's client asks for — today this "boundary" is just a function (`getPublishedSessionContent`) never being called with the wrong status; a real backend must enforce it as an actual authorization/query filter.

---

## 8. Student Data Model

Tracing Login → Dashboard → Course → Subject → Session → Learn/Video → Practice → AI Help → Exercise → Completion → Performance → Portfolio:

| Stage | Data required | Current source | Persisted? | Identifier | Relationship | Backend requirement |
|---|---|---|---|---|---|---|
| Login | email/password | `Login.tsx` form | No | — | — | Real auth (§6) |
| Dashboard | `COURSE`, `subjects[]` w/ status, `courseProgress`, `currentSession` | `mock.ts` (hardcoded) + `progress.tsx` (derived from `completedSessionIds`) | Partial (only completion facts) | `COURSE.id`, `Subject.id` | Subject ⊂ Course | Course/Subject as real entities; progress as real facts |
| Course (`/my-course`) | Same subjects list + progress % | Same | Same | Same | Same | Same |
| Subject (`/my-course/subject/:id`) | `subject.sessions[]` w/ status | `getSubjectDetail()` (mock.ts, derived) | Same | `Session.id` (see §5 gap) | Session ⊂ Subject | Session as a real entity with a **stable, stored** id |
| Session (`/session/:id`) | `SessionContent` (objective/concepts/video/checkpoint/practice/aiHelp/exercise/requiredActivities), current progress % | `getSessionContent()` — curated map → published-package override → generic fallback (see §4) | Content itself: yes (inside `contentPackages`) if published; otherwise hardcoded/generated | Session id | Content 1:1 ⊂ Session | Session Content as a real, versioned entity (§13/§16) |
| Learn/Video | YouTube URL + title, `videoCheckpoint` (question/options/correctIndex) | Same `SessionContent` | Same | — | — | Same |
| Practice | task, starterCode, checklist labels, language | Same | Same | — | — | Same (checklist is authored *labels*, never a pass/fail value — see §9) |
| AI Help | `quickPrompts[]`, canned `replies` keyed by exact prompt string, `defaultReply` | Same | Same | — | — | **Not a live AI integration today** — static authored Q/A content (see §26) |
| Exercise | objective, requirements, starterCode, language | Same | Same | — | — | Same |
| Completion | which `requiredActivities` were done, triggers `completeSession()` + `recordSessionPerformance()` | `SessionWorkspace.handleCompleteSession` (in-memory UI state) → `progress.tsx` | **Yes**, on click | `sessionId` | Completion 1:1 per (student, session) — but student is implicit | Real per-student progress fact (§9) |
| Performance | score breakdown from the completion above | `performance.ts` `calculateSessionScore()` | Yes, same click | `sessionId` (map key — overwrites) | 1:1 per (student, session), **not append-only** | See §9's open question |
| Portfolio | profile/skills/projects/links | `Portfolio.tsx` "Save Portfolio" | Yes | None (single object) | 1:1 per student | Real per-student portfolio entity |

Key files inspected for this section: `progress.tsx`, `performance.ts`, `portfolio.ts`, `exerciseSubmissions.ts`, `sessionContent.ts`, `practiceExecution.ts` (execution provider abstraction, not a data store — see §26).

---

## 9. Student Progress Model

- **What identifies a completed session:** membership of `sessionId` in the flat `string[]` at `nextstep2:completedSessionIds`. There is **no per-completion timestamp in this store** — the only timestamp anywhere near "when was this session completed" lives on the *separate* `performanceRecords` entry for that session (and only if performance was recorded at the same moment, which it always is today since both writes happen together in `SessionPage.handleCompleteSession`).
- **Per student?** Conceptually yes, but structurally no — the key is global, not scoped by a student id, because the app only ever has one implicit student.
- **Survives refresh?** Yes — it's `localStorage`, not component state.
- **Reversible?** Not through any UI — there is no "mark incomplete" control anywhere. Only manual `localStorage` editing (e.g., in tests) reverses it.
- **Default state is not empty:** `getDefaultCompletedSessionIds()` seeds a fresh browser with an entire subject (`web-foundations`) plus the first session of `frontend-development` already marked complete, "to reproduce the baseline this course was originally demoed with" (per the code comment). **A real backend must decide whether a brand-new student starts truly empty or with this same seeded baseline** — current behavior is the latter, and this audit does not decide which is correct going forward.
- **How performance relates to completion:** they are written together, at the same instant, from the same `handleCompleteSession` call — but they are two independent stores with no foreign-key relationship enforced; nothing prevents them from drifting apart if either write path changes.

**Recommended backend representation (conceptual, not schema-final):** a `SessionCompletion` fact — `{studentId, sessionId, completedAt}` — append- or upsert-semantics per (studentId, sessionId), which both drives "is this done" (progress) and anchors the performance record via a shared key or timestamp.

---

## 10. Performance Model

Exact current mechanics, from `performance.ts` (comments deliberately preserved as documentation of intent):

- Of the four tracked session activities, only two ever contribute a *score*:
  - **Video Check** — 100 if the student's answer was correct, 0 if not (only counted if `completed`).
  - **Practice** — `round(passedCount / totalCount * 100)` from the practice checklist (only counted if `completed` and `totalCount > 0`).
  - **Learning** and **Exercise** are completion-only and never affect score.
  - **AI Help is not a scored activity at all.**
- `calculateSessionScore()` averages whichever of the two scoreable activities were completed; returns `null` (not `0`) if nothing scoreable was completed — the UI explicitly renders "Not scored yet" rather than a fabricated zero.
- The computed `score` is **stored at write time** on the `SessionPerformanceRecord`, not recomputed later. If the scoring algorithm ever changes, historical records keep their old score — they are not retroactively recalculated. (**This audit does not redesign the algorithm** — the backend should preserve this exact business behavior unless a future decision explicitly changes it.)
- `SubjectPerformance`/`CoursePerformance` (average score, sessions completed, scored-session count) are **pure functions computed at read time** over whatever `SessionPerformanceRecord`s exist — never separately stored.
- **Overwrite, not append:** because `performanceRecords` is a map keyed by `sessionId`, redoing a session **replaces** its previous performance record entirely. There is currently no history of a student's earlier attempt at the same session's Video Check/Practice.
- Student relationship: implicit, same single-tenant caveat as §9.

**Open question flagged for backend design (not decided here):** does the backend want to preserve today's "one current record per session, overwritten on redo" semantics, or capture full attempt history (more naturally aligned with how `ExerciseSubmission` already works)? Either is compatible with the *currently observable UI behavior*, since the UI only ever displays the latest state.

---

## 11. Exercise Submission Model

From `exerciseSubmissions.ts`, `ExerciseCodeEmbed.tsx`, `practiceExecution.ts`, and `SessionPage.tsx`:

- **Structure:** `{id, studentId, sessionId, exerciseId, language, files:{name,content}[], submittedAt, attemptNumber}`.
- **Files** are plain `{name, content}` text pairs (source code as a string) — never binary, never uploaded as actual files. Captured live from OneCompiler's embedded editor via a validated `postMessage` channel (`parseOneCompilerChangeEvent`), which checks the message origin, source window, and shape before trusting anything — no execution/output is ever captured, only the code the student wrote.
- **Language/session/exercise:** `language` is a free string (drives which OneCompiler embed loads); `sessionId` is real; `exerciseId` is **not independent today** — see §5.
- **Student:** `studentId` is `STUDENT.name` — see §5.
- **Attempt number:** increments per `sessionId`, starting at 1, computed as `existingSubmissionsForThisSession.length + 1` at write time — never resets, never reused.
- **Timestamp:** `submittedAt`, set at write time.
- **Persistence / retention:** append-only — `createSubmission()` always pushes a new record, **never overwrites** a previous one. All previous attempts are retained and shown in the UI ("Previous submissions" list in `SessionWorkspace`).
- **Grading:** none exists. The UI explicitly tells the student "This exercise has not been automatically graded yet." There is no autograder, no result/score attached to a submission anywhere in the codebase.
- **OneCompiler stays an external editor/execution provider** — the backend does not need to run student code. It only needs to store what was submitted (text). This audit does **not** propose building an execution engine.

**Backend requirement:** an `ExerciseSubmission` table, close to a direct lift of the current shape, with `studentId`/`exerciseId` upgraded to real ids (§5) and `files` stored as JSON or a normalized child table.

---

## 12. Portfolio Model

From `portfolio.ts`, `Portfolio.tsx`, `PortfolioView.tsx`:

- **Structure:** one `PortfolioData` per student — `profile:{name,headline,bio}`, `skills:{category,skills:string[]}[]`, `projects:PortfolioProject[]`, `links:{email,linkedin,github}`.
- **Project structure:** `{id, title, description, technologies:string[], projectUrl, githubUrl}` — plain text link fields, **no file/image upload anywhere in the whole app** for portfolio content.
- **Ownership:** implicitly the one student (single global object, no `studentId` field on it at all — the `studentName` parameter `loadPortfolio()`/`getDefaultPortfolio()` take is only used to seed the *default* profile name, not as a storage lookup key).
- **Editing behavior:** full in-place edit — `Portfolio.tsx`'s "Save Portfolio" replaces the entire object; no per-field/per-project versioning or history.
- **Skills** are an unnormalized `{category, skills[]}` blob keyed against a fixed `SKILL_CATEGORIES` list (`Frontend`, `Backend`, `Database`, `AI`) defined in the page component itself, not in `portfolio.ts`.
- **Important gap — two different "portfolio" surfaces:** `Portfolio.tsx` (edit + view) is backed by this real, student-authored store. **`PortfolioView.tsx` (the "public portfolio site" preview) is almost entirely backed by a separate, explicitly-labeled demo file, `portfolioDemoContent.ts`** — its own header states everything there is "fabricated sample content... NOT real student data" and that only the "Education" section (sourced from `useCourseData()`, i.e. real progress) is wired to anything real. **The backend should not assume `PortfolioView.tsx`'s current on-screen content reflects real student data** — see §27.

**Backend requirement:** a `Portfolio` (1:1 per student, or a `Student` sub-document) plus a `PortfolioProject` child collection.

---

## 13. Content Model

The full hierarchy exists in code in **two parallel forms**, as already noted in §4 — this section gives the exact field-level shapes for both.

**A. The real Student-facing structure (`mock.ts`):**
```
COURSE { id, title, description }                         — one hardcoded course
  ↓
Subject { id, title, description, status, progress? }      — 6 hardcoded (SUBJECTS_BASE)
  ↓
Session { id, title, description, status }                 — hand-authored for one subject
                                                               (SUBJECT_SESSIONS), generated
                                                               for the rest (buildDefaultSessions)
```

**B. The authored/importable structure (`contentPackages.ts`, mirrors `NEXTSTEP2_CONTENT_AUTHORING_STRUCTURE.md`):**
```
ContentCourseFull { id, title, description, subjects[] }
  ↓
ContentSubjectFull { id, courseId, title, description, subtitle?, order, sessions[] }
  ↓
ContentSession { id, subjectId, title, description, order, content: ContentSessionContent | null }
  ↓
ContentSessionContent {
  objective, concepts[], keyConcepts[], examples[], estimatedDuration?,
  video?: {youtubeUrl, title, durationSeconds?},
  videoCheckpoint?: {question, options[], correctIndex},
  practice: {task, starterCode?, checklist:string[] (LABELS ONLY, never pass/fail), language},
  aiHelp: {quickPrompts[], replies:Record<prompt,reply>, defaultReply},
  exercise: {objective, requirements[], starterCode?, language},
  requiredActivities: ActivityKey[],
  projectConnection?
}
```

The runtime `SessionContent` type (`sessionContent.ts`) that actually renders in `SessionWorkspace` is the same shape minus authoring-only fields, plus `delivery?` (live/recorded) and with `practice.checklist` as `{label, passed}[]` — the `passed` value is filled in as a **neutral placeholder `true`** when adapting authored content for preview/publish (`toPreviewSessionContent()`), never a claim about a real student's work, per the code's own explicit comment. This adaptation is the one and only place authored content ("labels") and runtime content ("label + passed") interact.

**Validation (`validatePackage()`):** collects every issue in one pass (never throws on the first error). Required: package manifest present/parseable; ≥1 course; course id/title/description; ≥1 subject per course; subject id (unique within package)/courseId (must match a course in-package)/title/order; ≥1 session per subject; session id (unique within package)/subjectId (must match its subject)/title/description/order; `content.json` present; learning objective; practice task+language (+checklist items must be plain strings, not `{label,passed}` objects); AI Help `defaultReply` (+ every `quickPrompt` must have a matching `reply`); exercise objective+language. Video is a **warning**, not an error, if absent; if present, `youtubeUrl` must match a specific regex and have a `title`. Video Check (`videoCheckpoint`) is only required if `requiredActivities` includes `"videoCheck"`.

---

## 14. Content Package Model

`ContentPackageRecord` (full current shape):
```
{
  id, fileName, packageVersion?, contentTeam?,
  importedAt, importedBy,                 // importedBy = the CM's typed login EMAIL, a string — not a User id (none exists, see §5)
  status: "draft" | "invalid" | "changes_requested" | "approved" | "published",
  courseCount, subjectCount, sessionCount,
  validation: {valid, errors[], warnings[]},
  review?: {
    checklist: {course,structure,sessions,videos,practice,aiHelp,exercises,ready: boolean},
    notes, reviewedAt?, approvedAt?, publishedAt?
  },
  courses?: ContentCourseFull[]           // present only when status !== "invalid"
}
```
- **Package identity:** `id` (client-generated, see §5 for the "not safe for backend" caveat).
- **Course/subject/session identity:** author-supplied strings inside `courses[]`, unique only within this one package (§5).
- **Version identity:** does not exist as a first-class concept — see §16.
- **Review identity:** does not exist — the `review` object has no id, is embedded in the package record, and is overwritten in place on each review action.
- **Publication identity:** does not exist — `status === "published"` + `review.publishedAt` on the *same* record is the entire model.
- **Timestamps:** `importedAt` (always set), `review.reviewedAt`/`approvedAt`/`publishedAt` (set incrementally as the workflow progresses — `reviewedAt` is set to "now" the *first* time any review action happens, whether it's a Request Changes or an Approve, and is never updated again after that).
- **Reviewer:** never recorded, for any action (see §18).
- **Status:** the single field driving all UI branching across Content Manager, Student visibility, and Admin — see §16.

**An invalid package has no `courses` at all** — "an invalid import is never usable data," per the code's own comment — this is intentional, not a bug.

---

## 15. Review / Approval Model

From `ContentPackageDetail.tsx`'s `saveReview()`/`handleRequestChanges()`/`handleApprove()`/`handlePublish()`:

- **Checklist:** exactly 8 fixed booleans — `course`, `structure`, `sessions`, `videos`, `practice`, `aiHelp`, `exercises`, `ready`. Editable only while status is `draft` or `changes_requested`.
- **Notes:** free-text, required (client-side `alert()`-enforced, not server-validated — there is no server) before Request Changes can be submitted.
- **Request Changes:** requires non-empty notes; sets status to `changes_requested`; does **not** clear the checklist state.
- **Approve:** requires **all 8** checklist booleans true; shows a `window.confirm()`; sets status to `approved`, stamps `approvedAt`.
- **Publish:** available only when `approved`; shows a `window.confirm()`; sets status to `published`, stamps `publishedAt`.
- **No reviewer identity is ever captured** at any of these steps — only `reviewedAt`/`approvedAt`/`publishedAt` timestamps, no "who". This is a genuine gap for any real audit requirement (§18).
- **History:** none. Each action **overwrites** `checklist`/`notes`/timestamps on the same record via `updatePackageState()` — there is no way to see what an earlier "changes requested" round said once the package is later approved.
- **"Re-import the corrected package" is a brand-new, unrelated record** — the current app has no linkage between an original `changes_requested` package and whatever gets re-imported afterward. They just happen to be reviewed in sequence by a human.

**Not redesigning the workflow** — this section documents exactly what exists so the backend reproduces it faithfully, with persistence, before any workflow improvements are considered.

---

## 16. Publication / Versioning Model

This is the most important "do not assume the schema, just name the gap" section, per the task brief.

**Exact current mechanism** (`publishedContent.ts`):
- `getPublishedSessionContent(courseId, subjectId, sessionId)` filters all packages to `status === "published"`, sorts them by `review.publishedAt ?? importedAt` **descending**, and returns the content from the **first** package (in that order) whose embedded tree contains a matching course/subject/session. This is what makes "publish a corrected v2" actually replace what a student sees — it depends entirely on this sort-and-pick-first rule, not on any explicit "this record is superseded" flag.
- `resolveSessionStatuses()` (used by every Admin content page) generalizes the same idea to *all* statuses: for every (courseId, subjectId, sessionId) key across every non-invalid package, it picks one "winning" record using `STATUS_RANK` precedence (`published` > `approved` > `changes_requested` > `draft`) with the same recency tiebreak within a tier — so Admin's view of a session's status can never disagree with what a student would actually see for the published tier.

**The already-known, deliberately-not-fixed limitation** (matches the prompt's own description exactly): when v2 is published after v1, **v1's own `ContentPackageRecord` silently stays `status: "published"` forever.** Nothing marks it superseded. The *student-facing resolution is correct* (because of the sort above), but the Content Manager's own package list can show two "Published" cards for what is, conceptually, the same live session — and there is no stored fact anywhere that says "v1 is dead, v2 is the current version of this session."

**Conceptual pieces a backend needs to name (not schema-decided here):**
- **Content Version** — an immutable snapshot of one session's authored content, tied to the package/import that produced it.
- **Publication** (a fact, not a status field) — "version X of session Y went live at time T," ideally with an explicit `supersededAt`/`isCurrent` marker so "what is live right now" is a direct query, not a sort-and-pick-first computation repeated on every read.
- **Review** (see §15) as its own historied record per package/version, not an overwritten sub-object.
- A clear rule for **what happens to the previous Publication record** the instant a new one for the same session goes live — this is precisely the gap the current prototype leaves open, and precisely what the backend should close.

---

## 17. Admin Data Requirements

Every metric Admin currently displays, with its exact source (from `AdminDashboard.tsx`, `AdminStudents.tsx`, `AdminStudentDetail.tsx`, `AdminContent.tsx`, `AdminContentDetail.tsx`):

| Metric | Source | Calculation | Backend requirement |
|---|---|---|---|
| Students | `getAllStudentIds().length` | Always `1` today (`adminStudents.ts` hardcodes a one-element array) | Query: count of Student rows |
| Active Students | `performanceRecords.length > 0 ? studentsCount : 0` | A coarse proxy — "has this student completed at least one real session" — **no real "active" definition exists anywhere** | Needs a real, agreed definition once >1 student exists; today's proxy is not a designed metric, it's what was derivable |
| Courses | Hardcoded `1` in `AdminDashboard.tsx`, with a code comment explaining the platform has exactly one real course today | N/A | Query: count of Course rows (once Course is a real entity — see §4's dual-model gap) |
| Published Sessions | `resolveSessionStatuses().filter(s => s.status === "published").length` | Deduplicated per (course,subject,session) — see §16 | Query over the Publication concept in §16 |
| Content Awaiting Review | Count of `ContentPackageRecord`s with `status === "draft"` | Package-level, not session-level | Query: packages/reviews pending |
| Changes Requested | Count with `status === "changes_requested"` | Same | Same |
| Needs Attention | The two counts above, surfaced as clickable rows linking to `/admin/content` | Derived, not stored | Same two queries |
| Recent Activity | Merged, sorted-desc, capped-to-8 list built from: package `importedAt`, `review.publishedAt` (else `approvedAt`, else — if `changes_requested` — `reviewedAt`), and every `performanceRecords` entry's `completedAt` | **Nothing is stored as "an activity"** — it's reconstructed at render time from timestamps that already exist on other records | See §18 — this is not currently backed by any audit/event concept |
| Student progress/performance/portfolio summary (Student Detail) | `useCourseData()` + `loadPortfolio(STUDENT.name)` + `getAllSubmissions()`, all live reads | Same functions the Student's own pages use | Same queries, scoped to `:studentId` |
| Content status (Content Overview / Course Detail) | `resolveSessionStatuses()`, grouped by `courseId` then `subjectId` | Same deduplicated resolution as §16 | Same |

**Nothing here is invented** — every number traces to a real function call in the current codebase; several (Active Students, Courses) are explicitly documented in their own source comments as coarse/placeholder because the real underlying data doesn't exist yet.

---

## 18. Activity / Audit Requirements

**No audit or event table exists anywhere in the codebase.** Every "activity" Admin shows is reconstructed at render time from timestamps that already live on *other* records for *other* purposes (package import/review/approve/publish timestamps; performance `completedAt`). Confirmed activity types currently derivable: student completed a session, package imported, package approved, package published, package sent back with changes requested.

**What is missing for a real audit trail:**
- **No actor is ever recorded** for review/approve/publish actions — only `importedBy` (a typed email string, not a User id) is captured anywhere in the review workflow; `reviewedAt`/`approvedAt`/`publishedAt` have no accompanying "by whom."
- **No event log** — if a package's status changes twice in a row (e.g., approved then somehow reverted), the previous state is simply overwritten; there is no history of transitions.
- **No student-side event log beyond the two overwritten/append stores** already described (§9 performance overwrite, §11 submissions append).

**Recommendation (not built here):** the backend will likely want a genuine audit/event table (`{id, actorUserId, action, entityType, entityId, at, metadata}`) the moment real multi-user accountability matters — but this is a **SHOULD HAVE**, not required to reproduce current observable behavior, since the current UI never displays "who" did anything.

---

## 19. File / Asset Requirements

- **Content package ZIPs:** uploaded via `<input type="file">`, parsed **entirely in-browser** with `jszip`. **The original ZIP binary is never stored anywhere** — only the parsed JSON tree survives, inside `ContentPackageRecord.courses`. After import, there is no "download the original package" capability because there is no original package left.
- **Video:** never uploaded or stored as a file — only a `youtubeUrl` string (regex-validated) + `title`, rendered via a public `<iframe src="https://www.youtube.com/embed/{id}">`. No video file ever touches the app.
- **Starter/practice/exercise code:** plain strings embedded directly in authored JSON — no separate asset handling.
- **AI Help content:** a static, hand-authored Q/A string map (`quickPrompts` + `replies` + `defaultReply`), matched by **exact prompt string**, with one fallback reply. **This is not a live AI integration** — despite the name, no AI service is called anywhere in the codebase (see §26).
- **Portfolio:** no file/image upload anywhere — `projectUrl`/`githubUrl` are plain text link fields.
- **Exercise submissions:** code is plain text, never a binary file.

**Conclusion:** the only thing resembling "file storage" today is the imported ZIP, and it's transient (in-browser only, discarded after parsing). **Nothing durable currently requires object storage.** A real backend implementation will very likely *want* to retain original ZIPs for traceability/re-download (a **SHOULD HAVE**, not required to match current behavior) and will need a storage location for that — no vendor is chosen here.

---

## 20. API Requirements

Derived directly from what the frontend actually needs at each screen — illustrative groupings, not an implementation design.

**AUTH**
```
POST /auth/login          (per role, or role-aware — today 3 separate mock flows exist)
POST /auth/logout
GET  /auth/me
```

**STUDENT**
```
GET  /student/me
GET  /student/course                       (today: singular — one course)
GET  /student/subjects
GET  /student/subjects/:id
GET  /student/sessions/:id                 (resolves published-content override, curated, or fallback)
POST /student/sessions/:id/complete        (writes progress + performance together, as today)
GET  /student/progress
GET  /student/performance
POST /student/exercises/:sessionId/submissions
GET  /student/exercises/:sessionId/submissions
GET  /student/portfolio
PUT  /student/portfolio
```

**CONTENT MANAGER**
```
POST /content/packages/import              (upload + parse + validate + store as draft/invalid)
GET  /content/packages
GET  /content/packages/:id
POST /content/packages/:id/request-changes (notes required)
POST /content/packages/:id/approve         (checklist required)
POST /content/packages/:id/publish
GET  /content/packages/:id/preview/:courseId/:subjectId/:sessionId   (read-only, draft content)
```

**ADMIN** (all read-only, matching the confirmed absence of any mutation UI)
```
GET  /admin/dashboard                      (metrics + needs-attention + recent-activity)
GET  /admin/students
GET  /admin/students/:id
GET  /admin/content                        (course-level rollup)
GET  /admin/content/:courseId              (subject/session drill-down)
```

**Not derived/needed for this MVP:** anything Company/Hiring-shaped, any content-authoring/editing endpoint (Content Manager only imports pre-authored packages, never edits content in-app), any AI endpoint (§19/§26), any execution/grading endpoint (§11).

---

## 21. Database Requirements (Conceptual — no engine chosen)

**Entities, relationships, and cardinality**, verified against the actual code (not the illustrative ER sketch in the task prompt, which this audit corrected against real findings — notably, Course/Subject/Session's *current dual-model split* and the *lack of a real Enrollment concept*):

```
User (id, email, passwordHash, role, status, createdAt, updatedAt)
  1───1 StudentProfile (name, ...)                [only when role = student]
  1───1 ContentManagerProfile (name, ...)          [only when role = content_manager]  — or just User.name
  1───1 AdminProfile (name, ...)                   [only when role = admin]            — or just User.name

Course (id, title, description)
  1───* Subject (id, courseId, title, description, order)
          1───* Session (id, subjectId, title, description, order)
                  1───1 SessionContent (current/live authored content — see §16 for how "current" is decided)

ContentPackage (id, fileName, packageVersion?, contentTeamLabel?, importedByUserId, importedAt, status, validation)
  1───* ContentVersion (an immutable snapshot of one session's authored content, produced by this package)
                  *───1 Session   (which real session this version targets)
  1───1 Review (checklist, notes, reviewedByUserId?, reviewedAt?, approvedByUserId?, approvedAt?)
  1───* Publication (contentVersionId, publishedByUserId?, publishedAt, supersededAt?)   — see §16, not schema-final

Student (= User with role=student)
  1───* SessionCompletion (studentId, sessionId, completedAt)
  1───* SessionPerformance (studentId, sessionId, activities, score, recordedAt)   — overwrite-or-append TBD, §10
  1───* ExerciseSubmission (studentId, sessionId, exerciseId, language, files, submittedAt, attemptNumber)
  1───1 Portfolio (profile fields, links)
          1───* PortfolioProject (title, description, technologies, projectUrl, githubUrl)
```

**Ownership:** every Student-scoped row's `studentId` foreign key must reference the real `User`/`Student` id (§5's biggest fix). Every Content row's "who did this" fields are currently absent and should be added (§15/§18).

**Uniqueness constraints clearly implied by current code:**
- `User.email` unique (already what Login/Signup validate the *shape* of, never uniqueness, since nothing is stored).
- `Session.id` unique within its Subject at minimum (today only enforced *within one package* by `validatePackage()` — cross-package/global uniqueness is not enforced at all).
- `(studentId, sessionId)` should be unique for `SessionCompletion` (today: `completedSessionIds` is already a `Set`-like array, so this holds implicitly).

**Indexes clearly implied:** lookups are always by `studentId` (all Student-owned tables), by `(courseId, subjectId, sessionId)` (content resolution, §16), and by `status` (Content Manager's package list, Admin's dashboard counts).

---

## 22. Backend Data Ownership

| Owner | Owns |
|---|---|
| **Student** | `SessionCompletion`, `SessionPerformance`, `ExerciseSubmission`, `Portfolio`/`PortfolioProject` |
| **Content Manager** | `ContentPackage`, `ContentVersion`, `Review`, `Publication` |
| **Admin** | Nothing — reads across both of the above, confirmed by the total absence of any Admin mutation UI |
| **Shared/platform** | `User`, `Course`/`Subject`/`Session` (the "source of truth" structure a Publication ultimately targets) |

**Backend must enforce ownership server-side** — today it is enforced by nothing except "the UI never renders a control that would violate it," which (per §6/§24) is not a real boundary against a determined or careless actor.

---

## 23. File / Object Storage

Restating §19's conclusion in storage-requirement terms:

- **MVP-required:** none — nothing durable is missing today that the current UI needs to keep working.
- **Likely SHOULD HAVE once a backend exists:** retained original content package ZIPs, for traceability/re-download and to stop losing the source artifact the moment it's parsed (today's behavior).
- **FUTURE (not needed for this MVP, not decided here):** portfolio project images/assets, if that feature is ever added — nothing in the current app implies it's coming.
- No storage vendor is selected here, per instructions.

---

## 24. Security Requirements

Derived strictly from what the actual application does and doesn't do today:

- **Password hashing:** none exists (passwords aren't even stored) — backend must hash (e.g., a standard adaptive hash) before persisting any real credential.
- **Real authentication:** must replace all three mock login flows (Student doesn't even have one to replace — it must be built from nothing) with actual credential verification and a server-issued session/token.
- **Server-side authorization:** must exist — today's "authorization" is 100% client-side (route guards that just check `localStorage`), which is directly bypassable.
- **Student data ownership checks:** every read/write of `SessionCompletion`/`SessionPerformance`/`ExerciseSubmission`/`Portfolio` must be scoped to the authenticated student's own id — today there's no such check because there's no such id to check against.
- **Content Manager permissions:** import/review/approve/publish must require the `content_manager` role server-side.
- **Admin read access:** must be enforced as read-only server-side — today it's read-only only because the UI never offers a mutation control.
- **Unpublished content protection — the most concrete, currently-real exposure:** today, *any* browser can run `localStorage.getItem('nextstep2:contentPackages')` and read every draft package's full authored content, because it's all sitting in that one client-side blob regardless of status. The moment this becomes a shared backend, **a Student-scoped request must be structurally incapable of receiving non-published content** — not just "the UI happens not to ask for it."
- **Published-content visibility:** must resolve using the same rule §16 describes (only `published`, most-recent-wins) — reimplemented server-side, not left to a client-trusted computation.
- **Submission ownership:** an `ExerciseSubmission` write must be tied to the authenticated student, not a client-supplied `studentId` string (today's literal display-name value is exactly the kind of client-trusted field that must not survive into the backend).
- **File upload validation:** the ZIP importer currently trusts whatever `jszip` can parse, with no size limit, no MIME/type enforcement beyond "does it parse as a zip," and validation (`validatePackage()`) that only checks structural/content correctness, never malicious content. A backend importer must re-validate everything server-side and never trust client-reported structure.
- **Package validation:** must be re-run server-side on import — today it's 100% client-side and easily bypassed by anyone calling a future API directly.
- **Auditability:** does not exist today (§18) — flagged as a requirement to consider, not decided.

---

## 25. Non-Functional Requirements

**MUST HAVE FOR MVP** (matching today's actual, small-scale usage pattern):
- Correctness for a **single small dataset** — the entire current app assumes one student, a handful of content packages, and a handful of sessions; nothing about current usage implies high concurrency.
- Basic error handling for the flows that already have client-side error states today (import failures, "package not found," "session not found," empty states) — the backend equivalents of these must exist so the frontend's existing error UI has something real to render.
- Reasonable response times for the small MVP dataset — nothing in the current app has been measured under load, since there is no network today.

**SHOULD HAVE:**
- **Pagination** — nothing paginates today because every list is small (1 student; a handful of packages; a handful of sessions), but this should exist **from day one of the backend** even though the current UI never needs it, since student/package counts will grow past "renders fine unpaginated" quickly.
- Package size limits for ZIP import (none exist today).
- Basic logging of backend requests/errors (nothing exists today — there is no backend to log).

**FUTURE / SCALE (explicitly not needed to match current MVP behavior):**
- Caching layers (nothing to cache yet — no repeated expensive queries exist in the current app's data shape).
- Backups/disaster recovery process (no data exists to back up yet beyond what a fresh backend starts with).
- High-concurrency handling for many simultaneous students.
- Database indexes beyond the "clearly implied" ones in §21 (additional ones should be added based on real query patterns once they exist, not guessed now).

---

## 26. Third-Party Dependencies

| Service | What the frontend uses | Backend interaction needed? | API key? | Stay frontend-only? |
|---|---|---|---|---|
| **OneCompiler** | Public `https://onecompiler.com/embed/{language}` iframe for Practice/Exercise code editing + running, plus a documented `postMessage` protocol (`populateCode` in, `action:"change"` events out) — see `practiceExecution.ts` | No — backend only ever needs to store the *text* a student submitted (§11), never talk to OneCompiler itself | No — public embed, no key | **Yes, stays frontend-only.** The code's own comment flags an open commercial question: *"Whether their terms permit embedding inside a commercial LMS product long-term has NOT been confirmed... Do not treat this as a cleared-for-production dependency."* This is a real business/legal item to resolve, not a technical one. |
| **YouTube** | Public `https://www.youtube.com/embed/{id}` iframe for session videos | No — backend only stores the URL string | No | Yes, frontend-only |
| **jszip** (npm) | Client-side ZIP parsing for content package import | Not a network dependency — but if package parsing/validation moves server-side (§20/§24 recommend re-validating server-side), the backend stack will need an equivalent ZIP-parsing capability. **This is a stack consideration, not a vendor selection, and is not decided here.** | N/A | N/A |

**No payment, messaging, or real AI vendor is integrated**, despite "AI Help"/"AI Hint" naming in the UI — those are static, hand-authored canned replies (§19), not a live AI call. This is worth flagging explicitly since the feature name could otherwise mislead backend planning into assuming an AI vendor integration already exists.

---

## 27. Prototype → Backend Migration Map

| Current store/source | Migrate | Replace | Discard | Derive |
|---|:---:|:---:|:---:|:---:|
| `nextstep2:completedSessionIds` | ✓ (as real `SessionCompletion` facts) | | | |
| `nextstep2:performanceRecords` | ✓ (as `SessionPerformance`, pending §10's open question) | | | |
| `nextstep2:portfolio` | ✓ | | | |
| `nextstep2:exerciseSubmissions` | ✓ (with `studentId`/`exerciseId` upgraded to real ids) | | | |
| `nextstep2:contentPackages` | ✓ (decomposed per §14/§20/§16) | | | |
| `nextstep2:contentManagerAccount` | | ✓ (real auth) | | |
| `nextstep2:adminAccount` | | ✓ (real auth) | | |
| `mock.ts` `COURSE`/`SUBJECTS_BASE`/`SUBJECT_SESSIONS` | ✓ (as seed data for the real Course/Subject/Session tables — see §4's dual-model gap) | | | |
| `mock.ts` `buildDefaultSessions()`-generated session ids | | ✓ (must become real stored ids, not regenerated from array index) | | |
| `sessionContent.ts` `SESSION_CONTENT` (one curated entry) | ✓ (as seed/initial `ContentVersion` data) | | | |
| `sessionContent.ts` `SESSION_DELIVERY` (live/recorded map) | ✓ (needs to become part of the authored content model — currently entirely outside the Content Package pipeline) | | | |
| `portfolioDemoContent.ts` | | | **✓ — this is explicitly fabricated demo content, not real student data; do not migrate it as if it were.** | |
| `nextstep2:companyAccount` / `companyProfile` / `hiringRequirements`, `candidates.ts`, `matching.ts`, `resume.ts` | | | | **Out of MVP backend scope** — not migrated, replaced, or discarded by this audit; simply not addressed |
| Test fixture data (`app/tests/fixtures/*`) | | | ✓ (test-only, never real/demo product data) | |

**"Do not assume we need to migrate fake/demo data into production"** — this audit explicitly separates: (a) `mock.ts`'s hardcoded Course/Subject/Session, which **is** the real current product structure and should seed real tables, from (b) `portfolioDemoContent.ts` and Playwright test fixtures, which are **not** real data and must not be migrated as if they were.

---

## 28. Known Data Gaps (Important — not fixed here)

- **Missing IDs:** Student has no id at all (§4/§5). `Session.id` is partly array-index-generated, not stored (§5). `ExerciseSubmission.exerciseId` isn't independent of `sessionId` (§5). Admin/Content Manager accounts have no `id` field. Content package `id`s are client-generated with no collision guarantee.
- **Missing timestamps:** no per-completion timestamp separate from the performance record (§9). No "who did this" alongside any review/approve/publish timestamp (§15/§18). No `updatedAt` on most entities.
- **Missing relationships:** no `Enrollment` concept links Student ↔ Course (§4). No foreign key ties `SessionCompletion` to `SessionPerformance` beyond "written at the same moment by the same function call." No link between an original `changes_requested` package and whatever gets re-imported to correct it (§15).
- **Data currently stored only in the browser:** literally everything — all 10 keys in §3.
- **Data currently derived but arguably should become persistent:** per-session "current status" for Admin (§16/§17) is recomputed on every read via `resolveSessionStatuses()` rather than being a stored fact; this is fine at current scale but is a candidate for a real `Publication`/"current version" table the moment scale or correctness pressure increases.
- **Data currently hardcoded:** the entire Student-facing Course/Subject/(most) Session structure (`mock.ts`), the one curated `SessionContent` entry, the `SESSION_DELIVERY` live-session map, the Admin `coursesCount = 1` metric.
- **Prototype-only assumptions:** exactly one Student exists; exactly one Course exists; exactly one exercise per session; "Active Students" has no real definition; AI Help is static content, not a live AI feature.
- **Places where frontend behavior depends on `localStorage`:** all of §3 — every page listed as a "reader" in that table would break (render empty/default state, not crash — every reader has a `try/catch` and a fallback) if its key were absent.
- **Places where frontend behavior depends on mock data:** `mock.ts`'s Course/Subject/Session tree (the entire Student navigation structure), `portfolioDemoContent.ts` (most of `PortfolioView.tsx`), `candidates.ts`/`matching.ts` (Company domain, out of scope).

---

## 29. MVP Backend Requirements

**MUST HAVE FOR MVP:**
- `User` entity with real auth (id, email, passwordHash, role, session/token) — covering Student (new), Content Manager, and Admin.
- Real, stable ids for Student, Course, Subject, Session (replacing the array-index-generated ones), Content Package, Content Version.
- `SessionCompletion`, `SessionPerformance`, `ExerciseSubmission`, `Portfolio`/`PortfolioProject` — each scoped to a real `studentId`, preserving current business behavior (§9/§10/§11/§12) exactly.
- `ContentPackage` decomposed into Package/Version/Review/Publication concepts sufficient to reproduce the exact current Draft→Changes Requested→Approved→Published workflow (§14/§15) and the exact current "most-recently-published-wins" student-visible resolution rule (§16).
- Server-side enforcement of: unpublished-content protection, student data ownership, Content Manager write scope, Admin read-only scope (§24).
- Read endpoints sufficient to reproduce every Admin metric in §17, using the same calculations (not new ones).

**SHOULD HAVE:**
- Explicit "who did this" fields on review/approve/publish actions (§15/§18) and a basic activity/audit table.
- Explicit Publication "superseded" tracking so the §16 versioning gap is actually closed, not just hidden by a resolution rule.
- Pagination on list endpoints (§25) even before it's strictly needed.
- Retained original content package ZIPs (§19/§23).

**FUTURE:**
- Real multi-student support (roster, enrollment) beyond the current one-implicit-student assumption.
- A resolved single model for Course/Subject/Session (closing the dual-model gap in §4) if the product ever needs more than one course.
- A real AI integration behind "AI Help"/"AI Hint," if that's ever desired (today it's static content).
- Portfolio asset/image upload.
- Exercise auto-grading/execution results.

**OUT OF SCOPE (per this audit's brief):**
- Company, Hiring, Candidate Matching, Messaging, Interviews, Offers, Payments, Subscriptions, Advanced AI, a Content authoring editor (Content Manager only ever imports pre-authored packages — there is no in-app authoring UI anywhere in the current codebase).

---

## 30. Recommended Next Steps

1. Review this audit together and confirm/adjust the entity boundaries in §4/§21 before any schema is written — in particular, resolve the Course/Subject/Session dual-model gap (§4/§13) and decide the SessionPerformance overwrite-vs-append question (§10), since both materially shape the schema.
2. Decide backend architecture, database, authentication strategy, API architecture, and hosting/deployment (explicitly deferred by this audit, per instructions).
3. Decide a migration strategy for `mock.ts`'s real structural data (seed it) vs. demo-only content (`portfolioDemoContent.ts`, test fixtures — do not seed it) per §27.
4. Design the Publication/versioning model properly (§16) before building Content Manager's publish flow against a real database, since this is the one place where the current prototype's known limitation must not be silently carried forward into production data.
5. Only after the above: begin implementation. This document intentionally stops here.

---

*This document was produced by inspecting the current codebase only. No backend, database, API, or authentication was built or modified. No application behavior was changed.*
