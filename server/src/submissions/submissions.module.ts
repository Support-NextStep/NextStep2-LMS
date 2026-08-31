import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  // EvaluationModule: so SubmissionsService can kick off evaluation right
  // after creating a new ExerciseSubmission (see its own doc comment) — a
  // one-way dependency, never the reverse.
  imports: [AuthModule, EvaluationModule], // AuthModule: for JwtAuthGuard's injected JwtService
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
