import { test, expect, type Page } from "@playwright/test";
import { loginAsContentAuthor } from "./fixtures/helpers";
import {
  buildDocx,
  learningContentParagraphs,
  practiceParagraphs,
  exerciseParagraphs,
  type DocxParagraphSpec,
} from "./fixtures/buildDocx";

const COURSE_ID = "full-stack-web-development";
const SUBJECT_ID = "frontend-development";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function docxFile(name: string, paragraphs: DocxParagraphSpec[], opts?: { includeImage?: boolean }) {
  return { name, mimeType: DOCX_MIME, buffer: await buildDocx(paragraphs, opts) };
}

/** Navigates straight to a fresh authoring workspace for a brand-new session, bypassing the Course/Subject click-through (already covered by its own test). */
async function openFreshWorkspace(page: Page, sessionTitle: string) {
  await page.goto(`/content/courses/${COURSE_ID}/subjects/${SUBJECT_ID}`);
  await page.getByRole("button", { name: "Add Session" }).click();
  // ContentSubjectDetail.tsx's "Add a New Session" panel is a real <form>
  // element, not a <div> — scope by the form itself (found via its own
  // heading) rather than an ancestor-div XPath that can never match a <form>.
  const addForm = page.locator("form").filter({ hasText: "Add a New Session" });
  await addForm.getByLabel("Session Title").fill(sessionTitle);
  // Also mandatory for "Start Authoring" to enable — a throwaway value only.
  await addForm.getByLabel("Session Description").fill("Fixture session for automated tests.");
  await addForm.getByRole("button", { name: "Start Authoring" }).click();
  await expect(page).toHaveURL(/\/author$/);
}

async function goToSection(page: Page, label: string) {
  // Exact text match on the sidebar item's label span — its accessible NAME
  // also includes the status icon's aria-label, so role-based name matching
  // can't distinguish "Video" from "Video Checkpoints" reliably.
  await page.locator("aside").getByText(label, { exact: true }).click();
}

