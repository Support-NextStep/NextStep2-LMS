import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import StudentLayout from "../components/StudentLayout";
import Button from "../components/Button";
import { COURSE, type Subject, type SubjectStatus } from "../data/mock";
import { useCourseData } from "../data/progress";

const STATUS_STYLES: Record<
  SubjectStatus,
  { label: string; badgeClass: string; numberClass: string; icon: ReactElement }
> = {
  completed: {
    label: "Completed",
    badgeClass: "bg-brand-50 text-brand-600",
    numberClass: "bg-brand-500 text-white",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    ),
  },
  "in-progress": {
    label: "In Progress",
    badgeClass: "bg-brand-500 text-white",
    numberClass: "bg-brand-500 text-white",
    icon: <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />,
  },
  available: {
    label: "Available",
    badgeClass: "bg-slate-100 text-navy-500/70",
    numberClass: "bg-slate-100 text-navy-500/70",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 10.5V7.125a3.75 3.75 0 117.5 0V10.5m-9-.75h10.5A1.5 1.5 0 0118.75 11.25v6.375A1.5 1.5 0 0117.25 19.5H6.75a1.5 1.5 0 01-1.5-1.5V11.25a1.5 1.5 0 011.5-1.5z"
      />
    ),
  },
  locked: {
    label: "Locked",
    badgeClass: "bg-slate-100 text-navy-500/40",
    numberClass: "bg-slate-100 text-navy-500/40",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    ),
  },
};

function SubjectCard({ subject, index }: { subject: Subject; index: number }) {
  const status = STATUS_STYLES[subject.status];
  const locked = subject.status === "locked";

  const card = (
    <div
      className={`flex h-full flex-col gap-4 rounded-xl border bg-white p-5 transition-all ${
        locked
          ? "border-slate-200 opacity-60"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md hover:shadow-navy-500/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${status.numberClass}`}
        >
          {locked ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
              {status.icon}
            </svg>
          ) : (
            String(index + 1).padStart(2, "0")
          )}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}>
          {subject.status === "in-progress" && (
            <svg viewBox="0 0 24 24" className="h-1.5 w-1.5">
              {status.icon}
            </svg>
          )}
          {status.label}
        </span>
      </div>

      <div>
        <p className="font-semibold text-navy-500">{subject.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-navy-500/60">{subject.description}</p>
      </div>
    </div>
  );

  if (locked) return card;
  return (
    <Link to="/my-course" className="block h-full focus-visible:outline-none">
      {card}
    </Link>
  );
}

export default function Dashboard() {
  const { subjects, courseProgress, currentSession, currentUser } = useCourseData();
  const { completedSubjects, totalSubjects, courseProgressPercent } = courseProgress;
  const hasStarted = subjects.some((s) => s.status === "in-progress" || s.status === "completed");
  // Real Student Identity slice — the authenticated user's real first name
  // (GET /auth/me), never mock.ts's hardcoded STUDENT. Blank while loading
  // or logged out rather than ever showing a fabricated name.
  const firstName = currentUser?.name.split(" ")[0] ?? "";

  return (
    <StudentLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {/* 1. Welcome */}
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-navy-500 sm:text-3xl">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1.5 text-[15px] text-navy-500/60">Continue your learning journey.</p>
        </div>

        {/* 2. Current course */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-l-4 border-brand-500 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
                  Current Course
                </p>
                <h2 className="mt-2 text-xl font-bold text-navy-500 sm:text-2xl">{COURSE.title}</h2>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-navy-500/60">
                  {COURSE.description}
                </p>
              </div>

              <div className="w-full shrink-0 lg:w-64">
                <Link to="/my-course">
                  <Button type="button" className="py-3">
                    Continue Learning
                  </Button>
                </Link>
              </div>
            </div>

            <div className="mt-7 max-w-xl border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-navy-500">Course Progress</span>
                <span className="font-semibold text-brand-500">{courseProgressPercent}%</span>
              </div>
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${courseProgressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-navy-500/50">
                {completedSubjects} of {totalSubjects} subjects completed
              </p>
            </div>
          </div>
        </section>

        {/* 3. Continue learning — most important action */}
        <section className="rounded-2xl bg-navy-500 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {currentSession ? (
              <>
                <div>
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-brand-300">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Continue Learning
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white/70">{currentSession.subject.title}</h2>
                  <p className="mt-1 text-xl font-bold text-white sm:text-2xl">{currentSession.session.title}</p>
                  <p className="mt-2 max-w-xl text-[15px] text-white/60">{currentSession.session.description}</p>
                </div>
                <div className="w-full shrink-0 lg:w-56">
                  <Link to="/my-course">
                    <Button type="button" className="py-3 text-base">
                      Resume Session
                    </Button>
                  </Link>
                </div>
              </>
            ) : hasStarted ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">
                    Course Complete
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
                    You&apos;ve completed every subject. Nice work!
                  </h2>
                </div>
                <div className="w-full shrink-0 lg:w-56">
                  <Link to="/my-course">
                    <Button type="button" className="py-3 text-base">
                      Review My Course
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">
                    Get Started
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
                    Start your first session
                  </h2>
                </div>
                <div className="w-full shrink-0 lg:w-56">
                  <Link to="/my-course">
                    <Button type="button" className="py-3 text-base">
                      Start Learning
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 4. Subjects */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-navy-500">Subjects</h2>
            <span className="text-sm text-navy-500/50">{totalSubjects} total</span>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((subject, index) => (
              <SubjectCard key={subject.id} subject={subject} index={index} />
            ))}
          </div>
        </section>
      </div>
    </StudentLayout>
  );
}
