import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [AuthModule], // for JwtAuthGuard's injected JwtService
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
