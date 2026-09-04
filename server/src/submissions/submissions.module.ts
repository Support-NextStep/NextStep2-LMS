import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { StudentThrottlerGuard } from '../common/guards/student-throttler.guard';

@Module({
  // EvaluationModule: so SubmissionsService can kick off evaluation right
  // after creating a new ExerciseSubmission (see its own doc comment) — a
  // one-way dependency, never the reverse.
  imports: [
    AuthModule, // for JwtAuthGuard's injected JwtService
    // Day 8 security hardening — see StudentThrottlerGuard's own doc
    // comment. 20 submissions/hour per authenticated student is generous
    // for real iterative use (submit, read feedback, revise, resubmit)
    // while bounding queue-flooding against the shared evaluation worker.
    ThrottlerModule.forRoot([{ name: 'student', ttl: 60 * 60 * 1000, limit: 20 }]),
    EvaluationModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, StudentThrottlerGuard],
})
export class SubmissionsModule {}
