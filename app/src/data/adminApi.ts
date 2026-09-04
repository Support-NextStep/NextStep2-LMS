// ---------------------------------------------------------------------------
// Real, backend-backed Admin operational data — replaces the old "Admin MVP"
// prototype (getAllStudentIds()/adminStudents.ts's one synthetic id,
// exerciseSubmissions.ts's localStorage-only submissions) with the actual
// multi-student data that has existed in the database since the Student
// Session Completion Persistence slice and AI Exercise Evaluation Slice 1/2.
// See server/src/admin for the backend side — Admin-only (@Roles(ADMIN)),
// read-only, no localStorage anywhere in this file.
// ---------------------------------------------------------------------------
import { apiGet } from "./apiClient";

export type AdminStudentSummary = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  sessionsCompleted: number;
  exerciseSubmissionsCount: number;
  averageScore: number | null;
  isActive: boolean;
  lastActivityAt: string | null;
};

export type AdminDashboardCounts = {
  studentsCount: number;
  activeStudentsCount: number;
};

export type AdminCriterionResult = {
  criterion: string;
  passed: boolean;
  score: number;
  feedback?: string;
};

export type AdminSubmissionEvaluation = {
  status: "PENDING" | "EVALUATING" | "EVALUATED" | "FAILED";
  overallScore: number | null;
  criteriaResults: AdminCriterionResult[] | null;
  strengths: string[];
  improvements: string[];
  feedback: string | null;
  evaluatedAt: string | null;
} | null;

export type AdminSubmission = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  contentVersionId: string;
  attemptNumber: number;
  submittedAt: string;
  evaluation: AdminSubmissionEvaluation;
};

export type AdminStudentDetail = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  sessionProgress: { sessionId: string; sessionTitle: string; completedAt: string }[];
  activityProgress: { sessionId: string; sessionTitle: string; activityType: string; completedAt: string }[];
  submissions: AdminSubmission[];
};

export function fetchAdminStudents(): Promise<AdminStudentSummary[]> {
  return apiGet<AdminStudentSummary[]>("/admin/students");
}

export function fetchAdminDashboardCounts(): Promise<AdminDashboardCounts> {
  return apiGet<AdminDashboardCounts>("/admin/dashboard");
}

export function fetchAdminStudentDetail(studentId: string): Promise<AdminStudentDetail> {
  return apiGet<AdminStudentDetail>(`/admin/students/${studentId}`);
}
