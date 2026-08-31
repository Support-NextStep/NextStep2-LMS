import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';

/**
 * Author-facing package operations. Every route requires a verified
 * CONTENT_AUTHOR session; ownership (not just role) is re-checked inside
 * PackagesService for every read/write on a specific package id — a
 * CONTENT_AUTHOR token alone is never enough to touch someone else's
 * package.
 */
@Controller('packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  @Roles(Role.CONTENT_AUTHOR)
  create(@Body() dto: CreatePackageDto, @CurrentUser() user: JwtPayload) {
    return this.packagesService.createPackage(dto.sessionId, user.sub);
  }

  @Put(':id/draft')
  @Roles(Role.CONTENT_AUTHOR)
  saveDraft(@Param('id') id: string, @Body() draftContent: unknown, @CurrentUser() user: JwtPayload) {
    return this.packagesService.saveDraft(id, user.sub, draftContent);
  }

  @Get('mine')
  @Roles(Role.CONTENT_AUTHOR)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.packagesService.listMine(user.sub);
  }

  @Get(':id')
  @Roles(Role.CONTENT_AUTHOR, Role.CONTENT_REVIEWER, Role.ADMIN)
  getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.packagesService.getPackage(id, user);
  }

  @Post(':id/submit')
  @Roles(Role.CONTENT_AUTHOR)
  submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.packagesService.submit(id, user.sub);
  }
}
