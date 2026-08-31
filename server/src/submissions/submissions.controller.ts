import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

/**
 * Student-facing Exercise submissions — the first backend routes ever
 * gated to Role.STUDENT. studentId, attemptNumber, and contentVersionId are
 * always derived server-side (JWT + the session's currently-published
 * Publication) — see SubmissionsService, never taken from the request body.
 */
@Controller('sessions/:sessionId/exercise/submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  submit(@Param('sessionId') sessionId: string, @Body() dto: CreateSubmissionDto, @CurrentUser() user: JwtPayload) {
    return this.submissionsService.submit(sessionId, user.sub, dto.files);
  }

  @Get()
  list(@Param('sessionId') sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.submissionsService.listForSession(sessionId, user.sub);
  }
}