test.describe("Content Session Authoring: navigation", () => {
  test("Content Author can reach Courses -> Course -> Subject -> Session, and the workspace loads with every section", async ({ page }) => {
    await loginAsContentAuthor(page);
    await page.goto("/content/courses");

    await page.getByRole("link", { name: /Full-Stack Web Development/i }).click();
    await expect(page).toHaveURL(new RegExp(`/content/courses/${COURSE_ID}$`));

    await page.getByRole("link", { name: /Frontend Development/i }).click();
    await expect(page).toHaveURL(new RegExp(`/content/courses/${COURSE_ID}/subjects/${SUBJECT_ID}$`));

    const row = page.getByText("React Fundamentals", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    // "React Fundamentals" already has an in-progress draft in this
    // environment (from earlier authoring work), so its row shows "Continue
    // Editing", not "Start Authoring" — this test only needs to reach the
    // workspace, not care which of the two got it there.
    const startBtn = row.getByRole("button", { name: "Start Authoring" });
    const continueBtn = row.getByRole("button", { name: "Continue Editing" });
    await Promise.race([startBtn.waitFor({ timeout: 10000 }), continueBtn.waitFor({ timeout: 10000 })]).catch(() => {});
    if (await startBtn.count() > 0) await startBtn.click();
    else await continueBtn.click();
    await expect(page).toHaveURL(/\/sessions\/react-fundamentals\/author$/);

    // "AI Help" was renamed to "AI Tutor" (Day 3); "Settings" is not one of
    // the current 7 sections (SECTION_LABELS in authoredSession.ts) at all.
    for (const label of ["Session Information", "Learning Content", "Video", "Video Checkpoints", "Practice", "AI Tutor", "Exercise"]) {
      await expect(page.locator("aside").getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("section navigation moves between sections without a fixed order", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Nav Test Session");

    await goToSection(page, "Exercise");
    await expect(page.getByRole("heading", { name: "Exercise" })).toBeVisible();

    await goToSection(page, "Session Information");
    await expect(page.getByRole("heading", { name: "Session Information" })).toBeVisible();

    await goToSection(page, "Video");
    await expect(page.getByRole("heading", { name: "Video" })).toBeVisible();
  });
});

test.describe("Content Session Authoring: Session Information", () => {
  test("Session Information can be edited and saved", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Async / Await");

    await page.getByLabel("Session Description").fill("Learn how to write asynchronous JavaScript.");
    // Learning Objective lives on the Learning Content panel, not here —
    // this test's own name is about Session Information specifically, so
    // its assertions below only cover that panel's own fields.
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByText(/Last saved/)).toBeVisible();

    await expect(page.locator("aside").getByText("Session Information", { exact: true }).locator("xpath=..").getByText("✓")).toBeVisible();
  });
});

test.describe("Content Session Authoring: real DOCX parsing", () => {
  test("a valid document is deterministically extracted into the correct fields", async ({ page }) => {
    await loginAsContentAuthor(page);
    // A distinct title from the "Session Information" test above — reusing
    // "Async / Await" collided with that test's own session (both slugify
    // to the same session id), which is what made this test flaky/broken
    // under parallel workers.
    await openFreshWorkspace(page, "DOCX Parsing Test Session");
    await goToSection(page, "Learning Content");
    // Each hybrid section defaults to "Manual Entry" — the file input doesn't
    // exist in the DOM until "Import DOCX" is clicked (HybridUploadPanel.tsx).
    await page.getByRole("button", { name: "Import DOCX" }).click();

    const file = await docxFile("learning.docx", learningContentParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);

    await expect(page.getByText(/Imported from document/)).toBeVisible();

    // The imported values live in the same Manual Entry fields (Explanation
    // textarea, Examples/Key Concepts/Concept Tags StringListEditors) — but
    // HybridUploadPanel only renders `children` (those fields) in "manual"
    // mode, and their values live in textarea/input `value`, never as plain
    // DOM text, so this needs "Manual Entry" clicked first and inputValue()
    // checks, not getByText().
    await page.getByRole("button", { name: "Manual Entry" }).click();

    // "Introduction" + "Concept: async" + "Concept: await" + "Common Mistakes" + "Summary" all concatenate into one explanation.
    const explanation = await page.getByLabel("Explanation").inputValue();
    expect(explanation).toContain("JavaScript runs on a single thread");
    expect(explanation).toContain("Marking a function async means it always returns a Promise");
    expect(explanation).toContain("Forgetting await");

    // Each "Example" heading becomes its own examples[] item.
    const exampleInputs = page.locator("label", { hasText: "Examples" }).locator("input[type='text']");
    const exampleCount = await exampleInputs.count();
    const examples: string[] = [];
    for (let i = 0; i < exampleCount; i++) examples.push(await exampleInputs.nth(i).inputValue());
    expect(examples.some((e) => e.includes("async function getUser"))).toBe(true);
    expect(examples.some((e) => e.includes("const data = await getUser"))).toBe(true);

    // Key Concepts / Concept Tags become their own bullet lists.
    const keyConceptInputs = page.locator("label", { hasText: "Key Concepts" }).locator("input[type='text']");
    const keyConceptCount = await keyConceptInputs.count();
    const keyConcepts: string[] = [];
    for (let i = 0; i < keyConceptCount; i++) keyConcepts.push(await keyConceptInputs.nth(i).inputValue());
    expect(keyConcepts).toContain("async functions always return a Promise.");

    const conceptTagInputs = page.locator("label", { hasText: "Concept Tags" }).locator("input[type='text']");
    const conceptTagCount = await conceptTagInputs.count();
    const conceptTags: string[] = [];
    for (let i = 0; i < conceptTagCount; i++) conceptTags.push(await conceptTagInputs.nth(i).inputValue());
    expect(conceptTags).toContain("async-await");
  });

  test("wrong file type is rejected before any parsing is attempted", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Upload Test Session");
    await goToSection(page, "Learning Content");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await expect(page.getByText(/isn't a \.docx file/)).toBeVisible();
  });

  test("a malformed .docx (not a real zip) produces a clear error, not a crash", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Malformed Test Session");
    await goToSection(page, "Learning Content");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    await page.locator('input[type="file"]').setInputFiles({
      name: "corrupted.docx",
      mimeType: DOCX_MIME,
      buffer: Buffer.from("this is not a real zip/docx file at all"),
    });
    await expect(page.getByText(/doesn't look like a valid Word document/)).toBeVisible();
  });

  test("a real, validly-zipped .docx with the required heading missing reports exactly what's missing", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Missing Heading Test Session");
    await goToSection(page, "Learning Content");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    // A real, well-formed docx — just without a "LEARNING CONTENT" Heading 1 anywhere in it.
    const file = await docxFile("wrong-heading.docx", [
      { style: "Heading1", text: "SOMETHING ELSE ENTIRELY" },
      { text: "This document never declares the section this upload is for." },
    ]);
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/required LEARNING CONTENT section was not found in the document/)).toBeVisible();
  });

  test("embedded images are ignored for content but surfaced as an explicit, honest warning", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Image Test Session");
    await goToSection(page, "Learning Content");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    const file = await docxFile("with-image.docx", learningContentParagraphs(), { includeImage: true });
    await page.locator('input[type="file"]').setInputFiles(file);

    await expect(page.getByText(/Imported from document/)).toBeVisible();
    await expect(page.getByText(/contains 1 image.*won't be shown to students/)).toBeVisible();
    // The real text content still extracted correctly alongside the warning
    // — lives in the Explanation textarea's value, not plain DOM text, so
    // "Manual Entry" must be clicked to reveal the field before reading it.
    await page.getByRole("button", { name: "Manual Entry" }).click();
    expect(await page.getByLabel("Explanation").inputValue()).toContain("JavaScript runs on a single thread");
  });

  test("code-like text is preserved exactly, without corruption, through extraction", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Code Block Test Session");
    await goToSection(page, "Learning Content");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    const codeSnippet = 'function add(a, b) {\n  return a + b;\n}\nconst result = add(1, 2); // "quotes", <tags>, & ampersands';
    const file = await docxFile("code-example.docx", [
      { style: "Heading1", text: "LEARNING CONTENT" },
      { style: "Heading2", text: "Introduction" },
      { text: "Here is a runnable example:" },
      { style: "Heading2", text: "Example" },
      { text: codeSnippet },
    ]);
    await page.locator('input[type="file"]').setInputFiles(file);

    await expect(page.getByText(/Imported from document/)).toBeVisible();
    // Exact code text — including quotes, angle brackets, and the
    // newline-separated lines — must survive verbatim. It's an Examples
    // StringListEditor item (an <input> value, not plain DOM text), so
    // "Manual Entry" must be clicked to reveal the field first.
    await page.getByRole("button", { name: "Manual Entry" }).click();
    const exampleInputs = page.locator("label", { hasText: "Examples" }).locator("input[type='text']");
    const exampleCount = await exampleInputs.count();
    const examples: string[] = [];
    for (let i = 0; i < exampleCount; i++) examples.push(await exampleInputs.nth(i).inputValue());
    expect(examples.some((e) => e.includes('const result = add(1, 2); // "quotes", <tags>, & ampersands'))).toBe(true);
    expect(examples.some((e) => e.includes("function add(a, b) {"))).toBe(true);
  });

  test("Replace Document re-extracts from the new file", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Replace Test Session");
    await goToSection(page, "Learning Content");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    const firstFile = await docxFile("first.docx", learningContentParagraphs());
    await page.locator('input[type="file"]').setInputFiles(firstFile);
    await expect(page.getByText(/Imported from document/)).toBeVisible();
    await expect(page.locator("span.font-mono", { hasText: "first.docx" })).toBeVisible();

    const secondFile = await docxFile("second.docx", [
      { style: "Heading1", text: "LEARNING CONTENT" },
      { style: "Heading2", text: "Introduction" },
      { text: "A completely different explanation for the replacement document." },
      { style: "Heading2", text: "Key Concepts" },
      { text: "A brand new key concept." },
    ]);
    await page.getByRole("button", { name: "Replace Document" }).click();
    await page.locator('input[type="file"]').setInputFiles(secondFile);

    await expect(page.locator("span.font-mono", { hasText: "second.docx" })).toBeVisible();

    // The actual field values live in inputs/textareas, not plain DOM text —
    // "Manual Entry" reveals them (see the main DOCX-parsing test's own
    // comment). Clicked only now, after both uploads, since "Replace
    // Document" itself is only available in "docx" mode.
    await page.getByRole("button", { name: "Manual Entry" }).click();
    const explanation = await page.getByLabel("Explanation").inputValue();
    expect(explanation).toContain("A completely different explanation for the replacement document.");
    // The first file's content is gone, not merged.
    expect(explanation).not.toContain("JavaScript runs on a single thread");

    const keyConceptInputs = page.locator("label", { hasText: "Key Concepts" }).locator("input[type='text']");
    const keyConceptCount = await keyConceptInputs.count();
    const keyConcepts: string[] = [];
    for (let i = 0; i < keyConceptCount; i++) keyConcepts.push(await keyConceptInputs.nth(i).inputValue());
    expect(keyConcepts).toContain("A brand new key concept.");
  });
});

