// ---------------------------------------------------------------------------
// Builds real, minimal, valid .docx files (as Node Buffers) for Playwright
// tests to upload — a .docx is a zip container, so this is the same
// mechanism as buildContentPackageZip.ts, just producing a Word-compatible
// XML body with real Heading1/Heading2 paragraph styles instead of JSON.
// Not a spec file — no .spec.ts suffix.
// ---------------------------------------------------------------------------
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require("jszip") as typeof import("jszip");

export type DocxParagraphSpec = { style?: "Heading1" | "Heading2"; text: string };

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraphXml(p: DocxParagraphSpec): string {
  const pPr = p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : "";
  // A literal "\n" in fixture text becomes a <w:br/> line break within one paragraph's runs.
  const lines = p.text.split("\n");
  const runs = lines
    .map((line, i) => (i === 0 ? `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>` : `<w:r><w:br/><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`))
    .join("");
  return `<w:p>${pPr}${runs}</w:p>`;
}

/** Builds a real, openable .docx from a flat list of paragraphs (each optionally Heading1/Heading2-styled, otherwise ordinary body text) — matching exactly what docxParser.ts reads. */
export async function buildDocx(paragraphs: DocxParagraphSpec[], opts?: { includeImage?: boolean }): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", ROOT_RELS);

  const body = paragraphs.map(paragraphXml).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;
  zip.folder("word")!.file("document.xml", documentXml);

  if (opts?.includeImage) {
    zip.folder("word")!.folder("media")!.file("image1.png", "fake-image-bytes-for-testing");
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

// ---- Ready-made section fixtures, matching NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md §1 exactly ----

export function learningContentParagraphs(): DocxParagraphSpec[] {
  return [
    { style: "Heading1", text: "LEARNING CONTENT" },
    { style: "Heading2", text: "Introduction" },
    { text: "JavaScript runs on a single thread. Async/await lets slow operations happen without freezing everything else." },
    { style: "Heading2", text: "Concept: async" },
    { text: "Marking a function async means it always returns a Promise." },
    { style: "Heading2", text: "Concept: await" },
    { text: "await pauses execution of an async function until the Promise resolves." },
    { style: "Heading2", text: "Example" },
    { text: 'async function getUser() { const res = await fetch("/api/user"); return res.json(); }' },
    { style: "Heading2", text: "Example" },
    { text: "try { const data = await getUser(); } catch (err) { console.error(err); }" },
    { style: "Heading2", text: "Common Mistakes" },
    { text: "Forgetting await, or using await outside an async function." },
    { style: "Heading2", text: "Summary" },
    { text: "async/await is a cleaner way to write Promise-based code." },
    { style: "Heading2", text: "Key Concepts" },
    { text: "async functions always return a Promise." },
    { text: "await pauses only that function, not the whole program." },
    { style: "Heading2", text: "Concept Tags" },
    { text: "async-await" },
    { text: "promises" },
  ];
}

export function practiceParagraphs(): DocxParagraphSpec[] {
  return [
    { style: "Heading1", text: "PRACTICE" },
    { text: "Practice Objective: Rewrite the given Promise-chain function to use async/await instead." },
    { text: "Practice Instructions: The starter code fetches a user using .then(). Convert it to use await." },
    { text: "Expected Learning: Reinforces the async/await pattern through hands-on repetition." },
    { style: "Heading2", text: "Self-Check" },
    { text: "Function is declared with async" },
    { text: "Both fetch calls use await" },
    { text: "A try/catch wraps the awaited calls" },
  ];
}

export function exerciseParagraphs(): DocxParagraphSpec[] {
  return [
    { style: "Heading1", text: "EXERCISE" },
    { text: "Exercise Title: Async/Await Exercise" },
    { text: "Objective: Independently write an async function with proper error handling." },
    { text: "Scenario / Problem: Write a function getWeather(city) that fetches weather data and returns the parsed result." },
    { style: "Heading2", text: "Requirements" },
    { text: "Function is declared async" },
    { text: "Uses await for the fetch call" },
    { text: "Expected Behaviour: Input -> correct output, or null on failure." },
    { style: "Heading2", text: "Evaluation Criteria" },
    { text: "Returns null when the request fails" },
    { text: "Returns the parsed JSON response on success" },
    { style: "Heading2", text: "Edge Cases" },
    { text: "City name is empty" },
    { text: "Network request times out" },
    { text: "Submission Instructions: Submit via the exercise editor." },
  ];
}

export function aiHelpParagraphs(): DocxParagraphSpec[] {
  return [
    { style: "Heading1", text: "AI HELP" },
    { style: "Heading2", text: "Quick Prompt: What is async?" },
    { text: "Guidance: async marks a function as always returning a Promise." },
    { style: "Heading2", text: "Quick Prompt: Why use await?" },
    { text: "Guidance: await lets asynchronous code read top-to-bottom like synchronous code." },
    { text: "Default Guidance: Good question — try asking about async, await, or error handling." },
  ];
}
