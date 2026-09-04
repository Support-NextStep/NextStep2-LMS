import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

/**
 * Admin-only operational read endpoints — real student roster/detail,
 * replacing the frontend's previous mock (getAllStudentIds()) and
 * localStorage-only (getAllSubmissions()) data sources. Every route here is
 * read-only and ADMIN-only: this backend already has separate, correctly
 * role-gated write paths for Author (packages.controller.ts) and Reviewer
 * (review.controller.ts) — Admin never needs, and does not get, write
 * access through this controller.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('students')
  listStudents() {
    return this.adminService.listStudents();
  }

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getStudentCounts();
  }

  @Get('students/:studentId')
  getStudentDetail(@Param('studentId') studentId: string) {
    return this.adminService.getStudentDetail(studentId);
  }
}
