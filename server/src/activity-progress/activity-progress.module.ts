import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityProgressController } from './activity-progress.controller';
import { ActivityProgressService } from './activity-progress.service';

@Module({
  imports: [AuthModule], // for JwtAuthGuard's injected JwtService
  controllers: [ActivityProgressController],
  providers: [ActivityProgressService],
})
export class ActivityProgressModule {}
