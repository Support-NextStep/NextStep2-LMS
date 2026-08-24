import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import Button from "../components/Button";

// Mock course data — the platform currently enrolls students into one
// flagship program. Replace with a real API call later.
const COURSE = {
  title: "Full-Stack Web Development",
  tag: "Industry Program",
  description:
    "Learn to build and ship real, production-grade web applications — from frontend interfaces to backend APIs — using the same tools and practices used by modern engineering teams.",
  highlights: [
    "Build real projects using industry-standard tools and workflows",
    "Practice hands-on with guided exercises after every lesson",
    "Get assessed and receive feedback on your actual work",
    "Track your performance and improve session by session",
    "Finish with a portfolio that shows what you can actually do",
  ],
};

export default function Enrollment() {
  const navigate = useNavigate();
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  function handleEnroll() {
    setEnrolling(true);
    // Mock enrollment — replace with real API call later.
    setTimeout(() => {
      setEnrolling(false);
      setEnrolled(true);
    }, 700);
  }

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <header className="border-b border-slate-200 bg-white px-6 py-4 sm:px-10">
        <Logo className="h-8" />
      </header>

      <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-12 sm:py-16">
        {!enrolled ? (
          <div className="w-full">
            <p className="text-center text-sm font-medium text-navy-500/50">
              Getting Started
            </p>
            <h1 className="mt-1.5 text-center text-2xl font-semibold text-navy-500 sm:text-3xl">
              Enroll in your course
            </h1>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-navy-500/60">
              Confirm your enrollment to start your learning journey with
              NextStep².
            </p>

            <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-6 sm:p-8">
                <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">
                  {COURSE.tag}
                </span>
                <h2 className="mt-3 text-xl font-semibold text-navy-500 sm:text-2xl">
                  {COURSE.title}
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-navy-500/70">
                  {COURSE.description}
                </p>
              </div>

              <div className="p-6 sm:p-8">
                <p className="text-sm font-semibold text-navy-500">
                  What you&apos;ll learn
                </p>
                <ul className="mt-4 flex flex-col gap-3">
                  {COURSE.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-navy-500/70">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6">
              <Button type="button" onClick={handleEnroll} loading={enrolling}>
                Enroll Now
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-6 rounded-xl border border-slate-200 bg-white p-8 text-center sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                className="h-7 w-7 text-brand-500"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-navy-500">You&apos;re enrolled!</h1>
              <p className="mt-2 text-sm text-navy-500/60">
                You&apos;ve successfully enrolled in{" "}
                <span className="font-medium text-navy-500">{COURSE.title}</span>.
                Let&apos;s get you set up.
              </p>
            </div>
            <Button type="button" onClick={() => navigate("/welcome")}>
              Continue
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
