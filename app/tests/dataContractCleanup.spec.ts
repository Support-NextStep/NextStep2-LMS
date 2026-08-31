import { test, expect, type Page } from "@playwright/test";
import {
  loginAsContentAuthor,
  loginAsContentReviewer,
  openAuthoringWorkspace,
  fillMandatorySections,
  goToAuthoringSection,
  submitForReview,
  approveAsReviewer,
  publishAsReviewer,
  REAL_COURSE_ID,
  REAL_SUBJECT_ID,
  REAL_SESSION_ID,
  REAL_SESSION_TITLE,
} from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Frontend/Data-Contract Cleanup — the concrete fixes that came out of
// NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md, before any backend work:
//
//   1. Practice Self-Check removed completely (dead data — authored,
//      extracted, persisted, converted, never shown, never scored).
//   2. Exercise data loss fixed — scenario/expectedBehaviour/
//      evaluationCriteria/edgeCases/submissionInstructions now survive the
//      full authoring -> package -> review -> publish -> SessionContent
//      pipeline (previously silently dropped by buildContentSessionContent(),
//      and — a real parser bug found while fixing this — expectedBehaviour/
//      submissionInstructions could never be extracted from a document
//      following the actual template order at all, since they appear AFTER
//      the bulleted lists, not before).
//   3. Performance calculation unified — Practice no longer contributes a
//      score; the Complete screen and the persisted SessionPerformanceRecord
//      now call the exact same calculateSessionScore(), so they can never
//      disagree; a session with nothing scoreable shows/stores null, never a
//      fabricated percentage.
//   4. Stale "Content Manager" wording in Admin's Content overview replaced
//      with "Content Reviewer" — no behavior change.
//
// No backend, authentication, authorization, role separation, review
// workflow, versioning model, video/checkpoint playback, Student layout,
// Need Help widget, exercise submission behavior, portfolio behavior,
// Course/Subject/Session architecture, DOCX parsing philosophy, or
// OneCompiler integration was touched to make any of this true.
// ---------------------------------------------------------------------------

type StoredExercise = {
  objective: string;
  requirements: string[];
  starterCode?: string;
  language: string;
  scenario?: string;
  expectedBehaviour?: string;
  evaluationCriteria?: string[];
  edgeCases?: string[];
  submissionInstructions?: string;
};
type StoredPractice = { task: string; starterCode?: string; language: string };
type StoredSessionContent = { practice?: StoredPractice; exercise?: StoredExercise };
type StoredPackageRecord = {
  id: string;
  status: string;
  courses?: { subjects: { sessions: { content: StoredSessionContent | null }[] }[] }[];
};

async function readPackageRecord(page: Page, packageId: string): Promise<StoredPackageRecord | null> {
  return page.evaluate((id) => {
    const raw = window.localStorage.getItem("nextstep2:contentPackages");
    if (!raw) return null;
    const all = JSON.parse(raw) as StoredPackageRecord[];
    return all.find((p) => p.id === id) ?? null;
  }, packageId);
}

function sessionContentOf(pkg: StoredPackageRecord | null): StoredSessionContent | null {
  return pkg?.courses?.[0]?.subjects?.[0]?.sessions?.[0]?.content ?? null;
}

async function readPerformanceScore(page: Page, sessionId: string): Promise<number | null | undefined> {
  return page.evaluate((id) => {
    const raw = window.localStorage.getItem("nextstep2:performanceRecords");
    if (!raw) return undefined;
    const all = JSON.parse(raw) as Record<string, { score: number | null }>;
    return all[id]?.score;
  }, sessionId);
}

test.describe("Data Contract Cleanup: Practice Self-Check removed (proof point 1)", () => {
  test("Practice contains no Self-Check data anywhere — authoring UI or the persisted/published record", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: "Self-Check Removal Session",
    });
    await fillMandatorySections(page, { objective: "Prove Self-Check is fully retired from the product contract." });

    // The uploaded document's own "Self-Check" section (see
    // fixtures/buildDocx.ts's practiceParagraphs()) is still parsed enough to
    // not corrupt other fields, but is never shown anywhere in the workspace.
    await goToAuthoringSection(page, "Practice");
    await expect(page.getByText("Self-Check", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Function is declared with async")).toHaveCount(0);
    await expect(page.getByText("Both fetch calls use await")).toHaveCount(0);

    const packageId = await submitForReview(page);
    const draftPractice = sessionContentOf(await readPackageRecord(page, packageId))?.practice;
    expect(draftPractice).toBeTruthy();
    expect(draftPractice).not.toHaveProperty("checklist");
    // Only task/starterCode/language ever existed in the contract to begin
    // with (starterCode is dropped from the stored JSON here since it's
    // empty — buildContentSessionContent() writes `undefined` for an
    // unset starter code, which JSON.stringify omits entirely).
    expect(Object.keys(draftPractice ?? {}).sort()).toEqual(["language", "task"]);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);

    const publishedPractice = sessionContentOf(await readPackageRecord(page, packageId))?.practice;
    expect(publishedPractice).not.toHaveProperty("checklist");
    expect(publishedPractice?.task).toBeTruthy();
  });
});

