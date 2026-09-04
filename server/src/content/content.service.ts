import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CourseSummary = { id: string; title: string; description: string };
export type SubjectSummary = { id: string; title: string; description: string };
export type SessionSummary = { id: string; title: string; description: string };

function slugify(text: string): string {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

/**
 * Matches the shape SessionWorkspace.tsx already renders (SessionContent in
 * app/src/data/sessionContent.ts) as closely as possible, so the frontend
 * adapter that calls this endpoint needs the smallest possible reshape
 * before handing the result to existing components — see
 * NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 3 (video/
 * checkpoints/practice/aiHelp/exercise/delivery stay JSON, exactly as
 * authored, unwrapped one level out of the ContentVersion row).
 */
export type PublishedSessionContent = {
  objective: string;
  explanation: string;
  concepts: string[];
  keyConcepts: string[];
  examples: string[];
  video: unknown;
  checkpoints: unknown;
  practice: unknown;
  aiHelp: unknown;
  exercise: unknown;
  requiredActivities: string[];
  projectConnection: string | null;
  delivery: unknown;
};

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async listCourses(): Promise<CourseSummary[]> {
    const courses = await this.prisma.course.findMany({ orderBy: { id: 'asc' } });
    return courses.map((c) => ({ id: c.id, title: c.title, description: c.description }));
  }

  async createCourse(title: string, description: string): Promise<CourseSummary> {
    const id = slugify(title) || 'course-' + Date.now();
    const course = await this.prisma.course.create({
      data: { id, title, description },
    });
    return { id: course.id, title: course.title, description: course.description };
  }

  async getSubjectsForCourse(courseId: string): Promise<SubjectSummary[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
    return subjects.map((s) => ({ id: s.id, title: s.title, description: s.description }));
  }

  async createSubject(courseId: string, title: string, description: string): Promise<SubjectSummary> {
    const id = slugify(title) || 'subject-' + Date.now();
    const existing = await this.prisma.subject.findMany({ where: { courseId }, orderBy: { order: 'desc' }, take: 1 });
    const order = existing.length > 0 ? existing[0].order + 1 : 1;
    const subject = await this.prisma.subject.create({
      data: { id, courseId, title, description, order },
    });
    return { id: subject.id, title: subject.title, description: subject.description };
  }

  async getSubject(subjectId: string): Promise<SubjectSummary | null> {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    return subject ? { id: subject.id, title: subject.title, description: subject.description } : null;
  }

  async listSessionsForSubject(subjectId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { subjectId },
      orderBy: { order: 'asc' },
    });
    return sessions.map((s) => ({ id: s.id, title: s.title, description: s.description }));
  }

  async createSession(subjectId: string, title: string, description: string): Promise<SessionSummary> {
    const id = slugify(title) || 'session-' + Date.now();
    const existing = await this.prisma.session.findMany({ where: { subjectId }, orderBy: { order: 'desc' }, take: 1 });
    const order = existing.length > 0 ? existing[0].order + 1 : 1;
    const session = await this.prisma.session.create({
      data: { id, subjectId, title, description, order },
    });
    return { id: session.id, title: session.title, description: session.description };
  }

  /**
   * THE canonical published-content resolution — per the architecture doc's
   * Part 4/5, this is the ONLY query allowed to answer "what does a student
   * see for this session," and it is deliberately incapable of returning
   * anything else: there is no parameter here for a package id, a version
   * id, a status, or "as of" date. It is always exactly
   *
   *   publications WHERE session_id = :id AND superseded_at IS NULL
   *
   * joined to the one content_version it points at. Returns null when
   * nothing is currently published for this session — the caller (the
   * frontend's existing fallback chain: published -> curated -> generated)
   * decides what that means; this method never fabricates a substitute.
   */
  /**
   * The course/subject/session title+description "breadcrumb" for a
   * session — added for AI Tutor (Day 3), which needs these alongside
   * getPublishedContentForSession() to build lesson context, but has no
   * other reason to join Session -> Subject -> Course. Returns null if the
   * session id doesn't exist at all (same "doesn't exist" contract as
   * getPublishedContentForSession() returning null for "nothing published"
   * — the caller decides what that means).
   */
  async getSessionWithBreadcrumb(
    sessionId: string
  ): Promise<{ title: string; description: string; subjectTitle: string; courseTitle: string } | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { subject: { include: { course: true } } },
    });
    if (!session) return null;
    return {
      title: session.title,
      description: session.description,
      subjectTitle: session.subject.title,
      courseTitle: session.subject.course.title,
    };
  }

  async getPublishedContentForSession(sessionId: string): Promise<PublishedSessionContent | null> {
    const publication = await this.prisma.publication.findFirst({
      where: { sessionId, supersededAt: null },
      include: { contentVersion: true },
    });
    if (!publication) return null;

    const version = publication.contentVersion;
    return {
      objective: version.objective,
      explanation: version.explanation,
      concepts: version.concepts,
      keyConcepts: version.keyConcepts,
      examples: version.examples,
      video: version.video,
      checkpoints: version.checkpoints,
      practice: version.practice,
      aiHelp: version.aiHelp,
      exercise: version.exercise,
      requiredActivities: version.requiredActivities,
      projectConnection: version.projectConnection,
      delivery: version.delivery,
    };
  }
}
