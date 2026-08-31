import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PackageStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { ReviewService } from './review.service';
import { RequestChangesDto } from './dto/request-changes.dto';
import { ApproveDto } from './dto/approve.dto';

/**
 * Reviewer-facing operations against a package a Content Author already
 * submitted. Kept as a separate controller from PackagesController (author
 * operations) even though both address `/packages/:id/...` — different
 * role, different service, different lifecycle direction.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * No `status` (or an invalid one): the actionable queue, READY_FOR_REVIEW
   * only (decision: do not treat every non-DRAFT state as the queue).
   * `status=ALL|CHANGES_REQUESTED|APPROVED|PUBLISHED`: the reviewer's other,
   * purely informational dashboard tabs — never DRAFT, which belongs to the
   * author, not the reviewer.
   */
  // ADMIN is included here (read-only — Admin has no request-changes/
  // approve/publish route below) for the same "Admin sees everything,
  // writes nothing" principle already established elsewhere in this
  // backend, so the Admin content overview has a real, cross-author source
  // instead of the author-scoped GET /packages/mine.
  @Get('review/packages')
  @Roles(Role.CONTENT_REVIEWER, Role.ADMIN)
  listQueue(@Query('status') status?: string) {
    const allowed = new Set(['ALL', PackageStatus.CHANGES_REQUESTED, PackageStatus.APPROVED, PackageStatus.PUBLISHED, PackageStatus.READY_FOR_REVIEW]);
    const filter = status && allowed.has(status) ? (status as PackageStatus | 'ALL') : undefined;
    return this.reviewService.listQueue(filter);
  }

  @Post('packages/:id/request-changes')
  @Roles(Role.CONTENT_REVIEWER)
  requestChanges(@Param('id') id: string, @Body() dto: RequestChangesDto, @CurrentUser() user: JwtPayload) {
    return this.reviewService.requestChanges(id, user.sub, dto.checklist, dto.notes);
  }

  @Post('packages/:id/approve')
  @Roles(Role.CONTENT_REVIEWER)
  approve(@Param('id') id: string, @Body() dto: ApproveDto, @CurrentUser() user: JwtPayload) {
    return this.reviewService.approve(id, user.sub, dto.checklist);
  }

  @Post('packages/:id/publish')
  @Roles(Role.CONTENT_REVIEWER)
  publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reviewService.publish(id, user.sub);
  }
}
