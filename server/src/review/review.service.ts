import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentReviewAction, PackageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The reviewer's ACTIONABLE queue — no `status` filter, or an omitted one
   * — is READY_FOR_REVIEW only. CHANGES_REQUESTED belongs to the author's
   * editing cycle (nothing for a reviewer to do until it's resubmitted);
   * APPROVED/PUBLISHED are completed states, not pending reviewer action.
   * Treating every non-DRAFT status as "the queue" would mix pending-
   * author-action and already-finished packages into one list.
   *
   * The reviewer's dashboard also needs its other three tabs (Changes
   * Requested / Approved / Published — purely informational, not actionable)
   * and an all-of-the-above view for its tile counts, hence the optional
   * `status` filter — DRAFT is never included even when filtering for
   * "everything," since a not-yet-submitted draft is the author's, not the
   * reviewer's, to see.
   */
  async listQueue(status?: PackageStatus | 'ALL') {
    const where =
      status === 'ALL'
        ? { status: { not: PackageStatus.DRAFT } }
        : { status: status ?? PackageStatus.READY_FOR_REVIEW };
    return this.prisma.contentPackage.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      include: {
        session: { select: { id: true, title: true, subjectId: true, subject: { select: { id: true, courseId: true } } } },
      },
    });
  }

  private async getReadyForReviewPackage(packageId: string) {
    const pkg = await this.prisma.contentPackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found.');
    if (pkg.status !== PackageStatus.READY_FOR_REVIEW) {
      throw new ConflictException(`Cannot review a package in status ${pkg.status}.`);
    }
    if (!pkg.currentContentVersionId) {
      // Structurally shouldn't happen — submit() always sets this together with the READY_FOR_REVIEW flip. Defensive only.
      throw new ConflictException('Package has no current content version to review.');
    }
    return pkg;
  }

  /** READY_FOR_REVIEW -> CHANGES_REQUESTED. Inserts one append-only ContentReview row; never mutates a prior one. */
  async requestChanges(packageId: string, reviewerId: string, checklist: Record<string, boolean>, notes: string) {
    if (!notes.trim()) throw new BadRequestException('Review notes are required when requesting changes.');
    const pkg = await this.getReadyForReviewPackage(packageId);

    return this.prisma.$transaction(async (tx) => {
      await tx.contentReview.create({
        data: {
          packageId: pkg.id,
          contentVersionId: pkg.currentContentVersionId as string,
          reviewerId,
          action: ContentReviewAction.CHANGES_REQUESTED,
          checklist,
          notes,
        },
      });
      return tx.contentPackage.update({ where: { id: pkg.id }, data: { status: PackageStatus.CHANGES_REQUESTED } });
    });
  }

  /** READY_FOR_REVIEW -> APPROVED. Approval is a ContentReview row (action = APPROVED), not a separate entity. */
  async approve(packageId: string, reviewerId: string, checklist: Record<string, boolean>) {
    if (Object.keys(checklist).length === 0 || !Object.values(checklist).every(Boolean)) {
      throw new BadRequestException('Every checklist item must be checked before approving.');
    }
    const pkg = await this.getReadyForReviewPackage(packageId);

    return this.prisma.$transaction(async (tx) => {
      await tx.contentReview.create({
        data: {
          packageId: pkg.id,
          contentVersionId: pkg.currentContentVersionId as string,
          reviewerId,
          action: ContentReviewAction.APPROVED,
          checklist,
        },
      });
      return tx.contentPackage.update({ where: { id: pkg.id }, data: { status: PackageStatus.APPROVED } });
    });
  }

  /**
   * APPROVED -> PUBLISHED. Supersedes whatever Publication was previously
   * live for this session (never more than one live Publication at once —
   * the partial unique index on publications is the real backstop if two
   * publish attempts ever race), and records the PUBLISHED ContentReview
   * row as the audit-trail companion to the new Publication, in the same
   * transaction.
   *
   * Day 5 follow-up (Issue 1): this is also the one point that propagates
   * the author-edited Session Title/Description to the real Session catalog
   * row — never on every draft save/keystroke, and never anywhere else.
   * Publish is the correct moment because it's the only step that already
   * means "this version is now the one true thing students see" — the same
   * moment Publication itself flips over. ContentVersion.sessionTitle/
   * sessionDescription (captured once, immutably, at submit time — see
   * content-version-data.ts) is the single source of truth being propagated
   * FROM; ContentPackage.draftContent is never read here, so an author's
   * still-in-progress next draft can never leak into what gets published.
   */
  async publish(packageId: string, reviewerId: string) {
    const pkg = await this.prisma.contentPackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found.');
    if (pkg.status !== PackageStatus.APPROVED) {
      throw new ConflictException(`Cannot publish a package in status ${pkg.status}.`);
    }
    if (!pkg.currentContentVersionId) {
      throw new ConflictException('Package has no current content version to publish.');
    }

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.contentVersion.findUniqueOrThrow({
        where: { id: pkg.currentContentVersionId as string },
        select: { sessionTitle: true, sessionDescription: true },
      });

      await tx.publication.updateMany({
        where: { sessionId: pkg.sessionId, supersededAt: null },
        data: { supersededAt: new Date() },
      });

      const publication = await tx.publication.create({
        data: {
          contentVersionId: pkg.currentContentVersionId as string,
          sessionId: pkg.sessionId,
          publishedById: reviewerId,
        },
      });

      await tx.contentPackage.update({ where: { id: pkg.id }, data: { status: PackageStatus.PUBLISHED } });

      // Both fields are mandatory before Submit for Review (draft-completeness.ts),
      // so a real submitted version never has an empty one — this guard only
      // protects a pre-existing ContentVersion row from before this column
      // existed (backfilled to '' by its migration) from ever blanking out a
      // real, already-correct Session title/description.
      if (version.sessionTitle.trim() && version.sessionDescription.trim()) {
        await tx.session.update({
          where: { id: pkg.sessionId },
          data: { title: version.sessionTitle, description: version.sessionDescription },
        });
      }

      await tx.contentReview.create({
        data: {
          packageId: pkg.id,
          contentVersionId: pkg.currentContentVersionId as string,
          reviewerId,
          action: ContentReviewAction.PUBLISHED,
        },
      });

      return publication;
    });
  }
}
