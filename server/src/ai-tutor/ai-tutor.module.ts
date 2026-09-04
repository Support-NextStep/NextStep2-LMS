import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorConfig } from './ai-tutor-config';
import { AiTutorLimiterService } from './ai-tutor-limiter.service';
import { AiTutorMetricsService } from './ai-tutor-metrics.service';

/**
 * AI Need Help / AI Tutor — Day 3. Deliberately its own module, not folded
 * into EvaluationModule or ContentModule: it depends on ContentModule (reuses
 * the canonical published-content resolution) but is logically a separate
 * feature from both exercise evaluation (different job entirely — tutoring,
 * not grading; no queue, no persistence, no retries) and content management
 * (a consumer of published content, not a manager of it).
 */
@Module({
  imports: [AuthModule, ContentModule], // AuthModule for JwtAuthGuard's injected JwtService; ContentModule for ContentService
  controllers: [AiTutorController],
  providers: [AiTutorService, AiTutorConfig, AiTutorLimiterService, AiTutorMetricsService],
  exports: [AiTutorMetricsService, AiTutorLimiterService], // observability (Day 4 Task 15) — allows a future lightweight ops endpoint to read snapshots without duplicating state
})
export class AiTutorModule {}
