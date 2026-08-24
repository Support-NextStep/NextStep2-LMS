import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { COURSE, STUDENT } from "../data/mock";
import { useCourseData } from "../data/progress";
import { ADMIN_STUDENT_ID, getAllStudentIds } from "../data/adminStudents";

type StudentRow = {
  id: string;
  name: string;
  /** Not tracked anywhere in this prototype — see BACKEND DATA REQUIREMENT in the final report. */
  email: string | null;
  courseTitle: string;
  progressPercent: number;
  averageScore: number | null;
  lastActivityAt: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-medium text-navy-500/60">{percent}%</span>
    </div>
  );
}

function StudentCard({ student }: { student: StudentRow }) {
  return (
    <Link
      to={`/admin/students/${student.id}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-semibold text-navy-500">{student.name}</p>
        <p className="mt-0.5 text-sm text-navy-500/50">{student.email ?? "Email not available"}</p>
        <p className="mt-1 text-xs text-navy-500/45">{student.courseTitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:shrink-0">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Progress</p>
          <div className="mt-1">
            <ProgressBar percent={student.progressPercent} />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Performance</p>
          <p className={`mt-1 text-sm font-semibold ${student.averageScore !== null ? "text-brand-500" : "text-navy-500/40"}`}>
            {student.averageScore !== null ? `${student.averageScore}%` : "Not scored yet"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Last Activity</p>
          <p className="mt-1 text-sm font-medium text-navy-500">
            {student.lastActivityAt ? formatDate(student.lastActivityAt) : "No activity yet"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function AdminStudents() {
  const { account, checked } = useRequireAdminAccount();
  const { courseProgress, performanceRecords, getCoursePerformance } = useCourseData();
  const [query, setQuery] = useState("");

  const allStudents: StudentRow[] = useMemo(() => {
    // This prototype tracks exactly one implicit student per browser — see
    // adminStudents.ts. Every id it returns maps to the same real data
    // (progress.tsx / performance.ts), since there's no per-student storage
    // scoping yet.
    return getAllStudentIds().map((id) => {
      const lastActivityAt =
        performanceRecords.length > 0
          ? performanceRecords.reduce((latest, r) => (r.completedAt > latest ? r.completedAt : latest), performanceRecords[0].completedAt)
          : null;

      return {
        id,
        name: id === ADMIN_STUDENT_ID ? STUDENT.name : id,
        email: null,
        courseTitle: COURSE.title,
        progressPercent: courseProgress.courseProgressPercent,
        averageScore: getCoursePerformance().averageScore,
        lastActivityAt,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseProgress, performanceRecords]);

  if (!checked || !account) return null;

  const filtered = allStudents.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q);
  });

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-500">Students</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">See every student and their learning/performance status.</p>

        <div className="mt-6 max-w-sm">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students..."
            aria-label="Search students"
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          />
        </div>

        <div className="mt-6">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No students found.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">Try a different name or email.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((student) => (
                <StudentCard key={student.id} student={student} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
