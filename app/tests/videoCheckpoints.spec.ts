import { test, expect, type Page } from "@playwright/test";
import {
  loginAsContentAuthor,
  loginAsContentReviewer,
  loginAsDisposableStudent,
  openAuthoringWorkspace,
  fillMandatorySections,
  goToAuthoringSection,
  submitForReview,
  approveAsReviewer,
  publishAsReviewer,
  getPackageStatus,
  getPublishedSessionContent,
  REAL_COURSE_ID,
  REAL_SUBJECT_ID,
  REAL_SESSION_ID,
  REAL_SESSION_TITLE,
} from "./fixtures/helpers";

// ---------------------------------------------------------------------------
// Video Checkpoint System — Slice 1 (data model + authoring UI cleanup).
// See NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md for the frozen design this slice
// implements. Explicitly NOT covered here (future playback slice): the
// YouTube IFrame Player API, playback-time polling, real pause/resume at a
// checkpoint, seek handling, or required-checkpoint bypass prevention — the
// Student UI still uses its existing mock video/single-checkpoint display,
// deliberately unchanged in this slice except to read from the new data
// shape instead of the old one.
// ---------------------------------------------------------------------------

type StoredCheckpoint = {
  id: string;
  timestampSeconds: number;
  question: string;
  options: string[];
  correctIndex: number;
  feedback: string;
  required: boolean;
  continueImmediately?: boolean; // must never appear on new data — asserted absent below
};

type StoredSessionContent = {
  video?: { youtubeUrl: string; title: string };
  checkpoints?: StoredCheckpoint[];
};

/** Scopes field lookups to one specific "Checkpoint #N" card, since every card repeats the same field labels (Timestamp/Question/Options/.../Required). */
function checkpointBlock(page: Page, n: number) {
  return page.getByText(`Checkpoint #${n}`, { exact: true }).locator("xpath=..");
}

async function addAndFillCheckpoint(
  page: Page,
  n: number,
  cp: { timestamp: string; question: string; options: [string, string]; correctLabel: string; feedback: string; required: boolean }
) {
  await page.getByRole("button", { name: "+ Add Checkpoint" }).click();
  const block = checkpointBlock(page, n);
  await block.getByLabel(/Timestamp/).fill(cp.timestamp);
  await block.getByLabel("Question", { exact: true }).fill(cp.question);
  const optionInputs = block.getByLabel(/^Option \d/);
  await optionInputs.nth(0).fill(cp.options[0]);
  await optionInputs.nth(1).fill(cp.options[1]);
  await block.getByLabel("Correct Answer").selectOption({ label: cp.correctLabel });
  await block.getByLabel("Feedback").fill(cp.feedback);
  await block.getByLabel("Required").selectOption(cp.required ? "yes" : "no");
}

test.describe("Video Checkpoints: authoring UI cleanup", () => {
  test("no Question Type selector and no Continue-after-answer control are shown", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: "Checkpoint UI Cleanup Session" });

    await goToAuthoringSection(page, "Video");
    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Cleanup Test Video");

    await goToAuthoringSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();
    await page.getByRole("button", { name: "+ Add Checkpoint" }).click();

    // The card is real and visible (Required is still there)...
    await expect(checkpointBlock(page, 1).getByLabel("Required")).toBeVisible();
    // ...but the two removed/never-real controls are gone, not just disabled.
    await expect(page.getByText("Question Type", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Continue after answer", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Only if correct", { exact: true })).toHaveCount(0);
  });
});

