// ---------------------------------------------------------------------------
// Real, deterministic DOCX heading-based extraction — Content Authoring
// Slice 2.
//
// Implements NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md §9's decision exactly:
// STRICT TEMPLATE PARSING based on Word's own real paragraph-style metadata
// — never AI, never a heuristic guess from font size/boldness/visual
// appearance. A paragraph is a heading only because its XML says so
// (`<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>`), and nothing here ever
// rewrites, paraphrases, or summarizes extracted text — every string
// returned below is exactly what was written under its matching heading,
// only ever *relocated*, never reworded. A .docx is a zip container (same
// mechanism already used for content package ZIPs elsewhere in this app),
// so this reuses jszip, then reads word/document.xml with the browser's
// native DOMParser (no extra dependency).
//
// Matches on Word's default built-in heading style ids ("Heading1" /
// "Heading2", case/whitespace-insensitively) — the standard, well-known
// convention for Word's own "Heading 1"/"Heading 2" styles. Anything not
// carrying one of those two style ids is treated as ordinary body text.
// ---------------------------------------------------------------------------

import JSZip from "jszip";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type ParagraphStyle = "heading1" | "heading2" | "body";
export type DocxParagraph = { style: ParagraphStyle; text: string };

export type DocxReadResult = { ok: true; paragraphs: DocxParagraph[]; imageCount: number } | { ok: false; error: string };

/** Unzips the .docx and reads word/document.xml's real paragraph structure. Never throws — every failure mode (not a zip, missing document.xml, malformed XML) becomes a plain-language error result. */
export async function readDocx(file: File): Promise<DocxReadResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, error: "This file doesn't look like a valid Word document — it couldn't be opened as a .docx." };
  }

  const documentEntry = zip.file("word/document.xml");
  if (!documentEntry) {
    return { ok: false, error: "This file doesn't look like a valid Word document (missing word/document.xml)." };
  }

  let xmlText: string;
  try {
    xmlText = await documentEntry.async("text");
  } catch {
    return { ok: false, error: "This document's content couldn't be read." };
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("xml parse error");
  } catch {
    return { ok: false, error: "This document's content is malformed and couldn't be read." };
  }

  const paragraphNodes = doc.getElementsByTagNameNS(WORD_NS, "p");
  const paragraphs: DocxParagraph[] = [];
  for (let i = 0; i < paragraphNodes.length; i++) {
    paragraphs.push(readParagraph(paragraphNodes[i]));
  }

  const imageCount = Object.keys(zip.files).filter((name) => name.startsWith("word/media/") && !zip.files[name].dir).length;

  return { ok: true, paragraphs, imageCount };
}

function readParagraph(node: Element): DocxParagraph {
  let style: ParagraphStyle = "body";
  const pPr = node.getElementsByTagNameNS(WORD_NS, "pPr")[0];
  if (pPr) {
    const pStyle = pPr.getElementsByTagNameNS(WORD_NS, "pStyle")[0];
    const styleId = pStyle?.getAttributeNS(WORD_NS, "val") ?? pStyle?.getAttribute("w:val") ?? "";
    const normalized = styleId.replace(/\s+/g, "").toLowerCase();
    if (normalized === "heading1") style = "heading1";
    else if (normalized === "heading2") style = "heading2";
  }

  // Only this paragraph's own runs — getElementsByTagNameNS on `node` is
  // scoped to its subtree, which for a <w:p> is exactly its own <w:r> runs.
  const textParts: string[] = [];
  const runs = node.getElementsByTagNameNS(WORD_NS, "r");
  for (let i = 0; i < runs.length; i++) {
    for (const child of Array.from(runs[i].childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === "t") textParts.push(el.textContent ?? "");
      else if (el.localName === "br") textParts.push("\n");
      else if (el.localName === "tab") textParts.push("\t");
    }
  }

  return { style, text: textParts.join("").trim() };
}

// ---- Section-level parsing --------------------------------------------------

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** All paragraphs between the given Heading-1 (matched case-insensitively) and the next Heading-1 (or end of document). Returns null if that Heading-1 doesn't exist at all — the one hard failure mode every section extractor below reports. */
function findSection(paragraphs: DocxParagraph[], heading1Name: string): DocxParagraph[] | null {
  const target = normalize(heading1Name);
  const startIndex = paragraphs.findIndex((p) => p.style === "heading1" && normalize(p.text) === target);
  if (startIndex === -1) return null;
  const rest = paragraphs.slice(startIndex + 1);
  const endIndex = rest.findIndex((p) => p.style === "heading1");
  return endIndex === -1 ? rest : rest.slice(0, endIndex);
}

type LabelSpec = { key: string; labels: string[] };

