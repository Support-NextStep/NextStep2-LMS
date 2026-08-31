import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EvaluationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import type { SubmissionFileDto } from './dto/create-submission.dto';

export type SubmissionSummary = {
  id: string;
  attemptNumber: number;
  submittedAt: Date;
};

/** Additive extension of SubmissionSummary carrying evaluation status — used by both submit() (always PENDING, since evaluation now runs in the background — see AI Evaluation Reliability slice) and listForSession() (whatever the background worker has gotten to so far). */
export type SubmissionSummaryWithEvaluation = SubmissionSummary & {
  evaluation: { status: EvaluationStatus; overallScore: number | null } | null;
};

const DEFAULT_LANGUAGE = 'javascript';

/** `ContentVersion.exercise` is untyped JSON (see content.service.ts) — read `.language` defensively, never trust its shape. */
function exerciseLanguage(exercise: Prisma.JsonValue): string {
  if (exercise && typeof exercise === 'object' && !Array.isArray(exercise)) {
    const language = (exercise as Record<string, unknown>).language;
    if (typeof language === 'string' && language.trim().length > 0) return language;
  }
  return DEFAULT_LANGUAGE;
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationService: EvaluationService
  ) {}

  /**
   * Same canonical "what's currently live" resolution as
   * ContentService.getPublishedContentForSession() (publications WHERE
   * session_id = :id AND superseded_at IS NULL, joined to its
   * content_version) — re-queried here, rather than reused, because that
   * method's return shape deliberately omits contentVersion.id, and that id
   * is exactly what a submission must pin against.
   */
  private async getPublishedVersion(sessionId: string) {
    const publication = await this.prisma.publication.findFirst({
      where: { sessionId, supersededAt: null },
      include: { contentVersion: true },
    });
    return publication?.contentVersion ?? null;
  }

  async submit(sessionId: string, studentId: string, files: SubmissionFileDto[]): Promise<SubmissionSummaryWithEvaluation> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found.');

    const version = await this.getPublishedVersion(sessionId);
    if (!version) throw new NotFoundException('This session has no published content to submit an exercise against.');

    const hasRealContent = files.some((f) => f.content.trim().length > 0);
    if (files.length === 0 || !hasRealContent) {
      throw new BadRequestException('Submission cannot be empty.');
    }

    const language = exerciseLanguage(version.exercise);
    const filesJson = files.map((f) => ({ name: f.name, content: f.content })) as Prisma.InputJsonValue;

    let submission: SubmissionSummary;
    try {
      submission = await this.prisma.$transaction(async (tx) => {
        const priorCount = await tx.exerciseSubmission.count({ where: { studentId, sessionId } });
        return tx.exerciseSubmission.create({
          data: {
            studentId,
            sessionId,
            contentVersionId: version.id,
            language,
            files: filesJson,
            attemptNumber: priorCount + 1,
          },
          select: { id: true, attemptNumber: true, submittedAt: true },
        });
      });
    } catch (err) {
      // Unique constraint on (studentId, sessionId, attemptNumber) — two
      // concurrent submissions from the same student racing the count
      // above. Rare; the honest answer is "try again," not a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A submission is already in progress. Please try again.');
      }
      throw err;
    }

    // AI Evaluation Reliability slice: the submission is already durably
    // committed at this point — only the PENDING evaluation row is created
    // here, synchronously (fast: one INSERT, idempotent on retry). The
    // actual evaluate() call is NEVER awaited on the request path anymore —
    // EvaluationWorkerService picks up PENDING rows in the background, so a
    // slow/rate-limited/retrying LLM call can never block this response.
    // Anything that goes wrong below must still never turn a successful
    // submission into a failed HTTP response, and must never delete/hide
    // the submission itself.
    try {
      await this.evaluationService.createPendingEvaluation(submission.id);
    } catch {
      // Intentionally swallowed — see comment above.
    }

    return { ...submission, evaluation: { status: 'PENDING', overallScore: null } };
  }

  /**
   * Additive change from Slice 1: each attempt now also reports its
   * evaluation's status/overallScore (null if evaluation hasn't produced a
   * score yet, or doesn't exist). The three original fields (id,
   * attemptNumber, submittedAt) are unchanged — existing callers that only
   * read those keep working exactly as before.
   */
  async listForSession(sessionId: string, studentId: string): Promise<SubmissionSummaryWithEvaluation[]> {
    const submissions = await this.prisma.exerciseSubmission.findMany({
      where: { sessionId, studentId },
      orderBy: { attemptNumber: 'asc' },
      select: {
        id: true,
        attemptNumber: true,
        submittedAt: true,
        evaluation: { select: { status: true, overallScore: true } },
      },
    });
    return submissions.map((s) => ({
      id: s.id,
      attemptNumber: s.attemptNumber,
      submittedAt: s.submittedAt,
      evaluation: s.evaluation,
    }));
  }
}