test.describe("Video Checkpoints: multiple checkpoints survive the full pipeline", () => {
  test("3 checkpoints (authored out of order) and the video survive authoring -> package -> review -> publish, sorted by timestamp, with no continueImmediately/videoCheckpoint on new data", async ({ page }) => {
    await loginAsContentAuthor(page);
    // A real curated session id (REAL_SESSION_ID) is required here, not an
    // arbitrary custom title — SessionPage.tsx only resolves sessions that
    // mock.ts's curated/generated curriculum already knows about (unlike
    // Preview, which looks a session up directly inside its own package by
    // id — see the Reviewer-preview test below, which has no such constraint).
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: REAL_SESSION_TITLE });
    await fillMandatorySections(page, { objective: "Demonstrate multi-checkpoint authoring." });

    await goToAuthoringSection(page, "Video");
    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Async / Await Explained");

    await goToAuthoringSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();

    // Authored deliberately out of chronological order, to prove the pipeline
    // sorts by timestamp rather than preserving authoring/array order.
    await addAndFillCheckpoint(page, 1, {
      timestamp: "05:30",
      question: "Which method creates a GET route?",
      options: ["app.post()", "app.get()"],
      correctLabel: "app.get()",
      feedback: "app.get() handles GET requests.",
      required: true,
    });
    await addAndFillCheckpoint(page, 2, {
      timestamp: "00:30",
      question: "What is Express?",
      options: ["A database", "A Node.js framework"],
      correctLabel: "A Node.js framework",
      feedback: "Express is a minimal Node.js web framework.",
      required: false,
    });
    await addAndFillCheckpoint(page, 3, {
      timestamp: "02:15",
      question: "What does middleware do?",
      options: ["Renders HTML", "Processes requests in sequence"],
      correctLabel: "Processes requests in sequence",
      feedback: "Middleware functions run in sequence before the route handler.",
      required: true,
    });

    const packageId = await submitForReview(page);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);

    await expect.poll(() => getPackageStatus(page, packageId)).toBe("PUBLISHED");
    const content = (await getPublishedSessionContent(page, REAL_SESSION_ID)) as StoredSessionContent | null;

    // ---- Video survives, complete ----
    expect(content?.video).toEqual({ youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", title: "Async / Await Explained" });

    // ---- All 3 checkpoints survive, sorted by timestampSeconds ----
    const checkpoints = content?.checkpoints ?? [];
    expect(checkpoints).toHaveLength(3);
    expect(checkpoints.map((c) => c.timestampSeconds)).toEqual([30, 135, 330]);

    // ---- Every field survives for every checkpoint ----
    expect(checkpoints[0]).toMatchObject({
      question: "What is Express?",
      options: ["A database", "A Node.js framework"],
      correctIndex: 1,
      feedback: "Express is a minimal Node.js web framework.",
      required: false,
    });
    expect(checkpoints[1]).toMatchObject({
      question: "What does middleware do?",
      correctIndex: 1,
      required: true,
    });
    expect(checkpoints[2]).toMatchObject({
      question: "Which method creates a GET route?",
      options: ["app.post()", "app.get()"],
      correctIndex: 1,
      feedback: "app.get() handles GET requests.",
      required: true,
    });
    for (const c of checkpoints) {
      expect(typeof c.id).toBe("string");
      expect(c.id.length).toBeGreaterThan(0);
    }

    // ---- Removed field never appears on new data ----
    for (const c of checkpoints) {
      expect(c).not.toHaveProperty("continueImmediately");
    }
    // ---- New authoring code never writes the deprecated singular field ----
    expect(content).not.toHaveProperty("videoCheckpoint");

    // ---- Workflow really is intact end to end: the student sees this session ----
    await page.goto(`/session/${REAL_SESSION_ID}`);
    await expect(page.getByText("Demonstrate multi-checkpoint authoring.", { exact: false })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// RETIRED (Day 5 follow-up): "a pre-Slice-1 record with only the deprecated
// singular videoCheckpoint (no checkpoints[]) still renders for the Student
// via the compatibility adapter."
//
// This test injected a legacy ContentPackageRecord shape directly into
// `localStorage["nextstep2:contentPackages"]` and then opened the real
// Student route (/session/:id) to prove a "legacy localStorage record ->
// Student session page" compatibility path. That path no longer exists:
// SessionPage.tsx's real content resolution (getSessionContent() in
// sessionContent.ts) states this explicitly in its own current doc comment —
// "the real backend's canonical published-content resolution... is now the
// only published-content source... there is no longer a separate
// local-published-content layer to fall back to here." The precedence today
// is real-backend-published -> curated demo entry -> generated fallback;
// none of those three ever reads `nextstep2:contentPackages`, so a student
// can no longer reach ANY localStorage-authored content, legacy-shaped or
// otherwise. (The `videoCheckpoint` singular-field normalizer this test
// exercised still exists in data/contentPackages.ts, but only for the
// separate Content Author/Reviewer Preview feature — ContentPreviewSession.tsx
// — which previews a package still in its own local draft/review context,
// never for a real student on the real /session/:id route this test used.)
//
// Retired rather than rewritten: there is no current supported behavior to
// verify a student-facing legacy-localStorage compatibility adapter against,
// because the product no longer has one for students. If Preview's own
// legacy-shape handling ever needs coverage, that would be a new test
// against /content/preview or /review/preview, not a revival of this one.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Slice 2 — the real YouTube Player + sequential checkpoint playback. See
// NEXTSTEP2_VIDEO_CHECKPOINT_SYSTEM.md §E/F/G/J/K.
//
// installFakeYouTube() injects a scriptable fake `window.YT.Player` before
// the app runs (via page.addInitScript, which applies to every subsequent
// navigation on this page). src/data/youtubePlayer.ts's loadYouTubeIframeApi()
// finds `window.YT.Player` already present and uses it directly instead of
// injecting the real network-dependent `iframe_api` script — so everything
// under test here (polling, checkpoint-crossing detection, pause/resume,
// seek handling) is the real production code in useVideoCheckpoints.ts,
// exercised against a deterministic fake player instead of real playback.
// ---------------------------------------------------------------------------

async function installFakeYouTube(page: Page) {
  await page.addInitScript(() => {
    class FakePlayer {
      _opts: { events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void } };
      _time = 0;
      _destroyed = false;
      constructor(_elementId: string, opts: FakePlayer["_opts"]) {
        this._opts = opts;
        (window as unknown as { __fakeYTPlayer: FakePlayer }).__fakeYTPlayer = this;
        Promise.resolve().then(() => {
          if (!this._destroyed) this._opts.events?.onReady?.();
        });
      }
      getCurrentTime() {
        return this._time;
      }
      getDuration() {
        return 600;
      }
      playVideo() {
        if (this._destroyed) return;
        this._opts.events?.onStateChange?.({ data: 1 });
      }
      pauseVideo() {
        if (this._destroyed) return;
        this._opts.events?.onStateChange?.({ data: 2 });
      }
      seekTo(seconds: number) {
        this._time = seconds;
      }
      /** Test-only helper: simulate the student dragging the scrubber, without going through the app's own seekTo(). */
      setTime(seconds: number) {
        this._time = seconds;
      }
      /** Test-only helper: simulate playback reaching the end. */
      end() {
        if (this._destroyed) return;
        this._opts.events?.onStateChange?.({ data: 0 });
      }
      destroy() {
        this._destroyed = true;
      }
    }
    (window as unknown as { YT: { Player: typeof FakePlayer } }).YT = { Player: FakePlayer };
  });
}

function fakePlayer(page: Page) {
  return {
    play: () => page.evaluate(() => (window as any).__fakeYTPlayer.playVideo()),
    setTime: (t: number) => page.evaluate((t) => (window as any).__fakeYTPlayer.setTime(t), t),
    currentTime: () => page.evaluate(() => (window as any).__fakeYTPlayer.getCurrentTime() as number),
    end: () => page.evaluate(() => (window as any).__fakeYTPlayer.end()),
  };
}

/** Waits out one (or more) 250ms poll ticks in useVideoCheckpoints.ts. */
async function waitForPollTick(page: Page) {
  await page.waitForTimeout(400);
}

test.describe("Video Checkpoints: real YouTube player + sequential playback (Slice 2)", () => {
  test("sequential checkpoints, authored feedback, required-blocks-completion, seek handling, and lesson-watched all work against the real player code", async ({
    page,
  }) => {
    await installFakeYouTube(page);

    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: REAL_SESSION_TITLE,
    });
    await fillMandatorySections(page, { objective: "Slice 2 sequential playback session." });

    // fillMandatorySections()'s DOCX import never sets Starter Code — this
    // test goes on to actually submit the Exercise as a real student without
    // touching the OneCompiler editor, which submits content.exercise.starterCode
    // verbatim (SessionWorkspace.tsx's handleConfirmExerciseSubmit) — an
    // empty one is correctly rejected client-side ("Submission cannot be
    // empty."), so author a non-empty one.
    await goToAuthoringSection(page, "Exercise");
    await page.getByLabel("Starter Code").fill("async function solve() {\n  return true;\n}\n");

    await goToAuthoringSection(page, "Video");
    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Sequential Playback Video");

    await goToAuthoringSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();
    // CP-A: non-required, early.
    await addAndFillCheckpoint(page, 1, {
      timestamp: "00:10",
      question: "Optional check — Express is what?",
      options: ["A database", "A Node.js framework"],
      correctLabel: "A Node.js framework",
      feedback: "NONREQ_A_FEEDBACK_MARKER",
      required: false,
    });
    // CP-B: required.
    await addAndFillCheckpoint(page, 2, {
      timestamp: "00:30",
      question: "Must-answer check — which method creates a GET route?",
      options: ["app.post()", "app.get()"],
      correctLabel: "app.get()",
      feedback: "REQ_B_FEEDBACK_MARKER",
      required: true,
    });
    // CP-C: non-required, after CP-B — used to prove a forward seek across
    // multiple checkpoints still surfaces every one of them in order (a
    // seek can never permanently bypass any checkpoint, required or not).
    await addAndFillCheckpoint(page, 3, {
      timestamp: "00:50",
      question: "Optional check — what does middleware do?",
      options: ["Renders HTML", "Processes requests in sequence"],
      correctLabel: "Processes requests in sequence",
      feedback: "NONREQ_C_FEEDBACK_MARKER",
      required: false,
    });

    const packageId = await submitForReview(page);
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await approveAsReviewer(page);
    await publishAsReviewer(page);

    // Real auth is one cookie per browser context — this test goes on to
    // submit the real Exercise and mark real activities/session complete,
    // all real, JwtAuthGuard + Roles(STUDENT)-gated backend endpoints since
    // Day 2/the Activity Progress slice. The Content Reviewer session above
    // cannot call any of those (wrong role) — log in as a real disposable
    // student before interacting with the session as one.
    await loginAsDisposableStudent(page);
    await page.goto(`/session/${REAL_SESSION_ID}`);
    const fake = fakePlayer(page);

    await test.step("real player renders — no mock 'Play session video' control", async () => {
      await expect(page.locator('[id^="youtube-checkpoint-player-"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Play session video" })).toHaveCount(0);
      await expect(page.getByText("Sequential Playback Video")).toBeVisible();
    });

    await test.step("CP-A triggers in normal forward playback, authored feedback is shown, and it auto-continues with no Continue button", async () => {
      await fake.play();
      await fake.setTime(11);
      await waitForPollTick(page);
      await expect(page.getByText("Optional check — Express is what?")).toBeVisible();
      await page.getByRole("button", { name: "A Node.js framework" }).click();
      await expect(page.getByText("NONREQ_A_FEEDBACK_MARKER")).toBeVisible();
      // A checkpoint is a learning check, not a hard gate — no "Continue
      // Video" button exists to click; it resumes on its own.
      await expect(page.getByRole("button", { name: "Continue Video" })).toHaveCount(0);
      await expect(page.getByText("Optional check — Express is what?")).toHaveCount(0, { timeout: 3000 });
    });

    await test.step("required CP-B still requires an answer (right or wrong) for session-completion tracking, and auto-continues the same way", async () => {
      await fake.setTime(31);
      await waitForPollTick(page);
      await expect(page.getByText("Must-answer check — which method creates a GET route?")).toBeVisible();
      await expect(page.getByText(/Video Check left|Video Check,|, Video Check/)).toBeVisible();
      await page.getByRole("button", { name: "app.get()" }).click();
      await expect(page.getByText("REQ_B_FEEDBACK_MARKER")).toBeVisible();
      await expect(page.getByText("Must-answer check — which method creates a GET route?")).toHaveCount(0, { timeout: 3000 });
    });

    await test.step("backward seek across an already-answered checkpoint makes it trigger again — no permanent 'already shown' state", async () => {
      await fake.setTime(5); // rewind before CP-A, which was already answered above
      await fake.play();
      await waitForPollTick(page);
      await fake.setTime(11); // play forward across CP-A's timestamp again
      await waitForPollTick(page);
      await expect(page.getByText("Optional check — Express is what?")).toBeVisible();
      await page.getByRole("button", { name: "A Node.js framework" }).click();
      await expect(page.getByText("Optional check — Express is what?")).toHaveCount(0, { timeout: 3000 });
    });

    await test.step("a forward seek jumping past multiple checkpoints cannot bypass any of them — the earliest one still fires and forces a rewind", async () => {
      await fake.setTime(52); // jumps straight past both CP-B (30s, already answered once) and CP-C (50s)
      await waitForPollTick(page);
      // CP-B is the earliest checkpoint ahead of the current crossing baseline, so it re-fires first — never silently bypassed just because it was already answered once.
      await expect(page.getByText("Must-answer check — which method creates a GET route?")).toBeVisible();
      expect(await fake.currentTime()).toBe(30);
      await page.getByRole("button", { name: "app.get()" }).click();
      await expect(page.getByText("Must-answer check — which method creates a GET route?")).toHaveCount(0, { timeout: 3000 });

      // Now play forward across CP-C — it must not have been silently skipped by the earlier big seek.
      await fake.setTime(51);
      await waitForPollTick(page);
      await expect(page.getByText("Optional check — what does middleware do?")).toBeVisible();
      await page.getByRole("button", { name: "Processes requests in sequence" }).click();
      await expect(page.getByText("Optional check — what does middleware do?")).toHaveCount(0, { timeout: 3000 });
    });

    await test.step("ENDED marks the lesson watched", async () => {
      await fake.end();
      await expect(page.getByText("Lesson complete")).toBeVisible();
      await expect(page.getByText("Lesson watched")).toBeVisible();
    });

    await test.step("all requirements now satisfied and reflected as such on the Complete screen", async () => {
      await page.getByRole("button", { name: "Practice", exact: true }).click();
      await page.getByRole("button", { name: "Exercise", exact: true }).click();
      await page.getByRole("button", { name: "Submit Exercise" }).click();
      await page.getByRole("button", { name: "Submit", exact: true }).click();

      await expect(page.getByText("You're ready to complete this session.")).toBeVisible();
      await page.getByRole("button", { name: "Complete Session" }).click();
      await expect(page.getByRole("heading", { name: "Session Complete" })).toBeVisible();
      // videoCheck's requirement row reflects the required checkpoint being answered correctly.
      const videoCheckRow = page.locator("div").filter({ hasText: /^Video CheckCorrect$/ });
      await expect(videoCheckRow).toBeVisible();
    });
  });

  test("required checkpoint jumped over by a forward seek forces the player to rewind to it and pause", async ({ page }) => {
    await installFakeYouTube(page);
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, {
      courseId: REAL_COURSE_ID,
      subjectId: REAL_SUBJECT_ID,
      sessionTitle: "Forward Seek Rewind Session",
    });
    await fillMandatorySections(page, { objective: "Forward-seek rewind session." });

    await goToAuthoringSection(page, "Video");
    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Rewind Test Video");

    await goToAuthoringSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();
    await addAndFillCheckpoint(page, 1, {
      timestamp: "00:20",
      question: "Must-answer rewind check",
      options: ["Wrong", "Right"],
      correctLabel: "Right",
      feedback: "REWIND_FEEDBACK_MARKER",
      required: true,
    });

    const packageId = await submitForReview(page);
    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await page.getByRole("button", { name: "Preview", exact: true }).first().click();
    await expect(page).toHaveURL(/\/review\/preview\//);
    // Same VideoCheckpointPlayer component as Student (§I) — wait for it to
    // actually mount and construct the (fake) player before driving it.
    await expect(page.getByText("Rewind Test Video")).toBeVisible();
    await expect(page.locator('[id^="youtube-checkpoint-player-"]')).toBeVisible();

    const fake = fakePlayer(page);
    await fake.play();
    // Jump straight to well past the required checkpoint (a big forward seek), skipping right over it.
    await fake.setTime(40);
    await waitForPollTick(page);

    await expect(page.getByText("Must-answer rewind check")).toBeVisible();
    // The real production code (useVideoCheckpoints.ts) must have pulled playback back to the checkpoint's own timestamp.
    expect(await fake.currentTime()).toBe(20);
  });
});

test.describe("Video Checkpoints: existing UI keeps rendering", () => {
  test("the existing curated Student session (now authored with checkpoints[]) still renders normally", async ({ page }) => {
    await page.goto("/session/components-and-state");
    await expect(page.getByRole("heading", { name: "Learn", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Practice", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exercise", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Play session video" }).click();
    await expect(page.getByText("Which HTML element is used to collect user input?")).toBeVisible();
  });

  test("the Content Reviewer's Preview as Student still renders for a session with video + checkpoints configured", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openAuthoringWorkspace(page, { courseId: REAL_COURSE_ID, subjectId: REAL_SUBJECT_ID, sessionTitle: "Reviewer Preview Checkpoint Session" });
    await fillMandatorySections(page, { objective: "Reviewer preview should still work." });

    await goToAuthoringSection(page, "Video");
    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Reviewer Preview Video");

    await goToAuthoringSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();
    await addAndFillCheckpoint(page, 1, {
      timestamp: "01:00",
      question: "Does preview still work?",
      options: ["No", "Yes"],
      correctLabel: "Yes",
      feedback: "It does.",
      required: true,
    });

    const packageId = await submitForReview(page);

    await loginAsContentReviewer(page);
    await page.goto(`/review/package/${packageId}`);
    await page.getByRole("button", { name: "Preview", exact: true }).first().click();

    await expect(page).toHaveURL(/\/review\/preview\//);
    await expect(page.getByText("CONTENT PREVIEW", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Learn", exact: true })).toBeVisible();
    await expect(page.getByText("Reviewer preview should still work.")).toBeVisible();
  });
});