/** Scans a flat run of body paragraphs for "Label: value" lines (case-insensitive) — a paragraph that isn't itself a recognized label is treated as a continuation of whichever label most recently appeared, so a value may span several paragraphs. */
function scanLabeledFields(paragraphs: DocxParagraph[], specs: LabelSpec[]): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (currentKey) result[currentKey] = buffer.join(" ").trim();
    buffer = [];
  }

  for (const p of paragraphs) {
    if (p.style !== "body" || p.text.length === 0) continue;
    const match = matchLabel(p.text, specs);
    if (match) {
      flush();
      currentKey = match.key;
      buffer = match.remainder ? [match.remainder] : [];
    } else if (currentKey) {
      buffer.push(p.text);
    }
  }
  flush();
  return result;
}

function matchLabel(text: string, specs: LabelSpec[]): { key: string; remainder: string } | null {
  const trimmed = text.trim();
  for (const spec of specs) {
    for (const label of spec.labels) {
      const prefix = `${label}:`;
      if (trimmed.toLowerCase().startsWith(prefix)) {
        return { key: spec.key, remainder: trimmed.slice(prefix.length).trim() };
      }
    }
  }
  return null;
}

type Segment = { kind: "top"; paragraphs: DocxParagraph[] } | { kind: "list"; heading: string; paragraphs: DocxParagraph[] };

/** Splits a section into "top-level" runs (label:value fields) and "list" runs (the bullet-list paragraphs under one of `listHeadings`) — handles the official template's exact structure, where label fields and Heading-2 bullet lists are interleaved (see Exercise). */
function segmentByHeading2(paragraphs: DocxParagraph[], listHeadings: string[]): Segment[] {
  const normalizedListHeadings = listHeadings.map(normalize);
  const segments: Segment[] = [];
  let current: Segment = { kind: "top", paragraphs: [] };

  for (const p of paragraphs) {
    if (p.style === "heading2") {
      const idx = normalizedListHeadings.indexOf(normalize(p.text));
      segments.push(current);
      current = idx !== -1 ? { kind: "list", heading: listHeadings[idx], paragraphs: [] } : { kind: "top", paragraphs: [] };
      continue;
    }
    if (p.style === "body") current.paragraphs.push(p);
  }
  segments.push(current);
  return segments;
}

function collectListItems(paragraphs: DocxParagraph[]): string[] {
  return paragraphs.map((p) => p.text).filter((t) => t.length > 0);
}

function listFor(segments: Segment[], heading: string): string[] {
  const seg = segments.find((s) => s.kind === "list" && s.heading === heading);
  return seg && seg.kind === "list" ? collectListItems(seg.paragraphs) : [];
}

function topParagraphsOf(segments: Segment[]): DocxParagraph[] {
  return segments.filter((s): s is Extract<Segment, { kind: "top" }> => s.kind === "top").flatMap((s) => s.paragraphs);
}

export type ExtractResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

// ---- Learning Content --------------------------------------------------------

export type LearningExtraction = { explanation: string; examples: string[]; keyConcepts: string[]; conceptTags: string[] };

export function extractLearningContent(paragraphs: DocxParagraph[]): ExtractResult<LearningExtraction> {
  const section = findSection(paragraphs, "LEARNING CONTENT");
  if (!section) {
    return {
      ok: false,
      errors: ["Learning Content could not be imported because the required LEARNING CONTENT section was not found in the document."],
    };
  }

  const explanationHeadings = new Set(["introduction", "common mistakes", "summary"]);
  const explanationLines: string[] = [];
  const examples: string[] = [];
  let currentExampleLines: string[] = [];
  const keyConcepts: string[] = [];
  const conceptTags: string[] = [];

  type Bucket = "explanation" | "example" | "keyConcepts" | "conceptTags" | null;
  let bucket: Bucket = null;

  const flushExample = () => {
    if (currentExampleLines.length > 0) {
      examples.push(currentExampleLines.join(" ").trim());
      currentExampleLines = [];
    }
  };

  for (const p of section) {
    if (p.style === "heading2") {
      flushExample();
      const norm = normalize(p.text);
      if (explanationHeadings.has(norm) || norm.startsWith("concept:")) {
        bucket = "explanation";
        explanationLines.push(p.text);
      } else if (norm === "example") {
        bucket = "example";
      } else if (norm === "key concepts") {
        bucket = "keyConcepts";
      } else if (norm === "concept tags") {
        bucket = "conceptTags";
      } else {
        bucket = null;
      }
      continue;
    }
    if (p.style !== "body" || p.text.length === 0) continue;
    if (bucket === "explanation") explanationLines.push(p.text);
    else if (bucket === "example") currentExampleLines.push(p.text);
    else if (bucket === "keyConcepts") keyConcepts.push(p.text);
    else if (bucket === "conceptTags") conceptTags.push(p.text);
  }
  flushExample();

  return { ok: true, data: { explanation: explanationLines.join("\n"), examples, keyConcepts, conceptTags } };
}

