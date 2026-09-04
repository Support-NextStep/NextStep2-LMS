// ---------------------------------------------------------------------------
// Shared Playwright helpers for the Content Author / Content Reviewer /
// Student verification suite. Not a spec file — no .spec.ts suffix.
//
// ROLE SEPARATION: the old single "Content Manager" workspace was split into
// two isolated roles/route namespaces/login sessions — Content Author
// (/content/*, contentAuthor.ts) authors and submits content; Content
// Reviewer (/review/*, contentReviewer.ts) reviews/requests changes/
// approves/publishes it. Both operate on the exact same ContentPackageRecord
// data (nextstep2:contentPackages) — see NEXTSTEP2_BACKEND_DOMAIN_MODEL.md
// and the role-separation slice's final report. Helpers below that drive a
// package all the way to a reviewed status (authorAndPublish,
// authorAndSetStatus) log in as BOTH roles in turn on the same `page` — the
// two accounts live under different localStorage keys and coexist without
// clobbering each other, exactly like a real browser where one person might
// hold both roles.
//
// The Content Team Session Authoring Workspace (real DOCX upload -> Submit
// for Review) is the only product-facing way to get content into the review
// pipeline — the old ZIP-upload helpers (importPackage, importAndPublish,
// importAndSetStatus) were retired in an earlier slice along with the
// /content/import route they drove.
// ---------------------------------------------------------------------------
import { expect, type Page } from "@playwright/test";
import { buildDocx, learningContentParagraphs, practiceParagraphs, exerciseParagraphs, type DocxParagraphSpec } from "./buildDocx";

/** Real course id — matches src/data/mock.ts COURSE.id, so authored/published content reaches a real student route. */
export const REAL_COURSE_ID = "full-stack-web-development";
/** Real subject id — matches src/data/mock.ts SUBJECTS_BASE. */
export const REAL_SUBJECT_ID = "frontend-development";
/**
 * A curated session in REAL_SUBJECT_ID (src/data/mock.ts) with no curated
 * entry in sessionContent.ts, so it renders the generic fallback until
 * authored content is actually published for it. Its title is chosen so the
 * app's own slugifyTitle() maps it to the id "api-integration" — matching
 * the session id these tests target for direct student-route navigation.
 */
export const REAL_SESSION_TITLE = "API Integration";
export const REAL_SESSION_ID = "api-integration";

