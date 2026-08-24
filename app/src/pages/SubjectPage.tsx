import { Link, useParams } from "react-router-dom";
import StudentLayout from "../components/StudentLayout";
import Button from "../components/Button";
import type { Session, SessionStatus } from "../data/mock";
import { useCourseData } from "../data/progress";
import { getSessionDelivery } from "../data/sessionContent";

const STATUS_STYLES: Record<SessionStatus, { label: string; badgeClass: string; numberClass: string }> = {
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
};

const ACTION_LABEL: Record<SessionStatus, string> = {
  completed: "Review Session",
  "in-progress": "Continue Session",
  available: "Start Session",
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function formatScheduledAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SessionRow({ session, index }: { session: Session; index: number }) {
  const status = STATUS_STYLES[session.status];
  const current = session.status === "in-progress";
  const delivery = getSessionDelivery(session.id);
  const isLive = delivery?.format === "live";

  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6 ${
        current ? "border-brand-200 bg-brand-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-4 sm:flex-1 sm:items-center">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${status.numberClass}`}
        >
          {session.status === "completed" ? (
            <CheckIcon className="h-4 w-4" />
          ) : (
            String(index + 1).padStart(2, "0")
          )}
        </span>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-navy-500">{session.title}</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.badgeClass}`}>
              {status.label}
            </span>
            {current && (
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                Current
              </span>
            )}
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-0.5 text-xs font-semibold text-error">
                <span className="h-1.5 w-1.5 rounded-full bg-error" />
                Live
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-navy-500/60">{session.description}</p>
          {isLive && delivery?.scheduledAt && (
            <p className="mt-1 text-xs font-medium text-navy-500/45">{formatScheduledAt(delivery.scheduledAt)}</p>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 sm:w-48">
        <Link to={`/session/${session.id}`}>
          <Button type="button" variant={current ? "primary" : "secondary"}>
            {ACTION_LABEL[session.status]}
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { subjects, getSubjectDetail } = useCourseData();
  const subject = subjects.find((s) => s.id === subjectId);

  if (!subject) {
    return (
      <StudentLayout>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 py-16 text-center">
          <h1 className="text-xl font-semibold text-navy-500">Subject not found</h1>
          <Link to="/my-course" className="text-sm font-semibold text-brand-500 hover:text-brand-600">
            Back to My Course
          </Link>
        </div>
      </StudentLayout>
    );
  }

  const detail = getSubjectDetail(subject);
  const totalSessions = detail.sessions.length;
  const inProgressIndex = detail.sessions.findIndex((s) => s.status === "in-progress");
  const firstAvailableIndex = detail.sessions.findIndex((s) => s.status === "available");
  const currentSessionNumber =
    inProgressIndex >= 0 ? inProgressIndex + 1 : firstAvailableIndex >= 0 ? firstAvailableIndex + 1 : totalSessions;

  return (
    <StudentLayout>
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-navy-500 sm:text-3xl">
            {subject.title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[15px] text-navy-500/60">{detail.subtitle}</p>

          <div className="mt-6 max-w-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-navy-500">Subject Progress</span>
              <span className="font-semibold text-brand-500">{detail.progress}%</span>
            </div>
            <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${detail.progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-navy-500/50">
              Session {currentSessionNumber} of {totalSessions}
            </p>
          </div>
        </div>

        {/* Sessions */}
        <section>
          <h2 className="text-lg font-bold text-navy-500">Sessions</h2>
          <div className="mt-5 flex flex-col gap-4">
            {detail.sessions.map((session, index) => (
              <SessionRow key={session.id} session={session} index={index} />
            ))}
          </div>
        </section>

        {/* Bottom navigation */}
        <div>
          <Link to="/my-course" className="text-sm font-semibold text-brand-500 hover:text-brand-600">
            &larr; Back to My Course
          </Link>
        </div>
      </div>
    </StudentLayout>
  );
}