test.describe("Data Contract Cleanup: Exercise fields survive the full pipeline (proof points 3-8)", () => {
  test("scenario, expectedBehaviour, evaluationCriteria, edgeCases, and submissionInstructions all survive authoring -> package -> review -> publish", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: "Exercise Field Survival Session",
    });
    await fillMandatorySections(page, { objective: "Prove every Exercise field survives the pipeline." });
    const packageId = await submitForReview(page);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);

    const record = await readPackageRecord(page, packageId);
    expect(record?.status).toBe("published");
    const exercise = sessionContentOf(record)?.exercise;
    expect(exercise).toBeTruthy();

    // Fields that already survived before this cleanup — must still.
    expect(exercise?.objective).toContain("Independently write an async function");
    expect(exercise?.requirements).toEqual(["Function is declared async", "Uses await for the fetch call"]);
    expect(exercise?.language).toBe("javascript");

    // Fields fixed by this cleanup (proof points 3-7) — previously dropped
    // by buildContentSessionContent(), and expectedBehaviour/
    // submissionInstructions were additionally unextractable by the parser
    // itself (see the file header note) until this cleanup.
    expect(exercise?.scenario).toContain("getWeather(city)");
    expect(exercise?.expectedBehaviour).toContain("Input -> correct output, or null on failure");
    expect(exercise?.evaluationCriteria).toEqual([
      "Returns null when the request fails",
      "Returns the parsed JSON response on success",
    ]);
    expect(exercise?.edgeCases).toEqual(["City name is empty", "Network request times out"]);
    expect(exercise?.submissionInstructions).toContain("Submit via the exercise editor");

    // Requirements/evaluationCriteria/edgeCases must contain ONLY genuine
    // bullet items — not the trailing "Expected Behaviour:"/"Submission
    // Instructions:" lines the parser used to swallow into whichever list
    // segment they happened to land in.
    expect(exercise?.requirements).toHaveLength(2);
    expect(exercise?.evaluationCriteria).toHaveLength(2);
    expect(exercise?.edgeCases).toHaveLength(2);
  });

  test("all Exercise fields reach the real Student Session Workspace via the Preview/publish conversion, without breaking rendering (proof point 8)", async ({ page }) => {
    await loginAsContentAuthor(page);
    // A real curated session id — reachable by the actual Student route too,
    // not just Preview (see the established gotcha: SessionPage.tsx only
    // resolves curated/generated sessions, unlike Preview).
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: REAL_SESSION_TITLE,
    });
    await fillMandatorySections(page, { objective: "Exercise data must reach the real SessionContent object." });
    const packageId = await submitForReview(page);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);
    await page.getByRole("button", { name: "Preview", exact: true }).first().click();

    // toPreviewSessionContent() must run successfully end-to-end with every
    // new Exercise field present on the record — a broken conversion would
    // either throw (blank page) or fail to render what was already shown
    // before this cleanup.
    await expect(page).toHaveURL(/\/review\/preview\//);
    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    await expect(page.getByText("Independently write an async function", { exact: false })).toBeVisible();
    await expect(page.getByText("Function is declared async")).toBeVisible();

    // Reachable by the real Student route too, not only Preview.
    await page.goto(`/session/${REAL_SESSION_ID}`);
    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    await expect(page.getByText("Independently write an async function", { exact: false })).toBeVisible();
  });
});

