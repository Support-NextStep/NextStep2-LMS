import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { EvaluationService } from './evaluation.service';

/**
 * Student-facing read of one submission's evaluation. Kept as its own
 * controller sharing SubmissionsController's route prefix, rather than a
 * method added to that controller — same "separate controller, same
 * resource prefix" precedent as ReviewController/PackagesController both
 * addressing `packages/:id/...`. No @Body() anywhere here: every value this
 * needs (sessionId, submissionId, the requesting student's identity) comes
 * from the route or the verified JWT, never from client-supplied input.
 */
@Controller('sessions/:sessionId/exercise/submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Get(':submissionId/evaluation')
  getEvaluation(
    @Param('sessionId') sessionId: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: JwtPayload
  ) {
    return this.evaluationService.getEvaluationForStudent(sessionId, submissionId, user.sub);
  }
}
