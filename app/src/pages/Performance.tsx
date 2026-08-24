import StudentLayout from "../components/StudentLayout";
import { COURSE, type Subject, type SubjectStatus } from "../data/mock";
import { useCourseData } from "../data/progress";

const STATUS_LABEL: Record<SubjectStatus, string> = {
  completed: "Completed",
  "in-progress": "In Progress",
  available: "Available",
  locked: "Locked",
};

const STATUS_BADGE_CLASS: Record<SubjectStatus, string> = {
  completed: "bg-brand-50 text-brand-600",
  "in-progress": "bg-brand-500 text-white",
  available: "bg-slate-100 text-navy-500/70",
  locked: "bg-slate-100 text-navy-500/40",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function SubjectPerformanceCard({
  subject,
  index,
  sessionsCompleted,
  scoredSessionCount,
  averageScore,
}: {
  subject: Subject;
  index: number;
  sessionsCompleted: number;
  scoredSessionCount: number;
  averageScore: number | null;
}) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-navy-500/70">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[subject.status]}`}
        >
          {STATUS_LABEL[subject.status]}
        </span>
      </div>

      <div className="flex-1">
        <p className="font-semibold text-navy-500">{subject.title}</p>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-navy-500/50">Sessions completed</span>
          <span className="font-medium text-navy-500">{sessionsCompleted}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-navy-500/50">Scored sessions</span>
          <span className="font-medium text-navy-500">{scoredSessionCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-navy-500/50">Performance</span>
          <span className={`font-semibold ${averageScore !== null ? "text-brand-500" : "text-navy-500/40"}`}>
            {averageScore !== null ? `${averageScore}%` : "Not scored yet"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Performance() {
  const { subjects, performanceRecords, getSubjectPerformance, getCoursePerformance, getSessionContext } =
    useCourseData();

  const coursePerformance = getCoursePerformance();
  const hasAnyRecords = performanceRecords.length > 0;

  const sortedRecords = [...performanceRecords].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return (
    <StudentLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {/* 1. Header */}
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-navy-500 sm:text-3xl">Performance</h1>
          <p className="mt-1.5 text-[15px] text-navy-500/60">
            Track how you&apos;re performing across your learning journey.
          </p>
        </div>

        {/* 2. Course performance summary */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-l-4 border-brand-500 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
              Course Performance
            </p>
            <h2 className="mt-2 text-xl font-bold text-navy-500 sm:text-2xl">{COURSE.title}</h2>

            {coursePerformance.averageScore !== null ? (
              <div className="mt-6 flex flex-wrap gap-10">
                <div>
                  <p className="text-2xl font-bold text-brand-500">{coursePerformance.averageScore}%</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-navy-500/50">
                    Overall Performance
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-navy-500">{coursePerformance.sessionsCompleted}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-navy-500/50">
                    Sessions Completed
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-navy-500">{coursePerformance.scoredSessionCount}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-navy-500/50">
                    Scored Sessions
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-navy-500">No performance data yet</p>
                <p className="mt-1 text-sm text-navy-500/60">
                  Complete sessions to start building your performance.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 3. Subject performance */}
        <section>
          <h2 className="text-lg font-bold text-navy-500">Subject Performance</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject, index) => {
              const subjectPerformance = getSubjectPerformance(subject.id);
              return (
                <SubjectPerformanceCard
                  key={subject.id}
                  subject={subject}
                  index={index}
                  sessionsCompleted={subjectPerformance.sessionsCompleted}
                  scoredSessionCount={subjectPerformance.scoredSessionCount}
                  averageScore={subjectPerformance.averageScore}
                />
              );
            })}
          </div>
        </section>

        {/* 4. Session performance */}
        <section>
          <h2 className="text-lg font-bold text-navy-500">Session Performance</h2>

          {hasAnyRecords ? (
            <div className="mt-5 flex flex-col gap-4">
              {sortedRecords.map((record) => {
                const sessionContext = getSessionContext(record.sessionId);
                const sessionTitle = sessionContext?.session.title ?? record.sessionId;
                const subjectTitle = sessionContext?.subject.title ?? record.subjectId;

                return (
                  <div
                    key={record.sessionId}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6"
                  >
                    <div>
                      <p className="font-semibold text-navy-500">{sessionTitle}</p>
                      <p className="mt-1 text-sm text-navy-500/60">{subjectTitle}</p>
                    </div>
                    <div className="flex items-center gap-6 sm:shrink-0">
                      <div className="text-right">
                        <p className={`font-semibold ${record.score !== null ? "text-brand-500" : "text-navy-500/40"}`}>
                          {record.score !== null ? `${record.score}%` : "Not scored"}
                        </p>
                        <p className="mt-0.5 text-xs text-navy-500/40">{formatDate(record.completedAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <h3 className="text-lg font-semibold text-navy-500">Your performance will appear here</h3>
              <p className="max-w-sm text-sm text-navy-500/60">
                Complete your learning sessions to start building your performance history.
              </p>
            </div>
          )}
        </section>

        {/* 5. Score explanation */}
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
          <p className="text-sm font-semibold text-navy-500">How your score is calculated</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {[
              "Video Check contributes based on whether your answer was correct.",
              "Practice contributes based on how many checklist items passed.",
              "Learning and Exercise track completion only — they don't add to your score.",
              "AI Help never affects your score. It's there to help you learn.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-navy-500/70">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </StudentLayout>
  );
}
