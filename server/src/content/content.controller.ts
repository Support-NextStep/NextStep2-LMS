import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ContentService } from './content.service';

/**
 * The GET routes here are public (no guard) — deliberately, matching
 * current frontend behavior exactly: curriculum structure and published
 * content have no access gate anywhere in the Student app today (see
 * NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md's cross-cutting
 * finding), and this phase does not add new gating to previously ungated
 * Student routes. The "student cannot access draft/approved/
 * changes_requested content" security rule is satisfied structurally by
 * ContentService.getPublishedContentForSession() — it is physically
 * incapable of returning anything but currently-published content,
 * regardless of who is asking or whether they're authenticated at all.
 *
 * The POST (create-structure) routes are NOT public — they were added
 * without a guard in an earlier pass and are fixed here: creating a
 * course/subject/session is an authoring action, gated the same way every
 * other authoring write in this backend is (CONTENT_AUTHOR or ADMIN,
 * verified server-side from the JWT, never a client-supplied role).
 */
@Controller()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('courses')
  listCourses() {
    return this.contentService.listCourses();
  }

  @Post('courses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CONTENT_AUTHOR, Role.ADMIN)
  createCourse(@Body() body: { title: string; description: string }) {
    return this.contentService.createCourse(body.title, body.description);
  }

  @Get('courses/:courseId/subjects')
  listSubjects(@Param('courseId') courseId: string) {
    return this.contentService.getSubjectsForCourse(courseId);
  }

  @Post('courses/:courseId/subjects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CONTENT_AUTHOR, Role.ADMIN)
  createSubject(@Param('courseId') courseId: string, @Body() body: { title: string; description: string }) {
    return this.contentService.createSubject(courseId, body.title, body.description);
  }

  @Get('subjects/:subjectId')
  async getSubject(@Param('subjectId') subjectId: string) {
    const subject = await this.contentService.getSubject(subjectId);
    if (!subject) throw new NotFoundException('Subject not found.');
    return subject;
  }

  @Get('subjects/:subjectId/sessions')
  listSessions(@Param('subjectId') subjectId: string) {
    return this.contentService.listSessionsForSubject(subjectId);
  }

  @Post('subjects/:subjectId/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CONTENT_AUTHOR, Role.ADMIN)
  createSession(@Param('subjectId') subjectId: string, @Body() body: { title: string; description: string }) {
    return this.contentService.createSession(subjectId, body.title, body.description);
  }

  /** Returns 404 when nothing is currently published — the frontend adapter treats that as "no override," not an error, and falls through to its existing curated/generated fallback. */
  @Get('sessions/:sessionId/content')
  @HttpCode(HttpStatus.OK)
  async getSessionContent(@Param('sessionId') sessionId: string) {
    const content = await this.contentService.getPublishedContentForSession(sessionId);
    if (!content) throw new NotFoundException('No published content for this session.');
    return content;
  }
}
