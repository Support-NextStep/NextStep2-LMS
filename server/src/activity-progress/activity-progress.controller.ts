import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { ActivityProgressService } from './activity-progress.service';
import { CompleteActivityDto } from './dto/complete-activity.dto';

/**
 * Student-facing Learning/Video Check/Practice completion persistence — see
 * ActivityProgressService for the full contract. studentId always comes
 * from the verified JWT (never a request body/query param); a student can
 * only ever read or write their own activity progress, never another
 * student's.
 */
@Controller('sessions/:sessionId/activity-progress')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class ActivityProgressController {
  constructor(private readonly activityProgressService: ActivityProgressService) {}

  /** Every activity the authenticated student has completed in this session. */
  @Get()
  list(@Param('sessionId') sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.activityProgressService.listForStudent(sessionId, user.sub);
  }

  @Post(':activityType/complete')
  complete(
    @Param('sessionId') sessionId: string,
    @Param('activityType') activityType: string,
    @Body() dto: CompleteActivityDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.activityProgressService.completeActivity(sessionId, user.sub, activityType, dto);
  }
}
