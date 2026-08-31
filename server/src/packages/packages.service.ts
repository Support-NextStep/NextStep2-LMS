import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PackageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getIncompleteMandatorySections } from './draft-completeness';
import { buildContentVersionCreateData } from './content-version-data';

const ACTIVE_STATUSES: PackageStatus[] = [PackageStatus.DRAFT, PackageStatus.READY_FOR_REVIEW, PackageStatus.CHANGES_REQUESTED];

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts a new authoring cycle for a session. The partial unique index
   * `content_packages_one_active_per_session` is the real guarantee behind
   * "at most one in-progress package per session" — this pre-check exists
   * only to return a clean 409 instead of surfacing a raw constraint
   * violation to the client.
   */
  async createPackage(sessionId: string, authorId: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found.');

    const existingActive = await this.prisma.contentPackage.findFirst({
      where: { sessionId, status: { in: ACTIVE_STATUSES } },
    });
    if (existingActive) {
      throw new ConflictException('An in-progress package already exists for this session.');
    }

    return this.prisma.contentPackage.create({
      data: {
        sessionId,
        fileName: session.title,
        importedById: authorId,
        status: PackageStatus.DRAFT,
        draftContent: {},
      },
    });
  }

  /** Loads a package and asserts the given user is the author who owns it — never a role check alone. */
  private async getOwnedPackage(packageId: string, authorId: string) {
    const pkg = await this.prisma.contentPackage.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found.');
    if (pkg.importedById !== authorId) throw new ForbiddenException('You do not own this package.');
    return pkg;
  }

  /** Whole-object upsert of the mutable draft — matches the frontend's existing saveDraft(draft) behavior exactly: one call, the entire AuthoredSessionDraft, every time. */
  async saveDraft(packageId: string, authorId: string, draftContent: unknown) {
    if (draftContent === null || typeof draftContent !== 'object' || Array.isArray(draftContent)) {
      throw new BadRequestException('draftContent must be a JSON object.');
    }
    const pkg = await this.getOwnedPackage(packageId, authorId);
    if (pkg.status !== PackageStatus.DRAFT && pkg.status !== PackageStatus.CHANGES_REQUESTED) {
      throw new ConflictException(`Cannot edit a package in status ${pkg.status}.`);
    }
    return this.prisma.contentPackage.update({
      where: { id: packageId },
      data: { draftContent: draftContent as object },
    });
  }

  /** Author's own read (resume-draft, submission-status page) or a reviewer/admin's read of any package. */
  async getPackage(packageId: string, user: { sub: string; role: string }) {
    const pkg = await this.prisma.contentPackage.findUnique({
      where: { id: packageId },
      include: {
        session: { select: { id: true, title: true, subjectId: true, subject: { select: { id: true, title: true, courseId: true } } } },
        contentVersions: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        contentReviews: {
          orderBy: { createdAt: 'asc' },
          include: { reviewer: { select: { id: true, name: true } } },
        },
      },
    });
    if (!pkg) throw new NotFoundException('Package not found.');
    if (user.role === 'CONTENT_AUTHOR' && pkg.importedById !== user.sub) {
      throw new ForbiddenException('You do not own this package.');
    }
    return pkg;
  }

  async listMine(authorId: string) {
    return this.prisma.contentPackage.findMany({
      where: { importedById: authorId },
      orderBy: { updatedAt: 'desc' },
      include: {
        session: { select: { id: true, title: true, subjectId: true, subject: { select: { id: true, courseId: true } } } },
        // Just the single most recent review — enough for the author's own
        // submissions list to show "why were changes requested" without a
        // second round trip. Full history is on GET /packages/:id.
        contentReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  /**
   * The one moment a draft's mutable JSON gets frozen into a new, immutable
   * ContentVersion. Never mutates a prior ContentVersion — a
   * changes-requested -> edit -> resubmit cycle always creates a brand new
   * row here, leaving the earlier one (and whatever ContentReview was made
   * against it) untouched, permanently.
   */
  async submit(packageId: string, authorId: string) {
    const pkg = await this.getOwnedPackage(packageId, authorId);
    if (pkg.status !== PackageStatus.DRAFT && pkg.status !== PackageStatus.CHANGES_REQUESTED) {
      throw new ConflictException(`Cannot submit a package in status ${pkg.status}.`);
    }

    const incompleteSections = getIncompleteMandatorySections(pkg.draftContent);
    if (incompleteSections.length > 0) {
      throw new BadRequestException({
        message: 'Draft is missing mandatory sections.',
        incompleteSections,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.contentVersion.create({
        data: buildContentVersionCreateData(pkg.sessionId, packageId, pkg.draftContent),
      });
      return tx.contentPackage.update({
        where: { id: packageId },
        data: { status: PackageStatus.READY_FOR_REVIEW, currentContentVersionId: version.id },
      });
    });
  }
}
