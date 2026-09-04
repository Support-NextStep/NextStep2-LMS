import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import BackLink from "../components/BackLink";
import { useRequireAdminAccount } from "../hooks/useRequireAdminAccount";
import { COURSE, getSubjects, getSubjectDetail } from "../data/mock";
import { fetchAdminStudentDetail, type AdminStudentDetail as AdminStudentDetailData } from "../data/adminApi";
import { ApiError } from "../data/apiClient";
import { loadPortfolio } from "../data/portfolio";

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

/** Real total session count + "first not-yet-completed session" for THIS student's own real completed set — same catalog-order logic Student's own Dashboard uses (mock.ts's getSubjects/getSubjectDetail), just applied to an arbitrary student's real completed-session ids instead of the current browser's own. */
function currentSessionTitle(completedSessionIds: ReadonlySet<string>): string | null {
  const subjects = getSubjects(completedSessionIds);
  for (const subject of subjects) {
    const detail = getSubjectDetail(subject, completedSessionIds);
    const next = detail.sessions.find((s) => s.status !== "completed");
    if (next) return next.title;
  }
  return null;
}

function totalRealSessionCount(): number {
  const subjects = getSubjects(new Set());
  return subjects.reduce((sum, subject) => sum + getSubjectDetail(subject, new Set()).sessions.length, 0);
}

export default function AdminStudentDetail() {
  const { account, checked } = useRequireAdminAccount();
  const { studentId = "" } = useParams<{ studentId: string }>();
  const [detail, setDetail] = useState<AdminStudentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    (async () => {
      try {
        const real = await fetchAdminStudentDetail(studentId);
        if (!cancelled) setDetail(real);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this student.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!checked || !account) return null;

  if (error) {
    return (
      <AdminLayout adminName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">{error}</p>
          <div className="mt-4 flex justify-center">
            <BackLink to="/admin/students" label="Back to Students" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!detail) {
    return (
      <AdminLayout adminName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="text-sm text-navy-500/50">Loading student&hellip;</p>
        </div>
      </AdminLayout>
    );
  }

  const completedSessionIds = new Set(detail.sessionProgress.map((p) => p.sessionId));
  const totalSessions = totalRealSessionCount();
  const overallProgressPercent = totalSessions === 0 ? 0 : Math.round((detail.sessionProgress.length / totalSessions) * 100);
  const currentSession = currentSessionTitle(completedSessionIds);

  const evaluatedSubmissions = detail.submissions.filter((s) => s.evaluation?.status === "EVALUATED" && s.evaluation.overallScore !== null);
  const averageScore =
    evaluatedSubmissions.length > 0
      ? Math.round(evaluatedSubmissions.reduce((sum, s) => sum + (s.evaluation!.overallScore ?? 0), 0) / evaluatedSubmissions.length)
      : null;
  const lastActivityAt = [
    ...detail.sessionProgress.map((p) => p.completedAt),
    ...detail.activityProgress.map((p) => p.completedAt),
    ...detail.submissions.map((s) => s.submittedAt),
  ].sort()
    .at(-1) ?? null;

  // Portfolio remains the pre-existing, localStorage-only prototype (see Day
  // 6 audit) — out of today's Admin-completion scope. Passing the real
  // student's real id/name at least scopes the lookup correctly (it will
  // legitimately show empty for any real student, since nothing has ever
  // written portfolio data under a real backend id on THIS browser) rather
  // than reading the old fake ADMIN_STUDENT_ID.
  const portfolio = loadPortfolio(detail.id, detail.name);

  return (
    <AdminLayout adminName={account.name}>
      <div>
        <BackLink to="/admin/students" label="Back to Students" />

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-500">{detail.name}</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">Read-only student overview.</p>

        <div className="mt-6 flex flex-col gap-6">
          {/* Profile */}
          <SectionCard title="Student Profile">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="Name" value={detail.name} />
              <Field label="Email" value={detail.email} />
              <Field label="Course" value={COURSE.title || "Not available"} />
              <Field label="Joined" value={formatDate(detail.createdAt)} />
            </div>
          </SectionCard>

          {/* Learning */}
          <SectionCard title="Learning">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="Overall Progress" value={`${overallProgressPercent}%`} />
              <Field label="Sessions Completed" value={`${detail.sessionProgress.length} of ${totalSessions}`} />
              <Field
                label="Current Session"
                value={currentSession ?? (detail.sessionProgress.length > 0 ? "Course complete" : "Not started yet")}
              />
              <Field label="Last Activity" value={lastActivityAt ? formatDate(lastActivityAt) : "No activity yet"} />
            </div>
          </SectionCard>

          {/* Performance */}
          <SectionCard title="Performance">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Field label="Average Score" value={averageScore !== null ? `${averageScore}%` : "Not scored yet"} />
              <Field label="Scored Sessions" value={new Set(evaluatedSubmissions.map((s) => s.sessionId)).size} />
              <Field label="Exercise Submissions" value={detail.submissions.length} />
              <Field label="Sessions Completed" value={detail.sessionProgress.length} />
            </div>

            {evaluatedSubmissions.length > 0 ? (
              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Session performance</p>
                {evaluatedSubmissions.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-navy-500/80">{s.sessionTitle}</span>
                    <span className="shrink-0 font-medium text-brand-500">{s.evaluation!.overallScore}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 border-t border-slate-100 pt-5 text-sm text-navy-500/50">No session performance recorded yet.</p>
            )}

            {detail.submissions.length > 0 && (
              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500/40">Recent exercise submissions</p>
                {detail.submissions.slice(0, 5).map((submission) => (
                  <div key={submission.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-navy-500/80">
                      {submission.sessionTitle} &middot; Attempt #{submission.attemptNumber}
                      {submission.evaluation && (
                        <span className="ml-2 text-xs text-navy-500/40">
                          {submission.evaluation.status === "EVALUATED"
                            ? `${submission.evaluation.overallScore}/100`
                            : submission.evaluation.status}
                        </span>
                      )}
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
