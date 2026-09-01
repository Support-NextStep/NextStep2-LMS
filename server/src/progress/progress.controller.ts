import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { ProgressService } from './progress.service';

/**
 * Student-facing session-completion persistence — see ProgressService for
 * the full contract. studentId is always derived from the verified JWT
 * (never from a request body/query param); a student can only ever read or
 * write their own progress, never another student's.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  /**
   * Every session the authenticated student has completed. The frontend
   * fetches this once on load and rebuilds its whole completedSessionIds set
   * from it — this doubles as the "is this one session complete" read too
   * (the app already needs the full list to render subject/course progress,
   * so a second per-session GET would be redundant).
   */
  @Get('progress')
  listMine(@CurrentUser() user: JwtPayload) {
    return this.progressService.listForStudent(user.sub);
  }

  @Post('sessions/:sessionId/progress/complete')
  complete(@Param('sessionId') sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.progressService.completeSession(sessionId, user.sub);
  }
}
