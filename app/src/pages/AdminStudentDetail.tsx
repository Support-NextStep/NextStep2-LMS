import { useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackLink from "../components/BackLink";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { COURSE, STUDENT } from "../data/mock";
import { useCourseData } from "../data/progress";
import { ADMIN_STUDENT_ID } from "../data/adminStudents";
import { loadPortfolio } from "../data/portfolio";
import { getAllSubmissions } from "../data/exerciseSubmissions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">{label}</p>
      <p className="mt-1 text-sm font-medium text-navy-500">{value}</p>
    </div>
  );
}

export default function AdminStudentDetail() {
  const { account, checked } = useRequireAdminAccount();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const { subjects, courseProgress, currentSession, performanceRecords, getSubjectDetail, getCoursePerformance, getSessionContext } =
    useCourseData();

  if (!checked || !account) return null;

  const isKnownStudent = studentId === ADMIN_STUDENT_ID;

  if (!isKnownStudent) {
    return (
      <AdminLayout adminName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">Student not found.</p>
          <div className="mt-4 flex justify-center">
            <BackLink to="/admin/students" label="Back to Students" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  const totalSessionsCompleted = subjects.reduce(
    (sum, subject) => sum + getSubjectDetail(subject).sessions.filter((s) => s.status === "completed").length,
    0
  );
  const totalSessions = subjects.reduce((sum, subject) => sum + getSubjectDetail(subject).sessions.length, 0);

  const lastActivityAt =
    performanceRecords.length > 0
      ? performanceRecords.reduce((latest, r) => (r.completedAt > latest ? r.completedAt : latest), performanceRecords[0].completedAt)
      : null;

  const coursePerformance = getCoursePerformance();
  const sortedRecords = [...performanceRecords].sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  // NOTE (Real Student Identity slice): this whole page remains the
  // pre-existing, disconnected "Admin views the one demo student" prototype
  // — it has no real per-student backend data source at all (see
  // getAllSubmissions()'s own localStorage-only module and ADMIN_STUDENT_ID's
  // doc comment). Passing ADMIN_STUDENT_ID here only keeps this call
  // type-correct after loadPortfolio() started requiring a stable id
  // alongside the display name — it does not make this page real. See this
  // slice's final report for why fixing that is out of scope here.
  const portfolio = loadPortfolio(ADMIN_STUDENT_ID, STUDENT.name);
  const submissions = getAllSubmissions();

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <BackLink to="/admin/students" label="Back to Students" />

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-500">{STUDENT.name}</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">Read-only student overview.</p>

        <div className="mt-6 flex flex-col gap-6">
          {/* Profile */}
          <SectionCard title="Student Profile">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="Name" value={STUDENT.name} />
              <Field label="Email" value="Not available" />
              <Field label="Course" value={COURSE.title} />
              <Field label="Joined" value="Not available" />
            </div>
          </SectionCard>

          {/* Learning */}
          <SectionCard title="Learning">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="Overall Progress" value={`${courseProgress.courseProgressPercent}%`} />
              <Field label="Sessions Completed" value={`${totalSessionsCompleted} of ${totalSessions}`} />
              <Field
                label="Current Session"
                value={currentSession ? `${currentSession.session.title}` : totalSessionsCompleted > 0 ? "Course complete" : "Not started yet"}
              />
              <Field label="Last Activity" value={lastActivityAt ? formatDate(lastActivityAt) : "No activity yet"} />
            </div>
          </SectionCard>

          {/* Performance */}
          <SectionCard title="Performance">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="Average Score" value={coursePerformance.averageScore !== null ? `${coursePerformance.averageScore}%` : "Not scored yet"} />
              <Field label="Scored Sessions" value={coursePerformance.scoredSessionCount} />
              <Field label="Exercise Submissions" value={submissions.length} />
              <Field label="Sessions Completed" value={coursePerformance.sessionsCompleted} />
            </div>

            {sortedRecords.length > 0 ? (
              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Session performance</p>
                {sortedRecords.slice(0, 6).map((record) => {
                  const context = getSessionContext(record.sessionId);
                  return (
                    <div key={record.sessionId} className="flex items-center justify-between text-sm">
                      <span className="truncate text-navy-500/80">{context?.session.title ?? record.sessionId}</span>
                      <span className={`shrink-0 font-medium ${record.score !== null ? "text-brand-500" : "text-navy-500/40"}`}>
                        {record.score !== null ? `${record.score}%` : "Not scored"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 border-t border-slate-100 pt-5 text-sm text-navy-500/50">No session performance recorded yet.</p>
            )}

            {submissions.length > 0 && (
              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Recent exercise submissions</p>
                {submissions.slice(0, 5).map((submission) => (
                  <div key={submission.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-navy-500/80">
                      {submission.sessionId} &middot; Attempt #{submission.attemptNumber}
                    </span>
                    <span className="shrink-0 text-xs text-navy-500/40">{formatDateTime(submission.submittedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Portfolio */}
          <SectionCard title="Portfolio">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Projects</p>
                {portfolio.projects.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {portfolio.projects.map((p) => (
                      <li key={p.id} className="text-sm text-navy-500/80">
                        {p.title || "Untitled project"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-navy-500/50">No projects added yet.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Skills</p>
                {portfolio.skills.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {portfolio.skills.flatMap((g) => g.skills).map((skill) => (
                      <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-navy-500/70">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-navy-500/50">No skills added yet.</p>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </AdminLayout>
  );
}