test.describe("Data Contract Cleanup: Performance calculation unified (proof points 2, 9, 10)", () => {
  test("Practice does not contribute to score, and nothing fabricates a percentage when no scoreable activity was completed", async ({ page }) => {
    // An authored session with NO video at all -> deriveRequiredActivities()
    // never includes "videoCheck" (see authoredSession.ts) -> required
    // activities are exactly [learning, practice, exercise], none of which
    // are ever scoreable. Deliberately not a live-delivery session (that
    // path depends on the current wall-clock time against a hardcoded
    // schedule and would be flaky) — this is deterministic regardless of
    // when the suite runs.
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: REAL_SESSION_TITLE,
    });
    await fillMandatorySections(page, { objective: "Nothing here should ever produce a score." });
    const packageId = await submitForReview(page);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);

    await page.goto(`/session/${REAL_SESSION_ID}`);
    await expect(page.getByRole("button", { name: "Play session video" })).toBeVisible();
    await page.getByRole("button", { name: "Play session video" }).click();
    await expect(page.getByText("Lesson complete")).toBeVisible();

    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    await page.getByRole("button", { name: "Submit Exercise" }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("You're ready to complete this session.")).toBeVisible();
    await page.getByRole("button", { name: "Complete Session" }).click();
    await expect(page.getByRole("heading", { name: "Session Complete" })).toBeVisible();

    // On-screen: no fabricated percentage.
    await expect(page.getByText("Not scored yet")).toBeVisible();

    // Persisted: the exact same null, not a different number.
    const score = await readPerformanceScore(page, REAL_SESSION_ID);
    expect(score).toBeNull();
  });

  test("Student Complete performance and persisted performance agree when a required checkpoint IS answered correctly", async ({ page }) => {
    // Install the fake YouTube player before any navigation to a Student
    // session route — same technique as tests/videoCheckpoints.spec.ts's
    // Slice 2 tests, so the real checkpoint code runs deterministically.
    await page.addInitScript(() => {
      class FakePlayer {
        _opts: { events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void } };
        _time = 0;
        constructor(_id: string, opts: FakePlayer["_opts"]) {
          this._opts = opts;
          (window as unknown as { __fakeYTPlayer: FakePlayer }).__fakeYTPlayer = this;
          Promise.resolve().then(() => this._opts.events?.onReady?.());
        }
        getCurrentTime() {
          return this._time;
        }
        getDuration() {
          return 60;
        }
        playVideo() {
          this._opts.events?.onStateChange?.({ data: 1 });
        }
        pauseVideo() {
          this._opts.events?.onStateChange?.({ data: 2 });
        }
        seekTo(seconds: number) {
          this._time = seconds;
        }
        end() {
          this._opts.events?.onStateChange?.({ data: 0 });
        }
        destroy() {}
      }
      (window as unknown as { YT: { Player: typeof FakePlayer } }).YT = { Player: FakePlayer };
    });

    await loginAsContentAuthor(page);
    // A real curated session id (REAL_SESSION_TITLE), not an arbitrary
    // custom title — SessionPage.tsx only resolves sessions mock.ts's
    // curated/generated curriculum already knows about.
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: REAL_SESSION_TITLE,
    });
    await fillMandatorySections(page, { objective: "Complete-screen and persisted performance must agree." });

    await goToAuthoringSection(page, "Video");
    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Performance Agreement Video");

    await goToAuthoringSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();
    await page.getByRole("button", { name: "+ Add Checkpoint" }).click();
    await page.getByLabel(/Timestamp/).fill("00:05");
    await page.getByLabel("Question", { exact: true }).fill("Agreement check");
    const optionInputs = page.getByLabel(/^Option \d/);
    await optionInputs.nth(0).fill("Wrong");
    await optionInputs.nth(1).fill("Right");
    await page.getByLabel("Correct Answer").selectOption({ label: "Right" });
    await page.getByLabel("Feedback").fill("Correct.");
    await page.getByLabel("Required").selectOption("yes");

    const packageId = await submitForReview(page);
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);

    await page.goto(`/session/${REAL_SESSION_ID}`);

    await expect(page.locator('[id^="youtube-checkpoint-player-"]')).toBeVisible();
    await page.evaluate(() => (window as any).__fakeYTPlayer.playVideo());
    await page.evaluate(() => (window as any).__fakeYTPlayer.seekTo(6));
    await page.waitForTimeout(400);
    await expect(page.getByText("Agreement check")).toBeVisible();
    await page.getByRole("button", { name: "Right" }).click();
    await expect(page.getByText("Correct.")).toBeVisible();
    // A checkpoint is a learning check, not a hard gate — after showing
    // correct/incorrect feedback it resumes playback on its own, with no
    // "Continue Video" button to click. See useVideoCheckpoints.ts's
    // AUTO_CONTINUE_DELAY_MS.
    await expect(page.getByText("Agreement check")).toHaveCount(0, { timeout: 3000 });
    await page.evaluate(() => (window as any).__fakeYTPlayer.end());
    await expect(page.getByText("Lesson watched")).toBeVisible();

    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page.getByRole("button", { name: "Exercise", exact: true }).click();
    await page.getByRole("button", { name: "Submit Exercise" }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("You're ready to complete this session.")).toBeVisible();
    await page.getByRole("button", { name: "Complete Session" }).click();
    await expect(page.getByRole("heading", { name: "Session Complete" })).toBeVisible();

    // On-screen: a real, non-fabricated 100% (the only scoreable activity —
    // the required checkpoint — was answered correctly).
    await expect(page.getByText("100%", { exact: true })).toBeVisible();

    const score = await readPerformanceScore(page, REAL_SESSION_ID);
    expect(score).toBe(100);
  });
});

test.describe("Data Contract Cleanup: stale Admin copy fixed (proof point 11)", () => {
  test("Admin's Content overview no longer says Content Manager, and correctly names Content Reviewer", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill('input[type="email"]', "admin@nextstep2.dev");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    await page.goto("/admin/content");
    await expect(page.getByText("Content Manager", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Content Reviewer workspace", { exact: false })).toBeVisible();
  });
});
