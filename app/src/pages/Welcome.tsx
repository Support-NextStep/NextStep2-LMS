import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import Button from "../components/Button";
import { COURSE, STUDENT } from "../data/mock";

const JOURNEY = [
  {
    label: "Learn",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.04C10.5 4.9 8.4 4.25 6.5 4.25c-1.02 0-2.02.15-2.95.46a.75.75 0 00-.55.72v11.9a.75.75 0 001 .71c.79-.27 1.63-.4 2.5-.4 1.9 0 4 .65 5.5 1.79m0-13.39c1.5-1.14 3.6-1.79 5.5-1.79 1.02 0 2.02.15 2.95.46a.75.75 0 01.55.72v11.9a.75.75 0 01-1 .71 8.7 8.7 0 00-2.5-.4c-1.9 0-4 .65-5.5 1.79m0-13.39v13.39"
      />
    ),
  },
  {
    label: "Practice",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.53 16.12L3.99 12l5.54-4.12M14.47 7.88L20.01 12l-5.54 4.12"
      />
    ),
  },
  {
    label: "Assessment",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75l2.25 2.25 4.5-4.5m5.25 1.5a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  {
    label: "Exercise",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L21 10.5l-3.75 3.75M6.75 6.75L3 10.5l3.75 3.75M14.25 4.5l-4.5 15"
      />
    ),
  },
  {
    label: "Performance",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.98 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    ),
  },
];

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <header className="border-b border-slate-200 bg-white px-6 py-4 sm:px-10">
        <Logo className="h-8" />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col px-6 py-12 sm:py-20">
        <div className="relative overflow-hidden rounded-2xl bg-navy-500 px-6 py-12 text-center shadow-[0_20px_50px_-20px_rgba(8,36,84,0.45)] sm:px-14 sm:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 15% 15%, rgba(22,103,239,0.35), transparent 45%), radial-gradient(circle at 85% 85%, rgba(22,103,239,0.28), transparent 45%)",
            }}
          />

          <div className="relative flex flex-col items-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white/80">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Enrollment Confirmed
            </span>

            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Welcome, {STUDENT.name}
            </h1>
            <p className="mt-3 text-base text-white/70">
              You&apos;re enrolled in{" "}
              <span className="font-semibold text-white">{COURSE.title}</span>
            </p>

            <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-white/60">
              Your learning journey starts here. Learn industry skills,
              practice what you learn, and build real proof of your skills.
            </p>
          </div>
        </div>

        {/* Learning loop */}
        <div className="mt-12">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-navy-500/40">
            How learning works
          </p>

          <div className="relative mt-8 flex flex-wrap items-start justify-center gap-x-2 gap-y-8 sm:flex-nowrap sm:gap-x-0">
            {JOURNEY.map((step, i) => (
              <div key={step.label} className="relative flex flex-1 flex-col items-center px-2" style={{ minWidth: 84 }}>
                {i < JOURNEY.length - 1 && (
                  <div className="absolute left-1/2 top-6 hidden h-px w-full bg-slate-200 sm:block" />
                )}
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-100 bg-white text-brand-500 shadow-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
                    {step.icon}
                  </svg>
                </div>
                <p className="mt-3 text-sm font-semibold text-navy-500">{step.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mx-auto mt-14 flex w-full max-w-xs flex-col items-center gap-3">
          <Button type="button" onClick={() => navigate("/dashboard")} className="py-3.5 text-base shadow-md shadow-brand-500/20">
            Start Learning
          </Button>
          <p className="text-sm text-navy-500/50">Ready when you are.</p>
        </div>
      </main>
    </div>
  );
}
