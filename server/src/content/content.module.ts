import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [AuthModule], // for JwtAuthGuard's injected JwtService, used by the now-guarded POST routes
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
