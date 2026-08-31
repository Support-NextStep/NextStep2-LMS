import { test, expect, type Page } from "@playwright/test";
import { loginAsContentAuthor } from "./fixtures/helpers";
import {
  buildDocx,
  learningContentParagraphs,
  practiceParagraphs,
  exerciseParagraphs,
  aiHelpParagraphs,
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
  const addForm = page.getByLabel("Session Title").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
  await addForm.getByLabel("Session Title").fill(sessionTitle);
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
    await row.getByRole("button", { name: "Start Authoring" }).click();
    await expect(page).toHaveURL(/\/sessions\/react-fundamentals\/author$/);

    for (const label of ["Session Information", "Learning Content", "Video", "Video Checkpoints", "Practice", "AI Help", "Exercise", "Settings"]) {
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
    await page.getByLabel("Learning Objective").fill("Use async/await instead of raw Promise chains.");
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByText(/Last saved/)).toBeVisible();

    await expect(page.locator("aside").getByText("Session Information", { exact: true }).locator("xpath=..").getByText("✓")).toBeVisible();
  });
});

test.describe("Content Session Authoring: real DOCX parsing", () => {
  test("a valid document is deterministically extracted into the correct fields", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Async / Await");
    await goToSection(page, "Learning Content");

    const file = await docxFile("learning.docx", learningContentParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);

    await expect(page.getByText(/Imported from document/)).toBeVisible();
    // "Introduction" + "Concept: async" + "Concept: await" + "Common Mistakes" + "Summary" all concatenate into one explanation.
    await expect(page.getByText(/JavaScript runs on a single thread/)).toBeVisible();
    await expect(page.getByText(/Marking a function async means it always returns a Promise/)).toBeVisible();
    await expect(page.getByText(/Forgetting await/)).toBeVisible();
    // Each "Example" heading becomes its own examples[] item.
    await expect(page.getByText(/async function getUser/)).toBeVisible();
    await expect(page.getByText(/const data = await getUser/)).toBeVisible();
    // Key Concepts / Concept Tags become their own bullet lists.
    await expect(page.getByText("async functions always return a Promise.")).toBeVisible();
    await expect(page.getByText("async-await", { exact: true })).toBeVisible();
  });

  test("wrong file type is rejected before any parsing is attempted", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Upload Test Session");
    await goToSection(page, "Learning Content");

    await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await expect(page.getByText(/isn't a \.docx file/)).toBeVisible();
  });

  test("a malformed .docx (not a real zip) produces a clear error, not a crash", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Malformed Test Session");
    await goToSection(page, "Learning Content");

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

    const file = await docxFile("with-image.docx", learningContentParagraphs(), { includeImage: true });
    await page.locator('input[type="file"]').setInputFiles(file);

    await expect(page.getByText(/Imported from document/)).toBeVisible();
    await expect(page.getByText(/contains 1 image.*won't be shown to students/)).toBeVisible();
    // The real text content still extracted correctly alongside the warning.
    await expect(page.getByText(/JavaScript runs on a single thread/)).toBeVisible();
  });

  test("code-like text is preserved exactly, without corruption, through extraction", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Code Block Test Session");
    await goToSection(page, "Learning Content");

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
    // Exact code text — including quotes, angle brackets, and the newline-separated lines — must survive verbatim.
    await expect(page.locator("pre, li, p", { hasText: 'const result = add(1, 2); // "quotes", <tags>, & ampersands' })).toBeVisible();
    await expect(page.getByText("function add(a, b) {", { exact: false })).toBeVisible();
  });

  test("Replace Document re-extracts from the new file", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Replace Test Session");
    await goToSection(page, "Learning Content");

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
    await expect(page.getByText("A completely different explanation for the replacement document.")).toBeVisible();
    await expect(page.getByText("A brand new key concept.")).toBeVisible();
    // The first file's content is gone, not merged.
    await expect(page.getByText(/JavaScript runs on a single thread/)).toHaveCount(0);
  });
});

test.describe("Content Session Authoring: Practice, AI Help, Exercise (hybrid/document sections)", () => {
  test("Practice shows real imported document content plus language + starter code", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Practice Test Session");
    await goToSection(page, "Practice");

    const file = await docxFile("practice.docx", practiceParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/Imported from document/)).toBeVisible();
    await expect(page.getByText(/Rewrite the given Promise-chain function/)).toBeVisible();
    await expect(page.getByText(/The starter code fetches a user/)).toBeVisible();
    // Self-Check was retired from the active product contract — the document's
    // Self-Check section is still correctly recognized by the parser (so it
    // doesn't corrupt other fields), but its content is never extracted,
    // stored, or shown anywhere any more.
    await expect(page.getByText("Self-Check", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Function is declared with async")).toHaveCount(0);

    await page.getByLabel("Language").selectOption("python");
    await page.getByLabel("Starter Code").fill("def solve():\n    pass\n");
    await expect(page.getByLabel("Language")).toHaveValue("python");
    await expect(page.getByLabel("Starter Code")).toHaveValue("def solve():\n    pass\n");
  });

  test("AI Help renders real imported quick prompts, guidance, and default guidance", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "AI Help Test Session");
    await goToSection(page, "AI Help");

    const file = await docxFile("ai-help.docx", aiHelpParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/Imported from document/)).toBeVisible();
    await expect(page.getByText("What is async?", { exact: false })).toBeVisible();
    await expect(page.getByText(/async marks a function as always returning a Promise/)).toBeVisible();
    await expect(page.getByText(/try asking about async, await, or error handling/)).toBeVisible();
  });

  test("Exercise shows real imported document content plus language + starter code, with evaluation-criteria guidance", async ({ page }) => {
    await loginAsContentAuthor(page);
    await openFreshWorkspace(page, "Exercise Test Session");
    await goToSection(page, "Exercise");

    const file = await docxFile("exercise.docx", exerciseParagraphs());
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText(/Imported from document/)).toBeVisible();
    await expect(page.getByText(/Independently write an async function/)).toBeVisible();
    await expect(page.getByText("Returns null when the request fails")).toBeVisible();
    await expect(page.getByText("City name is empty")).toBeVisible();
    await expect(page.getByText(/checked as true or false/)).toBeVisible();

    await page.getByLabel("Language").selectOption("java");
    await page.getByLabel("Starter Code").fill("public class Solution {}");
    await expect(page.getByLabel("Language")).toHaveValue("java");
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
    await page.getByLabel("Learning Objective").fill("Demonstrate a complete authoring flow.");

    await goToSection(page, "Learning Content");
    await page.locator('input[type="file"]').setInputFiles(await docxFile("learning.docx", learningContentParagraphs()));
    await expect(page.getByText(/Imported from document/)).toBeVisible();

    await goToSection(page, "Practice");
    await page.locator('input[type="file"]').setInputFiles(await docxFile("practice.docx", practiceParagraphs()));
    await expect(page.getByText(/Imported from document/)).toBeVisible();

    await goToSection(page, "Exercise");
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