// ---- Practice -----------------------------------------------------------------

export type PracticeExtraction = { task: string };

export function extractPracticeContent(paragraphs: DocxParagraph[]): ExtractResult<PracticeExtraction> {
  const section = findSection(paragraphs, "PRACTICE");
  if (!section) {
    return { ok: false, errors: ["Practice could not be imported because the required PRACTICE section was not found in the document."] };
  }

  // "Self-Check" is still recognized here purely so its own bullet list is
  // correctly excluded from the top-level label scan below (otherwise its
  // text would bleed into whichever field label most recently appeared).
  // Self-Check itself was retired from the active product contract (see
  // NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's cleanup pass) — it
  // is no longer extracted, stored, or used anywhere downstream.
  const segments = segmentByHeading2(section, ["Self-Check"]);
  const fields = scanLabeledFields(topParagraphsOf(segments), [
    { key: "task", labels: ["practice task", "task"] },
    { key: "objective", labels: ["practice objective", "objective"] },
    { key: "instructions", labels: ["practice instructions", "instructions"] },
  ]);

  const taskParts = [fields.task, fields.objective, fields.instructions].filter((s) => s && s.trim().length > 0);

  return {
    ok: true,
    data: {
      task: taskParts.join("\n\n").trim(),
    },
  };
}

// ---- Exercise -------------------------------------------------------------------

export type ExerciseExtraction = {
  title: string;
  objective: string;
  scenario: string;
  expectedBehaviour: string;
  submissionInstructions: string;
  requirements: string[];
  evaluationCriteria: string[];
  edgeCases: string[];
};

export function extractExerciseContent(paragraphs: DocxParagraph[]): ExtractResult<ExerciseExtraction> {
  const section = findSection(paragraphs, "EXERCISE");
  if (!section) {
    return { ok: false, errors: ["Exercise could not be imported because the required EXERCISE section was not found in the document."] };
  }

  const fieldSpecs: LabelSpec[] = [
    { key: "title", labels: ["exercise title"] },
    { key: "objective", labels: ["objective"] },
    { key: "scenario", labels: ["scenario / problem", "scenario"] },
    { key: "expectedBehaviour", labels: ["expected behaviour", "expected behavior"] },
    { key: "submissionInstructions", labels: ["submission instructions"] },
  ];

  const segments = segmentByHeading2(section, ["Requirements", "Evaluation Criteria", "Edge Cases"]);

  // NEXTSTEP2_CONTENT_AUTHORING_TEMPLATE.md places "Expected Behavior" and
  // "Submission Instructions" AFTER Requirements/Evaluation Criteria/Edge
  // Cases — as plain trailing body text with no Heading2 of their own.
  // segmentByHeading2() has no way to know a bulleted list has "ended" short
  // of another heading, so a labeled field trailing after the last list
  // lands inside that list segment's own paragraphs. Pull it back out here:
  // the first paragraph in any list segment that matches a known field
  // label ends that list's real bullet items — everything from there on
  // (including any multi-paragraph continuation lines) is field text, not a
  // bullet, and is scanned exactly like a top-level field.
  const trailingFieldParagraphs: DocxParagraph[] = [];
  const cleanedSegments: Segment[] = segments.map((seg) => {
    if (seg.kind !== "list") return seg;
    const firstLabelIndex = seg.paragraphs.findIndex((p) => matchLabel(p.text, fieldSpecs) !== null);
    if (firstLabelIndex === -1) return seg;
    trailingFieldParagraphs.push(...seg.paragraphs.slice(firstLabelIndex));
    return { kind: "list", heading: seg.heading, paragraphs: seg.paragraphs.slice(0, firstLabelIndex) };
  });

  const fields = scanLabeledFields([...topParagraphsOf(cleanedSegments), ...trailingFieldParagraphs], fieldSpecs);

  return {
    ok: true,
    data: {
      title: fields.title ?? "",
      objective: fields.objective ?? "",
      scenario: fields.scenario ?? "",
      expectedBehaviour: fields.expectedBehaviour ?? "",
      submissionInstructions: fields.submissionInstructions ?? "",
      requirements: listFor(cleanedSegments, "Requirements"),
      evaluationCriteria: listFor(cleanedSegments, "Evaluation Criteria"),
      edgeCases: listFor(cleanedSegments, "Edge Cases"),
    },
  };
}

