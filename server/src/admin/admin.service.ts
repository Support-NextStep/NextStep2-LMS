import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Admin operational read model — completes the pre-existing "Admin MVP"
 * prototype (getAllStudentIds()/getAllSubmissions() in app/src/data, both
 * mock/localStorage-only) with the real, already-existing backend data that
 * has existed since the Student Session Completion Persistence slice
 * (Day 6): StudentSessionProgress, StudentActivityProgress,
 * ExerciseSubmission, ExerciseEvaluation. No new database fields — every
 * value below is read straight off tables/relations that already exist.
 *
 * "Active" is deliberately the most conservative, honest definition the
 * current schema actually supports: a student who has at least one real,
 * backend-recorded row of activity (session progress, activity progress, or
 * an exercise submission) ANYWHERE. There is no `status`/`isActive` column
 * on User, and no recency requirement was asked for — inventing a time
 * window (e.g. "active in the last 30 days") would be fabricating business
 * semantics that don't exist yet, not reporting what the schema supports.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private async activeStudentIdSet(studentIds: string[]): Promise<Set<string>> {
    if (studentIds.length === 0) return new Set();
    const [sessionRows, activityRows, submissionRows] = await Promise.all([
      this.prisma.studentSessionProgress.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true }, distinct: ['studentId'] }),
      this.prisma.studentActivityProgress.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true }, distinct: ['studentId'] }),
      this.prisma.exerciseSubmission.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true }, distinct: ['studentId'] }),
    ]);
    const active = new Set<string>();
    for (const row of [...sessionRows, ...activityRows, ...submissionRows]) active.add(row.studentId);
    return active;
  }

  /**
   * Every real STUDENT-role account plus a minimal, real operational
   * summary per student — never a password hash, never anything beyond
   * what the roster/dashboard actually display.
   */
  async listStudents() {
    const students = await this.prisma.user.findMany({
      where: { role: Role.STUDENT },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) return [];

    const [sessionCounts, submissions, activeIds] = await Promise.all([
      this.prisma.studentSessionProgress.groupBy({ by: ['studentId'], where: { studentId: { in: studentIds } }, _count: { _all: true } }),
      this.prisma.exerciseSubmission.findMany({
        where: { studentId: { in: studentIds } },
        select: { studentId: true, submittedAt: true, evaluation: { select: { status: true, overallScore: true } } },
      }),
      this.activeStudentIdSet(studentIds),
    ]);

    const sessionsCompletedByStudent = new Map(sessionCounts.map((r) => [r.studentId, r._count._all]));
    const submissionsByStudent = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const list = submissionsByStudent.get(sub.studentId) ?? [];
      list.push(sub);
      submissionsByStudent.set(sub.studentId, list);
    }

    return students.map((s) => {
      const subs = submissionsByStudent.get(s.id) ?? [];
      const scored = subs.filter((sub) => sub.evaluation?.status === 'EVALUATED' && sub.evaluation.overallScore !== null);
      const averageScore =
        scored.length > 0 ? Math.round(scored.reduce((sum, sub) => sum + (sub.evaluation!.overallScore ?? 0), 0) / scored.length) : null;
      const lastSubmissionAt = subs.length > 0 ? subs.reduce((latest, sub) => (sub.submittedAt > latest ? sub.submittedAt : latest), subs[0].submittedAt) : null;

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        createdAt: s.createdAt,
        sessionsCompleted: sessionsCompletedByStudent.get(s.id) ?? 0,
        exerciseSubmissionsCount: subs.length,
        averageScore,
        isActive: activeIds.has(s.id),
        lastActivityAt: lastSubmissionAt,
      };
    });
  }

  /** For AdminDashboard's Students/Active Students metrics — same data as listStudents(), without the per-student detail work it doesn't need. */
  async getStudentCounts() {
    const students = await this.prisma.user.findMany({ where: { role: Role.STUDENT }, select: { id: true } });
    const studentIds = students.map((s) => s.id);
    const activeIds = await this.activeStudentIdSet(studentIds);
    return { studentsCount: studentIds.length, activeStudentsCount: activeIds.size };
  }

  /**
   * One real student's full operational detail. Ownership of what's
   * returned is inherent — every query below is scoped to studentId from
   * the URL, and the ADMIN role check happens in the controller guard, not
   * here; there is no "adminUserId" accepted anywhere, matching every other
   * write/read in this backend that never trusts a client-supplied actor id.
   */
  async getStudentDetail(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, createdAt: true, role: true },
    });
    if (!student || student.role !== Role.STUDENT) {
      throw new NotFoundException('Student not found.');
    }

    const [sessionProgress, activityProgress, submissions] = await Promise.all([
      this.prisma.studentSessionProgress.findMany({
        where: { studentId },
        orderBy: { completedAt: 'desc' },
        select: { sessionId: true, completedAt: true, session: { select: { title: true } } },
      }),
      this.prisma.studentActivityProgress.findMany({
        where: { studentId },
        orderBy: { completedAt: 'desc' },
        select: { sessionId: true, activityType: true, completedAt: true, session: { select: { title: true } } },
      }),
      this.prisma.exerciseSubmission.findMany({
        where: { studentId },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          sessionId: true,
          session: { select: { title: true } },
          contentVersionId: true,
          attemptNumber: true,
          submittedAt: true,
          evaluation: {
            select: {
              status: true,
              overallScore: true,
              criteriaResults: true,
              strengths: true,
              improvements: true,
              feedback: true,
              evaluatedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      id: student.id,
      name: student.name,
      email: student.email,
      createdAt: student.createdAt,
      sessionProgress: sessionProgress.map((p) => ({ sessionId: p.sessionId, sessionTitle: p.session.title, completedAt: p.completedAt })),
      activityProgress: activityProgress.map((p) => ({
        sessionId: p.sessionId,
        sessionTitle: p.session.title,
        activityType: p.activityType,
        completedAt: p.completedAt,
      })),
      submissions: submissions.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        sessionTitle: s.session.title,
        contentVersionId: s.contentVersionId,
        attemptNumber: s.attemptNumber,
        submittedAt: s.submittedAt,
        evaluation: s.evaluation,
      })),
    };
  }
}