test.describe("Content Session Authoring: Practice, AI Help, Exercise (hybrid/document sections)", () => {
  test("Practice shows real imported document content plus language + starter code", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Practice Test Session");
    await goToSection(page, "Practice");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    const file = await docxFile("practice.docx", practiceParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/Imported from document/)).toBeVisible();
    // Self-Check was retired from the active product contract — the document's
    // Self-Check section is still correctly recognized by the parser (so it
    // doesn't corrupt other fields), but its content is never extracted,
    // stored, or shown anywhere any more.
    await expect(page.getByText("Self-Check", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Function is declared with async")).toHaveCount(0);

    // The Task field's value lives in a textarea, not plain DOM text —
    // "Manual Entry" reveals it.
    await page.getByRole("button", { name: "Manual Entry" }).click();
    const task = await page.getByLabel("Task").inputValue();
    expect(task).toContain("Rewrite the given Promise-chain function");
    expect(task).toContain("The starter code fetches a user");

    // Field() (ContentSessionAuthoring.tsx) renders the hint text inside the
    // same <label> as the textarea, so the textarea's real accessible name is
    // "Starter Code" plus the hint concatenated on — never exactly "Starter
    // Code" alone. Match by the stable prefix instead of an exact name.
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("python");
    await page.getByRole("textbox", { name: /^Starter Code/ }).fill("def solve():\n    pass\n");
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("python");
    await expect(page.getByRole("textbox", { name: /^Starter Code/ })).toHaveValue("def solve():\n    pass\n");
  });

  test("AI Tutor renders manually-entered suggested prompts", async ({ page }) => {
    // Renamed from "AI Help" (Day 3) and reworked: the AI Tutor authoring
    // panel is manual-entry only (a "Suggested Prompts" list) — there is no
    // DOCX import for it (AiHelpPanel in ContentSessionAuthoring.tsx has no
    // HybridUploadPanel at all, just a StringListEditor), so this no longer
    // tests a DOCX-driven quickPrompts/guidance/defaultReply shape that
    // doesn't exist in the current AiHelpDraft ({ suggestedPrompts: string[] }).
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "AI Tutor Test Session");
    await goToSection(page, "AI Tutor");

    await page.locator("label", { hasText: "Suggested Prompts" }).getByRole("button").last().click();
    await page.getByLabel("e.g. Explain this concept in simpler terms 1").fill("Explain async/await simply");

    await expect(page.getByLabel("e.g. Explain this concept in simpler terms 1")).toHaveValue("Explain async/await simply");
  });

  test("Exercise shows real imported document content plus language + starter code, with evaluation-criteria guidance", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Exercise Test Session");
    await goToSection(page, "Exercise");
    await page.getByRole("button", { name: "Import DOCX" }).click();

    const file = await docxFile("exercise.docx", exerciseParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/Imported from document/)).toBeVisible();

    // "Manual Entry" reveals the actual fields (see the main DOCX-parsing
    // test's own comment) — Objective is a textarea, Evaluation Criteria/
    // Edge Cases are StringListEditor inputs; the "checked as true or false"
    // text is real static hint copy next to the Evaluation Criteria field
    // (not imported content), so it's real DOM text once revealed.
    await page.getByRole("button", { name: "Manual Entry" }).click();
    expect(await page.getByLabel("Objective").inputValue()).toContain("Independently write an async function");
    await expect(page.getByText(/checked as true or false/)).toBeVisible();

    const criteriaInputs = page.locator("label", { hasText: "Evaluation Criteria" }).locator("input[type='text']");
    const criteriaCount = await criteriaInputs.count();
    const criteria: string[] = [];
    for (let i = 0; i < criteriaCount; i++) criteria.push(await criteriaInputs.nth(i).inputValue());
    expect(criteria).toContain("Returns null when the request fails");

    const edgeCaseInputs = page.locator("label", { hasText: "Edge Cases" }).locator("input[type='text']");
    const edgeCaseCount = await edgeCaseInputs.count();
    const edgeCases: string[] = [];
    for (let i = 0; i < edgeCaseCount; i++) edgeCases.push(await edgeCaseInputs.nth(i).inputValue());
    expect(edgeCases).toContain("City name is empty");

    // Same accessible-name concatenation as the Practice test above — the
    // hint text lives inside the same <label> as the textarea.
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("java");
    await page.getByRole("textbox", { name: /^Starter Code/ }).fill("public class Solution {}");
    await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("java");
  });
});

