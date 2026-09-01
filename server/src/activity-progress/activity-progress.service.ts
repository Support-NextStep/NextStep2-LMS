import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CompleteActivityDto } from './dto/complete-activity.dto';

/** The three non-Exercise required activities this module tracks — deliberately excludes "exercise", which keeps ExerciseSubmission as its own, already-existing source of truth (see ProgressService.completeSession). */
export type ActivityFrontendKey = 'learning' | 'videoCheck' | 'practice';

export type ActivityProgressSummary = { activityType: ActivityFrontendKey; completedAt: Date };

export const FRONTEND_KEY_TO_ACTIVITY_TYPE: Record<ActivityFrontendKey, ActivityType> = {
  learning: ActivityType.LEARNING,
  videoCheck: ActivityType.VIDEO_CHECK,
  practice: ActivityType.PRACTICE,
};

const ACTIVITY_TYPE_TO_FRONTEND_KEY: Record<ActivityType, ActivityFrontendKey> = {
  [ActivityType.LEARNING]: 'learning',
  [ActivityType.VIDEO_CHECK]: 'videoCheck',
  [ActivityType.PRACTICE]: 'practice',
};

/** Only the fields read out of ContentVersion.checkpoints (untyped JSON) — never trust its shape beyond this. */
type StoredCheckpoint = { id?: unknown; required?: unknown };

/**
 * Slice 3 (Server-Side Session Activity Progress) — backend-authoritative
 * evidence that a student completed Learning, Video Check, or Practice for
 * a session. See StudentActivityProgress's own schema doc comment for the
 * full, honest breakdown of what each activity type does and does not
 * prove — this service is what enforces that.
 */
@Injectable()
export class ActivityProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Same canonical "what's currently live" resolution as
   * SubmissionsService.getPublishedVersion() / ProgressService's own copy —
   * re-queried here rather than shared, matching that precedent (see either
   * of their doc comments for why).
   */
  private async getPublishedVersion(sessionId: string) {
    const publication = await this.prisma.publication.findFirst({
      where: { sessionId, supersededAt: null },
      include: { contentVersion: true },
    });
    return publication?.contentVersion ?? null;
  }

  /** Every activity this student has completed in this session. The frontend fetches this once on session load to restore Learning/Video Check/Practice's "done" state after a refresh, logout/login, or a new browser/device — never from localStorage. */
  async listForStudent(sessionId: string, studentId: string): Promise<ActivityProgressSummary[]> {
    const rows = await this.prisma.studentActivityProgress.findMany({
      where: { studentId, sessionId },
      select: { activityType: true, completedAt: true },
    });
    return rows.map((r) => ({ activityType: ACTIVITY_TYPE_TO_FRONTEND_KEY[r.activityType], completedAt: r.completedAt }));
  }

  /**
   * Records one activity as completed for the authenticated student.
   * Idempotent via the (studentId, sessionId, activityType) unique
   * constraint: `update: {}` leaves an already-complete row untouched, so
   * the recorded completedAt is always the FIRST completion, never bumped
   * by a later repeat call.
   *
   * videoCheck is the only one of these three with real, structural
   * server-side validation: the caller must submit which checkpoint ids it
   * answered, and every checkpoint the session's own published content
   * marks required must be present, or this throws. learning/practice have
   * no server-checkable payload at all — see this class's own file header
   * and StudentActivityProgress's schema doc comment for why, in detail.
   */
  async completeActivity(
    sessionId: string,
    studentId: string,
    activityTypeParam: string,
    dto: CompleteActivityDto
  ): Promise<ActivityProgressSummary> {
    const key = activityTypeParam as ActivityFrontendKey;
    if (!Object.prototype.hasOwnProperty.call(FRONTEND_KEY_TO_ACTIVITY_TYPE, key)) {
      throw new BadRequestException(`Unknown activity type "${activityTypeParam}".`);
    }

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found.');

    if (key === 'videoCheck') {
      await this.assertRequiredCheckpointsAnswered(sessionId, dto.answeredCheckpointIds ?? []);
    }

    const activityType = FRONTEND_KEY_TO_ACTIVITY_TYPE[key];
    const row = await this.prisma.studentActivityProgress.upsert({
      where: { studentId_sessionId_activityType: { studentId, sessionId, activityType } },
      create: { studentId, sessionId, activityType },
      update: {},
      select: { activityType: true, completedAt: true },
    });
    return { activityType: key, completedAt: row.completedAt };
  }

  /**
   * WRONG ANSWER != INCOMPLETE (by design — see the frontend's own
   * useVideoCheckpoints.ts, unchanged by this slice): this only checks that
   * every required checkpoint id was ANSWERED, never which option was
   * picked or whether it was correct. A session with no published content
   * (nothing to check checkpoints against) has zero required checkpoints by
   * definition, so an empty answeredCheckpointIds list is accepted.
   */
  private async assertRequiredCheckpointsAnswered(sessionId: string, answeredCheckpointIds: string[]): Promise<void> {
    const version = await this.getPublishedVersion(sessionId);
    const checkpoints = (version?.checkpoints as unknown as StoredCheckpoint[] | null) ?? [];
    const requiredIds = checkpoints
      .filter((c) => c.required === true && typeof c.id === 'string')
      .map((c) => c.id as string);

    const answered = new Set(answeredCheckpointIds);
    const missing = requiredIds.filter((id) => !answered.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Video Check cannot be completed: ${missing.length} required checkpoint(s) have not been answered yet.`
      );
    }
  }
}
