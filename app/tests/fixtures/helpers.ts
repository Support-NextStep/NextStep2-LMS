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

export type StoredPackage = { id: string; fileName: string; status: string };

/** Reads the raw contentPackages localStorage record — used to get a package's id for direct navigation, and to assert persisted status without depending on UI text. */
export async function readStoredPackages(page: Page): Promise<StoredPackage[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("nextstep2:contentPackages");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { id: string; fileName: string; status: string }[];
    return parsed.map((p) => ({ id: p.id, fileName: p.fileName, status: p.status }));
  });
}

/**
 * Authored packages store the session title as `fileName` (see
 * toPackageRecord() in src/data/authoredSession.ts) — the same field ZIP
 * imports used for the uploaded file's name — so this lookup works
 * unchanged for both.
 */
export async function getPackageIdByFileName(page: Page, fileName: string): Promise<string> {
  const all = await readStoredPackages(page);
  const match = all.find((p) => p.fileName === fileName);
  if (!match) throw new Error(`No stored content package found with fileName "${fileName}"`);
  return match.id;
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
  for (const label of labels) {
    await page.getByText(label, { exact: true }).click();
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
    const addForm = page.getByLabel("Session Title").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await addForm.getByLabel("Session Title").fill(opts.sessionTitle);
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
  await page.getByLabel("Learning Objective").fill(opts.objective);

  await goToAuthoringSection(page, "Learning Content");
  await page.locator('input[type="file"]').setInputFiles(await docxFixtureFile("learning.docx", learningContentParagraphs()));
  await expect(page.getByText(/Imported from document/)).toBeVisible();

  await goToAuthoringSection(page, "Practice");
  await page.locator('input[type="file"]').setInputFiles(await docxFixtureFile("practice.docx", practiceParagraphs()));
  await expect(page.getByText(/Imported from document/)).toBeVisible();

  await goToAuthoringSection(page, "Exercise");
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
    // "draft" is the status a fresh submission already has — it IS the
    // "pending review" state, identical to before the role split.
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByText(/Last saved/)).toBeVisible();
    return getPackageIdByFileName(page, opts.sessionTitle);
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
