// ---------------------------------------------------------------------------
// Admin's student roster — a tiny adapter, not a parallel student data model.
//
// This prototype has no real multi-student backend: there is exactly one
// implicit student per browser (STUDENT in mock.ts), with progress/
// performance/portfolio all read through progress.tsx's useCourseData() and
// portfolio.ts — the same sources the Student's own pages already use. Admin
// pages read those directly; this file only supplies the one thing that
// genuinely doesn't exist elsewhere yet — a stable id to put in the
// /admin/students/:studentId URL.
//
// BACKEND DATA REQUIREMENT: a real student roster (many students, each with
// their own id, email, and isolated progress/performance/portfolio data)
// does not exist in this prototype. See the Admin MVP final report.
// ---------------------------------------------------------------------------
import { STUDENT } from "./mock";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "student"
  );
}

/** Stable synthetic id for the one student this prototype tracks. Not a real account id — see file header. */
export const ADMIN_STUDENT_ID = slugify(STUDENT.name);

/** Every student id Admin can list — always exactly one id in this prototype. */
export function getAllStudentIds(): string[] {
  return [ADMIN_STUDENT_ID];
}
