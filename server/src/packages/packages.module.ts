import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [AuthModule], // for JwtAuthGuard's injected JwtService
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
