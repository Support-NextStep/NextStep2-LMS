import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SessionProgressSummary = { sessionId: string; completedAt: Date };

/**
 * Slice 3 — the non-Exercise required-activity keys this session-completion
 * check can verify against StudentActivityProgress. Duplicated from
 * ActivityProgressService's own FRONTEND_KEY_TO_ACTIVITY_TYPE rather than
 * imported, matching this file's existing getPublishedVersion() precedent
 * (see its doc comment) of small, deliberate duplication over a cross-module
 * dependency for a two-line mapping.
 */
const NON_EXERCISE_ACTIVITY_TYPE: Record<'learning' | 'videoCheck' | 'practice', ActivityType> = {
  learning: ActivityType.LEARNING,
  videoCheck: ActivityType.VIDEO_CHECK,
  practice: ActivityType.PRACTICE,
};

/**
 * Student Session Completion Persistence slice — the backend-authoritative
 * replacement for the frontend's previous localStorage-only
 * completedSessionIds (see app/src/data/progress.tsx). This is deliberately
 * NOT a course/subject-progress engine: it only ever answers "which sessions
 * has this student completed, and when" — the existing client-side
 * aggregation (mock.ts's getSubjects/getCourseProgress) still does all the
 * subject/course rollup math over that raw list, exactly as it did over the
 * old localStorage Set.
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every session this student has completed, per the one authoritative
   * StudentSessionProgress row per (studentId, sessionId). The frontend
   * rebuilds its whole completedSessionIds Set from this on initial
   * load/refresh/logout-login/a new browser or device — never from
   * localStorage.
   */
  async listForStudent(studentId: string): Promise<SessionProgressSummary[]> {
    return this.prisma.studentSessionProgress.findMany({
      where: { studentId },
      select: { sessionId: true, completedAt: true },
    });
  }

  /**
   * Same canonical "what's currently live" resolution as
   * SubmissionsService.getPublishedVersion() — re-queried here rather than
   * shared, matching that method's own precedent (see its doc comment).
   */
  private async getPublishedVersion(sessionId: string) {
    const publication = await this.prisma.publication.findFirst({
      where: { sessionId, supersededAt: null },
      include: { contentVersion: true },
    });
    return publication?.contentVersion ?? null;
  }

  /**
   * Marks one session complete for the authenticated student. Idempotent via
   * the (studentId, sessionId) unique constraint: a duplicate/retried call
   * upserts onto the same row rather than creating a second one, and
   * `update: {}` deliberately leaves an already-complete row untouched — the
   * recorded completedAt is always the FIRST time this student completed
   * this session, never bumped forward by a later re-click or retry.
   *
   * SERVER-SIDE VALIDATION (Slice 3 — now checks all four required
   * activities, not just Exercise):
   * Exercise's requirement is checked exactly as before: if the session's
   * currently published content lists "exercise" as required, at least one
   * real ExerciseSubmission from this student in this session must exist —
   * independent of evaluation status (PENDING/EVALUATING/EVALUATED/FAILED
   * all satisfy it; see SessionWorkspace.tsx's exerciseSubmitted).
   *
   * Learning/Video Check/Practice, if required, now each need a real
   * StudentActivityProgress row (see ActivityProgressService for what each
   * one does and does not independently verify — Learning and Practice are
   * still, honestly, just a recorded client signal; Video Check is the one
   * with real structural verification, since completing it requires proving
   * every required checkpoint was answered).
   *
   * A session with no published content (nothing to check requiredActivities
   * against) is not rejected on that basis alone — this endpoint only
   * rejects a completion it has concrete evidence against, never one it
   * simply lacks information about.
   */
  async completeSession(sessionId: string, studentId: string): Promise<SessionProgressSummary> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found.');

    const version = await this.getPublishedVersion(sessionId);
    const requiredActivities = (version?.requiredActivities as string[] | undefined) ?? [];
    if (requiredActivities.includes('exercise')) {
      const submissionCount = await this.prisma.exerciseSubmission.count({ where: { studentId, sessionId } });
      if (submissionCount === 0) {
        throw new BadRequestException('This session requires at least one Exercise submission before it can be completed.');
      }
    }

    const requiredNonExercise = requiredActivities.filter(
      (a): a is keyof typeof NON_EXERCISE_ACTIVITY_TYPE => a === 'learning' || a === 'videoCheck' || a === 'practice'
    );
    if (requiredNonExercise.length > 0) {
      const requiredTypes = requiredNonExercise.map((a) => NON_EXERCISE_ACTIVITY_TYPE[a]);
      const rows = await this.prisma.studentActivityProgress.findMany({
        where: { studentId, sessionId, activityType: { in: requiredTypes } },
        select: { activityType: true },
      });
      const completed = new Set(rows.map((r) => r.activityType));
      const missing = requiredNonExercise.filter((a) => !completed.has(NON_EXERCISE_ACTIVITY_TYPE[a]));
      if (missing.length > 0) {
        throw new BadRequestException(`This session requires the following activities to be completed first: ${missing.join(', ')}.`);
      }
    }

    return this.prisma.studentSessionProgress.upsert({
      where: { studentId_sessionId: { studentId, sessionId } },
      create: { studentId, sessionId },
      update: {},
      select: { sessionId: true, completedAt: true },
    });
  }
}
