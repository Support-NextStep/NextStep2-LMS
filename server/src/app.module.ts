import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ContentModule } from './content/content.module';
import { PackagesModule } from './packages/packages.module';
import { ReviewModule } from './review/review.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { EvaluationModule } from './evaluation/evaluation.module';

/**
 * Modular monolith per NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md
 * Part 17 — one process, one database, clean module boundaries. Phase 0
 * shipped Auth + Content (read-only). The content-authoring-backend phase
 * added Packages (Content Author's authoring/draft/submit workflow) and
 * Review (Content Reviewer's request-changes/approve/publish workflow).
 * Submissions (AI Exercise Evaluation Slice 1) adds the first Student-facing
 * write path: real, backend-persisted Exercise submissions. Evaluation
 * (Slice 2.1) adds the evaluation lifecycle behind a deterministic fake
 * evaluator, proving the architecture before any real AI provider (2.3).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ContentModule,
    PackagesModule,
    ReviewModule,
    SubmissionsModule,
    EvaluationModule,
  ],
})
export class AppModule {}