test.describe("Content Session Authoring: Video and Checkpoints", () => {
  test("Video fields work and a checkpoint can be manually added", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Video Test Session");
    await goToSection(page, "Video");

    await page.getByText("This session includes a video", { exact: true }).click();
    await page.getByLabel("YouTube URL").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Video Title").fill("Video Test Session Explained");
    await page.getByRole("button", { name: "Preview Video" }).click();
    await expect(page.locator('iframe[title="Video preview"]')).toBeVisible();

    await goToSection(page, "Video Checkpoints");
    await page.getByText("This video has checkpoints", { exact: true }).click();
    await page.getByRole("button", { name: "+ Add Checkpoint" }).click();

    await page.getByLabel(/Timestamp/).fill("04:20");
    await page.getByLabel("Question", { exact: true }).fill("What does await do?");
    const optionInputs = page.getByLabel(/^Option \d/);
    await optionInputs.nth(0).fill("Pauses the function");
    await optionInputs.nth(1).fill("Stops the browser");
    await page.getByLabel("Correct Answer").selectOption({ label: "Pauses the function" });
    await page.getByLabel("Feedback").fill("Exactly right.");

    await expect(page.getByLabel(/Timestamp/)).toHaveValue("04:20");
  });
});

test.describe("Content Session Authoring: Save Draft, Submit for Review, Preview", () => {
  test("Save Draft persists after refresh", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Persistence Test Session");
    await page.getByLabel("Session Description").fill("This should survive a refresh.");
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByText(/Last saved/)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Session Description")).toHaveValue("This should survive a refresh.");
  });

  test("Submit for Review is blocked until mandatory sections are complete, and lists exactly what's missing", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Incomplete Test Session");

    await expect(page.getByRole("button", { name: "Submit for Review" }).first()).toBeDisabled();
    await expect(page.getByText("Complete these sections before submitting:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Learning Content", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exercise", exact: true })).toBeVisible();

    await page.getByText("Complete these sections before submitting:").locator("xpath=..").getByRole("button", { name: "Learning Content", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Learning Content" })).toBeVisible();
  });

  test("A fully completed session (real documents) can Submit for Review, and Preview as Student opens the real Session Workspace", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Complete Test Session");

    await page.getByLabel("Session Description").fill("A fully authored session for testing.");

    await goToSection(page, "Learning Content");
    await page.getByLabel("Learning Objective").fill("Demonstrate a complete authoring flow.");
    await page.getByRole("button", { name: "Import DOCX" }).click();
    await page.locator('input[type="file"]').setInputFiles(await docxFile("learning.docx", learningContentParagraphs()));
    await expect(page.getByText(/Imported from document/)).toBeVisible();

    await goToSection(page, "Practice");
    await page.getByRole("button", { name: "Import DOCX" }).click();
    await page.locator('input[type="file"]').setInputFiles(await docxFile("practice.docx", practiceParagraphs()));
    await expect(page.getByText(/Imported from document/)).toBeVisible();

    await goToSection(page, "Exercise");
    await page.getByRole("button", { name: "Import DOCX" }).click();
    await page.locator('input[type="file"]').setInputFiles(await docxFile("exercise.docx", exerciseParagraphs()));
    await expect(page.getByText(/Imported from document/)).toBeVisible();

    await expect(page.getByRole("button", { name: "Submit for Review" }).first()).toBeEnabled();
    await page.getByRole("button", { name: "Submit for Review" }).first().click();

    // Lands on the Content Author's own read-only submission-status view —
    // not the Reviewer's /review/package/:id workstation (see the role
    // separation slice's final report).
    await expect(page).toHaveURL(/\/content\/submissions\//);
    await expect(page.getByRole("heading", { name: "Submission Status" })).toBeVisible();

    await page.getByRole("button", { name: "Preview", exact: true }).first().click();
    await expect(page).toHaveURL(/\/content\/preview\//);
    await expect(page.getByText("CONTENT PREVIEW", { exact: false })).toBeVisible();
    await expect(page.getByText("A fully authored session for testing.")).toBeVisible();
    // Real extracted content, not mock text, reaches the actual Student Session Workspace preview.
    await expect(page.getByText(/Rewrite the given Promise-chain function/)).toBeVisible();
  });
});

test.describe("Content Session Authoring: isolation", () => {
  test("Student, Company, and Admin routes are unaffected by the new authoring routes", async ({ page }) => {
    for (const path of ["/dashboard", "/my-course", "/company/login"]) {
      await page.goto(path);
      await expect(page.locator('a[href^="/content/courses"]')).toHaveCount(0);
    }
  });
});