// Defaults match the real backend's seeded accounts (server/prisma/seed.ts)
// — these are no longer mock/local-only accounts (Content Author/Reviewer/
// Admin login is a real POST /auth/login call as of the content-authoring-
// backend phase), so a placeholder "@example.com" address that was never
// actually seeded now genuinely fails to log in.
export async function loginAsContentAuthor(page: Page, email = "author@nextstep2.dev") {
  await page.goto("/content/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/content\/dashboard/);
}

/** A separate login/session boundary from loginAsContentAuthor — a different real backend session entirely, even when called on the same `page` right after an author login. */
export async function loginAsContentReviewer(page: Page, email = "reviewer@nextstep2.dev") {
  await page.goto("/review/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/review\/dashboard/);
}

export async function loginAsAdmin(page: Page, email = "admin@nextstep2.dev") {
  await page.goto("/admin/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

/**
 * Day 5 follow-up: real backend replacement for the retired
 * `readStoredPackages()` (it read a `nextstep2:contentPackages` localStorage
 * key nothing has written since the content-authoring-backend phase moved
 * ContentPackage into Postgres — see PackagesService). Calls the real
 * `GET /packages/:id` endpoint directly via `page.request`, which shares
 * cookies with whichever role (Content Author, Reviewer, or Admin) is
 * currently logged in on `page` — matching the guard on that route
 * (`@Roles(CONTENT_AUTHOR, CONTENT_REVIEWER, ADMIN)`), so this works
 * whichever of the two roles the calling test is currently authenticated
 * as, exactly like the UI actions around it. Returns the real Prisma
 * `PackageStatus` enum string (`DRAFT` / `READY_FOR_REVIEW` /
 * `CHANGES_REQUESTED` / `APPROVED` / `PUBLISHED`), not the old lowercase
 * localStorage naming.
 */
export async function getPackageStatus(page: Page, packageId: string): Promise<string> {
  const res = await page.request.get(`http://localhost:3000/packages/${packageId}`);
  if (!res.ok()) throw new Error(`GET /packages/${packageId} failed with status ${res.status()}`);
  const body = (await res.json()) as { status: string };
  return body.status;
}

/**
 * Registers a fresh, disposable real student account and logs in as them —
 * for tests that need to exercise real, JwtAuthGuard + Roles(STUDENT)-gated
 * backend endpoints (Exercise submissions since Day 2, activity/session
 * progress since the Server-Side Activity Progress slice, AI Tutor since
 * Day 3). Content Author/Reviewer sessions cannot call any of these — they
 * are a different role entirely, not "logged in as nobody in particular."
 * Returns the generated email, in case a test wants to look the account up
 * afterward (e.g. for its own cleanup).
 */
export async function loginAsDisposableStudent(page: Page, namePrefix = "test-student"): Promise<string> {
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `${namePrefix}-${rand}@test.local`;
  const password = "Password123!";
  await page.request.post("http://localhost:3000/auth/register", {
    data: { email, password, name: "Playwright Test Student" },
  });
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  return email;
}

/**
 * Real backend replacement for reading a package's published content via
 * the old `readPackageRecord()`/localStorage record (same retirement as
 * `getPackageStatus` above) — the real, public, canonical resolution is
 * `GET /sessions/:sessionId/content` (see ContentService.getPublishedContentForSession),
 * the same endpoint the actual Student app itself calls. Returns `null` if
 * nothing is currently published for that session (a 404), matching the old
 * helper's own "no record found" contract.
 */
export async function getPublishedSessionContent(page: Page, sessionId: string): Promise<Record<string, unknown> | null> {
  const res = await page.request.get(`http://localhost:3000/sessions/${sessionId}/content`);
  if (res.status() === 404) return null;
  if (!res.ok()) throw new Error(`GET /sessions/${sessionId}/content failed with status ${res.status()}`);
  return res.json();
}

/** Ticks every review checklist box on the Content Package Detail page (currently open). */
export async function checkAllReviewBoxes(page: Page) {
  const labels = [
    "Course information reviewed",
    "Subject structure reviewed",
    "Session content reviewed",
    "Videos reviewed",
    "Practice activities reviewed",
    "AI Help reviewed",
    "Exercises reviewed",
    "Content is ready for students",
  ];
  // ContentPackageDetail.tsx pre-populates the checklist from the package's
  // latest review (see its own `if (latest.checklist) setChecklist(...)`) —
  // a second review round (after Request Changes -> resubmit) starts with
  // whatever was checked last time already checked. Blindly clicking every
  // label would toggle those back OFF; only click a box that isn't already checked.
  for (const label of labels) {
    const checkbox = page.getByRole("checkbox", { name: label });
    if (!(await checkbox.isChecked())) {
      await page.getByText(label, { exact: true }).click();
    }
  }
}

/** Clicks a left-sidebar section in the Session Authoring Workspace. Exact text match on the label span — its accessible NAME also includes the status icon's aria-label, so role-based name matching can't reliably distinguish e.g. "Video" from "Video Checkpoints". */
export async function goToAuthoringSection(page: Page, label: string) {
  await page.locator("aside").getByText(label, { exact: true }).click();
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function docxFixtureFile(name: string, paragraphs: DocxParagraphSpec[]) {
  return { name, mimeType: DOCX_MIME, buffer: await buildDocx(paragraphs) };
}

/**
 * Opens the Session Authoring Workspace for (courseId, subjectId,
 * sessionTitle) via the real Content Dashboard UI — never a direct
 * goto(".../author"), so this always exercises whatever the product
 * actually offers for that session's current state:
 *   - no row yet (a brand-new custom title)      -> Add Session -> Start Authoring
 *   - a row with no package yet (curated session) -> Start Authoring
 *   - a row that's draft/changes_requested        -> Continue Editing (resumes it)
 *   - a row that's approved/published              -> Author New Version (starts a fresh draft)
 */
export async function openAuthoringWorkspace(
  page: Page,
  opts: { courseId: string; subjectId: string; sessionTitle: string }
) {
  await page.goto(`/content/courses/${opts.courseId}/subjects/${opts.subjectId}`);
  // ContentSubjectDetail.tsx fetches the author's packages from the backend
  // before rendering any session row — page.goto() only waits for the
  // document "load" event, not this async fetch, so checking row.count()
  // immediately below would otherwise race it (always reading 0, even for
  // a session that genuinely already has a row). "Add Session" is always
  // present once that fetch resolves, so wait for it first.
  await page.getByRole("button", { name: "Add Session" }).waitFor({ timeout: 15000 });

  const row = page.getByText(opts.sessionTitle, { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  if ((await row.count()) > 0) {
    const startBtn = row.getByRole("button", { name: "Start Authoring" });
    const continueBtn = row.getByRole("button", { name: "Continue Editing" });
    const newVersionBtn = row.getByRole("button", { name: "Author New Version" });
    if ((await startBtn.count()) > 0) await startBtn.click();
    else if ((await continueBtn.count()) > 0) await continueBtn.click();
    else await newVersionBtn.click();
  } else {
    await page.getByRole("button", { name: "Add Session" }).click();
    // ContentSubjectDetail.tsx's "Add a New Session" panel is a real <form>
    // element (correctly so — it's an actual form, not a session-row card),
    // not a <div> — scope by the form itself (found via its own heading)
    // rather than an ancestor-div XPath that can never match a <form>.
    const addForm = page.locator("form").filter({ hasText: "Add a New Session" });
    await addForm.getByLabel("Session Title").fill(opts.sessionTitle);
    // Also mandatory for "Start Authoring" to enable (ContentSubjectDetail.tsx:
    // disabled={... || !newSessionTitle.trim() || !newSessionDesc.trim()}) —
    // this is a throwaway value only; fillMandatorySections() below fills the
    // real, final Session Description inside the authoring workspace itself.
    await addForm.getByLabel("Session Description").fill("Fixture session for automated tests.");
    await addForm.getByRole("button", { name: "Start Authoring" }).click();
  }
  await expect(page).toHaveURL(/\/author$/);
}

/**
 * Fills every mandatory section (Session Info, Learning Content, Practice,
 * Exercise — see MANDATORY_SECTIONS in src/data/authoredSession.ts) with
 * real, minimal, valid content, so Submit for Review becomes enabled.
 * `objective` becomes ContentSessionContent.objective, which
 * SessionWorkspace.tsx renders verbatim on the real student session page —
 * the authoring-model equivalent of the old ZIP fixtures' embedded content
 * marker, letting a test trace one specific package's content through
 * review all the way to (or away from) the student view.
 */
export async function fillMandatorySections(page: Page, opts: { objective: string; description?: string }) {
  await goToAuthoringSection(page, "Session Information");
  await page.getByLabel("Session Description").fill(opts.description ?? "Fixture session for automated tests.");

  // Learning Objective lives on the Learning Content panel, not Session
  // Information — this fixture previously tried to fill it without
  // navigating there first, which only worked by accident when both fields
  // briefly shared one panel; they no longer do.
  await goToAuthoringSection(page, "Learning Content");
  await page.getByLabel("Learning Objective").fill(opts.objective);
  // Each hybrid section defaults to "Manual Entry" mode — the DOCX file
  // input doesn't exist in the DOM at all until "Import DOCX" is clicked
  // (HybridUploadPanel.tsx only renders it when mode === "docx").
  await page.getByRole("button", { name: "Import DOCX" }).click();
  await page.locator('input[type="file"]').setInputFiles(await docxFixtureFile("learning.docx", learningContentParagraphs()));
  await expect(page.getByText(/Imported from document/)).toBeVisible();

  await goToAuthoringSection(page, "Practice");
  await page.getByRole("button", { name: "Import DOCX" }).click();
  await page.locator('input[type="file"]').setInputFiles(await docxFixtureFile("practice.docx", practiceParagraphs()));
  await expect(page.getByText(/Imported from document/)).toBeVisible();

  await goToAuthoringSection(page, "Exercise");
  await page.getByRole("button", { name: "Import DOCX" }).click();
  await page.locator('input[type="file"]').setInputFiles(await docxFixtureFile("exercise.docx", exerciseParagraphs()));
  await expect(page.getByText(/Imported from document/)).toBeVisible();
}

/** Clicks Submit for Review (must already be enabled) and returns the resulting package id from the Content Author's own read-only submission-status URL it lands on (/content/submissions/:id — never the Reviewer's /review/package/:id workstation, which the Content Author has no access to). */
export async function submitForReview(page: Page): Promise<string> {
  await expect(page.getByRole("button", { name: "Submit for Review" }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Submit for Review" }).first().click();
  await expect(page).toHaveURL(/\/content\/submissions\//);
  await expect(page.getByRole("heading", { name: "Submission Status" })).toBeVisible();
  const match = page.url().match(/\/content\/submissions\/([^/?#]+)/);
  if (!match) throw new Error(`Could not parse package id from URL after Submit for Review: ${page.url()}`);
  return match[1];
}

/**
 * Approves the package currently open at /review/package/:id (must already
 * be there, logged in as Content Reviewer). Ticks every box first.
 */
export async function approveAsReviewer(page: Page) {
  await checkAllReviewBoxes(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve Content" }).click();
  await expect(page.getByText("Content approved")).toBeVisible();
}

/** Publishes the package currently open at /review/package/:id (must already be approved). */
export async function publishAsReviewer(page: Page) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("text=Published").first()).toBeVisible();
}

/**
 * Drives a session all the way from authoring to Published — Content Author
 * authors and submits, then Content Reviewer (a separate login/session,
 * see loginAsContentReviewer) reviews, approves, and publishes. The
 * authoring-based equivalent of the retired importAndPublish() ZIP helper.
 * Returns the resulting package id. Leaves `page` logged in as BOTH roles
 * (the author session from before this call is untouched), currently on the
 * Reviewer's package page.
 */
export async function authorAndPublish(
  page: Page,
  opts: { courseId: string; subjectId: string; sessionTitle: string; objective: string }
): Promise<string> {
  await openAuthoringWorkspace(page, opts);
  await fillMandatorySections(page, { objective: opts.objective });
  const id = await submitForReview(page);

  await loginAsContentReviewer(page);
  await page.goto(`/review/package/${id}`);
  await approveAsReviewer(page);
  await publishAsReviewer(page);

  return id;
}

/**
 * Drives a session to a specific status — Content Author authors/submits,
 * then (for anything past "draft") Content Reviewer reviews it. Used to
 * build a mix of draft/changes_requested/approved/published sessions for
 * Admin's read-only content overview tests. The authoring-based equivalent
 * of the retired importAndSetStatus() ZIP helper.
 */
export async function authorAndSetStatus(
  page: Page,
  opts: { courseId: string; subjectId: string; sessionTitle: string; objective: string },
  target: "draft" | "changes_requested" | "approved" | "published",
  notes = "Needs updates before this can ship."
): Promise<string> {
  await openAuthoringWorkspace(page, opts);
  await fillMandatorySections(page, { objective: opts.objective });

  if (target === "draft") {
    // Historical naming only — "draft" here means the pre-role-split
    // "pending review" state, NOT the real backend's literal DRAFT enum
    // value. AdminContent.tsx deliberately never shows literal-DRAFT
    // packages at all (they're the author's own, not yet an admin-visible
    // fact — see its own doc comment); the real, current status this
    // branch must produce is READY_FOR_REVIEW ("Pending Review" in the
    // Admin UI), which is what both call sites' assertions actually check.
    // getPackageIdByFileName (the old localStorage-record lookup this used
    // to return) was retired in the Day 5 localStorage cleanup — the real
    // replacement is submitForReview()'s own return value.
    return submitForReview(page);
  }

  const id = await submitForReview(page);

  await loginAsContentReviewer(page);
  await page.goto(`/review/package/${id}`);

  if (target === "changes_requested") {
    await page.fill("textarea", notes);
    await page.getByRole("button", { name: "Request Changes" }).click();
    await expect(page.locator("text=Changes Requested").first()).toBeVisible();
    return id;
  }

  await approveAsReviewer(page);
  if (target === "approved") return id;

  await publishAsReviewer(page);
  return id;
}
