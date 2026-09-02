import { Link } from "react-router-dom";
import StudentLayout from "../components/StudentLayout";
import Button from "../components/Button";
import { COURSE, type Subject, type SubjectStatus } from "../data/mock";
import { useCourseData } from "../data/progress";

const STATUS_STYLES: Record<SubjectStatus, { label: string; badgeClass: string; numberClass: string }> = {
  completed: {
    label: "Completed",
    badgeClass: "bg-brand-50 text-brand-600",
    numberClass: "bg-brand-500 text-white",
  },
  "in-progress": {
    label: "In Progress",
    badgeClass: "bg-brand-500 text-white",
    numberClass: "bg-brand-500 text-white",
  },
  available: {
    label: "Available",
    badgeClass: "bg-slate-100 text-navy-500/70",
    numberClass: "bg-slate-100 text-navy-500/70",
  },
  locked: {
    label: "Locked",
    badgeClass: "bg-slate-100 text-navy-500/40",
    numberClass: "bg-slate-100 text-navy-500/40",
  },
};

const ACTION_LABEL: Record<SubjectStatus, string> = {
  completed: "Review Subject",
  "in-progress": "Continue Learning",
  available: "Start Subject",
  locked: "Locked",
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SubjectCard({ subject, index }: { subject: Subject; index: number }) {
  const status = STATUS_STYLES[subject.status];
  const locked = subject.status === "locked";

  return (
    <div
      className={`flex h-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6 ${locked ? "opacity-60" : ""
        }`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${status.numberClass}`}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.badgeClass}`}>
          {status.label}
        </span>
      </div>

      <div className="flex-1">
        <p className="font-semibold text-navy-500">{subject.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-navy-500/60">{subject.description}</p>
      </div>

      {subject.status === "in-progress" && typeof subject.progress === "number" && (
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-navy-500/60">Progress</span>
            <span className="font-semibold text-brand-500">{subject.progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${subject.progress}%` }} />
          </div>
        </div>
      )}

      {subject.status === "completed" && (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600">
          <CheckIcon className="h-3.5 w-3.5" />
          Subject completed
        </p>
      )}

      {locked ? (
        <Button type="button" variant="secondary" disabled>
          {ACTION_LABEL[subject.status]}
        </Button>
      ) : (
        <Link to={`/my-course/subject/${subject.id}`}>
          <Button type="button" variant={subject.status === "in-progress" ? "primary" : "secondary"}>
            {ACTION_LABEL[subject.status]}
          </Button>
        </Link>
      )}
    </div>
  );
}

export default function MyCourse() {
  const { subjects, courseProgress } = useCourseData();
  const { completedSubjects, totalSubjects, courseProgressPercent } = courseProgress;
  const inProgressSubject = subjects.find((s) => s.status === "in-progress");

  return (
    <StudentLayout>
      <div className="mx-auto flex  flex-col gap-8">
        {/* Heading */}
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-navy-500 sm:text-3xl">My Course</h1>
          <p className="mt-1.5 text-[15px] text-navy-500/60">
            Continue your learning journey and work through your subjects.
          </p>
        </div>

        {/* Course overview */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-l-4 border-brand-500 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
                  Enrolled Course
                </p>
                <h2 className="mt-2 text-xl font-bold text-navy-500 sm:text-2xl">{COURSE.title}</h2>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-navy-500/60">
                  {COURSE.description}
                </p>
              </div>

              {inProgressSubject && (
                <div className="w-full shrink-0 lg:w-64">
                  <Link to={`/my-course/subject/${inProgressSubject.id}`}>
                    <Button type="button" className="py-3">
                      Continue Learning
                    </Button>
                  </Link>
                </div>
              )}
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

        {/* Subjects */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-navy-500">Your Subjects</h2>
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
