import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { fetchAdminStudents, type AdminStudentSummary } from "../data/adminApi";
import { ApiError } from "../data/apiClient";
import { getSubjects, getSubjectDetail } from "../data/mock";

/** Total real sessions across the (backend-refreshed) course catalog — used only to turn a real sessionsCompleted count into a percent for the existing ProgressBar, never a per-student figure of its own. */
function totalRealSessionCount(): number {
  const subjects = getSubjects(new Set());
  return subjects.reduce((sum, subject) => sum + getSubjectDetail(subject, new Set()).sessions.length, 0);
}

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

function StudentCard({ student, totalSessions }: { student: AdminStudentSummary; totalSessions: number }) {
  const progressPercent = totalSessions === 0 ? 0 : Math.round((student.sessionsCompleted / totalSessions) * 100);
  return (
    <Link
      to={`/admin/students/${student.id}`}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-semibold text-navy-500">{student.name}</p>
        <p className="mt-0.5 text-sm text-navy-500/50">{student.email}</p>
        <p className="mt-1 text-xs text-navy-500/45">Joined {formatDate(student.createdAt)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:shrink-0">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Progress</p>
          <div className="mt-1">
            <ProgressBar percent={progressPercent} />
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
  const [students, setStudents] = useState<AdminStudentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const real = await fetchAdminStudents();
        if (!cancelled) setStudents(real);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load students.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!students) return [];
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, query]);

  const totalSessions = useMemo(() => totalRealSessionCount(), []);

  if (!checked || !account) return null;

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
          {error ? (
            <div className="rounded-xl border border-error/20 bg-error/5 px-6 py-12 text-center">
              <p className="font-medium text-error">Could not load students.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">{error}</p>
            </div>
          ) : students === null ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="text-sm text-navy-500/50">Loading students&hellip;</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-navy-500">No students found.</p>
              <p className="mt-1.5 text-sm text-navy-500/60">Try a different name or email.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((student) => (
                <StudentCard key={student.id} student={student} totalSessions={totalSessions} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
