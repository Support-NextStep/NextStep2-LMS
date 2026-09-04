import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { AiTutorService } from './ai-tutor.service';
import { AskTutorDto } from './dto/ask-tutor.dto';

/**
 * Student-facing "Need Help?" / AI Learning Assistant — Day 3, hardened
 * Day 4. Same authentication/route-shape convention as
 * SubmissionsController: the authenticated student is derived from the JWT
 * via @CurrentUser(), never trusted from the request body. As of Day 4,
 * `user.sub` is also the key AiTutorService's rate limit and per-student
 * concurrency bound are enforced against — a request body cannot spoof a
 * different identity to reset or dodge either limit (see
 * AiTutorLimiterService's own doc comment). Gating to Role.STUDENT keeps
 * this consistent with every other real student-facing write/action route
 * in this backend; the guard is also what satisfies "unauthenticated
 * request -> rejected" (Day 3 Task 11.A / Day 4 success criteria).
 */
@Controller('sessions/:sessionId/ai-tutor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class AiTutorController {
  constructor(private readonly aiTutorService: AiTutorService) {}

  @Post('ask')
  ask(@Param('sessionId') sessionId: string, @Body() dto: AskTutorDto, @CurrentUser() user: JwtPayload) {
    return this.aiTutorService.ask(sessionId, user.sub, dto.message);
  }
}
