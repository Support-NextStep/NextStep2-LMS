import type { PublishedSessionContent } from '../content/content.service';
import type { TutorLessonContext } from './prompt';

// ---------------------------------------------------------------------------
// AI Need Help / AI Tutor (Day 3) — turns a PublishedSessionContent row (plus
// the session's course/subject/session titles) into the small, whitelisted,
// bounded TutorLessonContext actually sent to the model. Deliberately
// duplicated from evaluation-data.ts's own defensive-JSON-shape helpers
// rather than shared — same reasoning as that file's own header comment: no
// module boundary exists for this to live in once, and it's small and pure.
//
// This is the ONLY place Day 3 decides what leaves the server as "lesson
// context" — practice/exercise/aiHelp are untyped Json columns and could in
// principle contain anything a Content Author put there; nothing here ever
// forwards a raw JSON blob, a database id, or any field not explicitly
// listed below.
// ---------------------------------------------------------------------------

const MAX_STRING_CHARS = 3_000;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_CHARS = 300;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) + '…' : value;
}

function truncateList(values: string[], maxItems: number, maxItemChars: number): string[] {
  return values.slice(0, maxItems).map((v) => truncate(v, maxItemChars));
}

export function buildTutorLessonContext(
  content: PublishedSessionContent,
  session: { title: string; description: string; subjectTitle: string; courseTitle: string }
): TutorLessonContext {
  const practice = asRecord(content.practice);
  const exercise = asRecord(content.exercise);
  const aiHelp = asRecord(content.aiHelp);

  return {
    course: truncate(session.courseTitle, MAX_STRING_CHARS),
    subject: truncate(session.subjectTitle, MAX_STRING_CHARS),
    sessionTitle: truncate(session.title, MAX_STRING_CHARS),
    sessionDescription: truncate(session.description, MAX_STRING_CHARS),
    learningObjective: truncate(content.objective, MAX_STRING_CHARS),
    explanation: truncate(content.explanation, MAX_STRING_CHARS),
    concepts: truncateList(content.concepts, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    keyConcepts: truncateList(content.keyConcepts, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    examples: truncateList(content.examples, MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    practiceTask: truncate(asString(practice.task), MAX_STRING_CHARS),
    exerciseObjective: truncate(asString(exercise.objective), MAX_STRING_CHARS),
    exerciseRequirements: truncateList(asStringArray(exercise.requirements), MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    suggestedPrompts: truncateList(asStringArray(aiHelp.suggestedPrompts), MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
  };
}
