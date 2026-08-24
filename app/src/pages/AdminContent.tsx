import { Link } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { resolveSessionStatuses } from "../data/publishedContent";

type CourseSummary = {
  courseId: string;
  courseTitle: string;
  subjectCount: number;
  sessionCount: number;
  published: number;
  draft: number;
  changesRequested: number;
  approved: number;
};

function StatusPill({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {count} {label}
    </span>
  );
}

function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <Link
      to={`/admin/content/${course.courseId}`}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-200 hover:shadow-sm sm:p-6"
    >
      <div>
        <p className="font-semibold text-navy-500">{course.courseTitle}</p>
        <p className="mt-1 text-sm text-navy-500/50">
          {course.subjectCount} subject{course.subjectCount === 1 ? "" : "s"} &middot; {course.sessionCount} session
          {course.sessionCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusPill label="Published" count={course.published} className="bg-brand-100 text-brand-700" />
        <StatusPill label="Approved" count={course.approved} className="bg-emerald-100 text-emerald-700" />
        <StatusPill label="Changes Requested" count={course.changesRequested} className="bg-amber-100 text-amber-700" />
        <StatusPill label="Draft" count={course.draft} className="bg-slate-100 text-navy-500/60" />
      </div>
    </Link>
  );
}

export default function AdminContent() {
  const { account, checked } = useRequireAdminAccount();
  if (!checked || !account) return null;

  const sessions = resolveSessionStatuses();

  const courseMap = new Map<string, CourseSummary>();
  for (const s of sessions) {
    const existing = courseMap.get(s.courseId) ?? {
      courseId: s.courseId,
      courseTitle: s.courseTitle,
      subjectCount: 0,
      sessionCount: 0,
      published: 0,
      draft: 0,
      changesRequested: 0,
      approved: 0,
    };
    existing.sessionCount += 1;
    if (s.status === "published") existing.published += 1;
    if (s.status === "draft") existing.draft += 1;
    if (s.status === "changes_requested") existing.changesRequested += 1;
    if (s.status === "approved") existing.approved += 1;
    courseMap.set(s.courseId, existing);
  }
  for (const [courseId, summary] of courseMap) {
    summary.subjectCount = new Set(sessions.filter((s) => s.courseId === courseId).map((s) => s.subjectId)).size;
  }
  const courses = [...courseMap.values()].sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">Content</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">
          What content exists and its publication state — read-only. Review, approve, and publish happen in Content
          Manager.
        </p>

        <div className="mt-8">
          {courses.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No content has been imported yet.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">Once Content Manager imports a package, it will show up here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {courses.map((course) => (
                <CourseCard key={course.courseId} course={course} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
