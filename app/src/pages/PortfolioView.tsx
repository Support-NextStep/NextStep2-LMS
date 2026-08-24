import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { COURSE } from "../data/mock";
import { useCourseData } from "../data/progress";
import {
  DEMO_ACHIEVEMENTS,
  DEMO_CONTACT,
  DEMO_PROFILE,
  DEMO_PROJECTS,
  DEMO_SKILLS,
} from "../data/portfolioDemoContent";

// ---------------------------------------------------------------------------
// This renders a standalone personal portfolio website — not another LMS
// screen. Profile/About/Skills/Projects/Achievements/Contact currently come
// from src/data/portfolioDemoContent.ts (clearly isolated placeholder demo
// content — see that file). Only "Education" below is wired to the
// student's real course data via useCourseData(), the same hook used
// throughout the LMS.
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#skills", label: "Skills" },
  { href: "#projects", label: "Projects" },
  { href: "#education", label: "Education" },
  { href: "#achievements", label: "Achievements" },
  { href: "#contact", label: "Contact" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.94 5a2 2 0 11-4-.002 2 2 0 014 .002zM7 8.48H3V21h4V8.48zM13.32 8.48H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21h3.95v-7.93c0-6.17-7.06-5.94-8.72-2.91l.03-1.68z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.58 2 12.2c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.5v-1.94c-2.78.62-3.37-1.36-3.37-1.36-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.13-4.56-5.03 0-1.11.39-2.02 1.03-2.73-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.04a9.3 9.3 0 015.01 0c1.91-1.32 2.75-1.04 2.75-1.04.55 1.41.2 2.45.1 2.71.64.71 1.03 1.62 1.03 2.73 0 3.91-2.34 4.77-4.57 5.02.36.32.68.94.68 1.9v2.82c0 .28.18.61.69.5C19.14 20.5 22 16.7 22 12.2 22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function DemoLink({ className, children }: { className?: string; children: ReactNode }) {
  // Demo projects/contact don't have real URLs yet — render as a real link
  // element (for styling/semantics) without actually navigating anywhere.
  return (
    <a href="#" onClick={(e) => e.preventDefault()} className={className}>
      {children}
    </a>
  );
}

function SectionHeading({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
  return (
    <div className="text-center">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">{eyebrow}</p>
      )}
      <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-navy-500 sm:text-3xl">{children}</h2>
    </div>
  );
}

export default function PortfolioView() {
  const { subjects, courseProgress } = useCourseData();
  const courseComplete = courseProgress.totalSubjects > 0 && courseProgress.completedSubjects === courseProgress.totalSubjects;

  return (
    <div className="min-h-screen scroll-smooth bg-white">
      {/* NAV — a personal site's own header, not the LMS shell */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4 sm:px-10">
          <span className="text-lg font-bold text-navy-500">{DEMO_PROFILE.name}</span>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm font-medium text-navy-500/60">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-navy-500">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/portfolio" className="text-xs font-medium text-navy-500/35 hover:text-navy-500/70">
              Edit Portfolio
            </Link>
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Contact
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-navy-500">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(22,103,239,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(22,103,239,0.25), transparent 45%)",
          }}
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center sm:py-28">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white ring-1 ring-white/20">
            {initials(DEMO_PROFILE.name)}
          </div>

          <h1 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {DEMO_PROFILE.name}
          </h1>
          <p className="mt-2 text-lg font-medium text-brand-300 sm:text-xl">{DEMO_PROFILE.headline}</p>

          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/60">
            {DEMO_PROFILE.tagline}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#projects"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600"
            >
              View My Work
            </a>
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-6 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/15"
            >
              Contact Me
            </a>
          </div>

          <div className="mt-7 flex items-center gap-4">
            <DemoLink className="text-white/60 transition-colors hover:text-white">
              <GitHubIcon className="h-5 w-5" />
            </DemoLink>
            <DemoLink className="text-white/60 transition-colors hover:text-white">
              <LinkedInIcon className="h-5 w-5" />
            </DemoLink>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <SectionHeading eyebrow="Get to know me">About Me</SectionHeading>
        <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-navy-500/70">
          {DEMO_PROFILE.about}
        </p>
      </section>

      {/* SKILLS */}
      <section id="skills" className="bg-[#f4f7fc] px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <SectionHeading eyebrow="What I work with">Skills</SectionHeading>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_SKILLS.map((group) => (
              <div key={group.category} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">
                  {group.category}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-slate-50 px-3 py-1.5 text-sm font-medium text-navy-500/70"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROJECTS — the main event */}
      <section id="projects" className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <SectionHeading eyebrow="What I've built">Projects</SectionHeading>
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {DEMO_PROJECTS.map((project, index) => (
            <div
              key={project.id}
              className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_4px_16px_rgba(8,36,84,0.06)] transition-transform hover:-translate-y-1"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-brand-500">
                Project {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-lg font-bold text-navy-500">{project.title}</p>
              <p className="flex-1 text-sm leading-relaxed text-navy-500/60">{project.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {project.technologies.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600"
                  >
                    {tech}
                  </span>
                ))}
              </div>

              <div className="mt-1 flex gap-4 border-t border-slate-100 pt-4 text-sm font-semibold">
                <DemoLink className="text-brand-500 hover:text-brand-600">Live Demo &rarr;</DemoLink>
                <DemoLink className="text-navy-500/60 hover:text-navy-500">GitHub &rarr;</DemoLink>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* EDUCATION — the one section wired to real LMS data */}
      <section id="education" className="bg-[#f4f7fc] px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <SectionHeading eyebrow="Where I learned it">Education</SectionHeading>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <p className="text-lg font-bold text-navy-500">{COURSE.title}</p>
                <p className="mt-0.5 text-sm text-navy-500/50">NextStep&sup2;</p>
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
                <span className="text-sm font-medium text-navy-500/50">2026</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    courseComplete ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-navy-500/60"
                  }`}
                >
                  {courseComplete ? "Completed" : "In Progress"}
                </span>
              </div>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-navy-500/40">
              Core Learning Areas
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {subjects.map((subject) => (
                <span
                  key={subject.id}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-medium text-navy-500/70"
                >
                  {subject.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ACHIEVEMENTS */}
      <section id="achievements" className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <SectionHeading eyebrow="Along the way">Achievements</SectionHeading>
        <ul className="mx-auto mt-8 flex max-w-md flex-col gap-3">
          {DEMO_ACHIEVEMENTS.map((achievement) => (
            <li
              key={achievement}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5"
            >
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <span className="text-sm font-medium text-navy-500">{achievement}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* CONTACT */}
      <section id="contact" className="relative overflow-hidden bg-navy-500 px-6 py-16 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(circle at 80% 20%, rgba(22,103,239,0.35), transparent 45%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Let&apos;s work together</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-white/60">
            Open to opportunities, collaborations, and interesting problems to solve.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4">
            <a
              href={`mailto:${DEMO_CONTACT.email}`}
              className="inline-flex items-center gap-2 text-[15px] font-semibold text-white hover:text-brand-300"
            >
              <MailIcon className="h-4 w-4" />
              {DEMO_CONTACT.email}
            </a>
            <div className="flex items-center gap-4">
              <DemoLink className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white">
                <LinkedInIcon className="h-4 w-4" />
                LinkedIn
              </DemoLink>
              <DemoLink className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white">
                <GitHubIcon className="h-4 w-4" />
                GitHub
              </DemoLink>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-navy-600 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-white">{DEMO_PROFILE.name}</p>
        <p className="mt-1 text-sm text-white/40">{DEMO_PROFILE.headline}</p>
        <div className="mt-4 flex items-center justify-center gap-5">
          <DemoLink className="text-white/50 hover:text-white">
            <GitHubIcon className="h-4 w-4" />
          </DemoLink>
          <DemoLink className="text-white/50 hover:text-white">
            <LinkedInIcon className="h-4 w-4" />
          </DemoLink>
          <a href={`mailto:${DEMO_CONTACT.email}`} className="text-white/50 hover:text-white">
            <MailIcon className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-6 text-xs text-white/30">
          &copy; 2026 {DEMO_PROFILE.name}. Portfolio built with NextStep&sup2;.
        </p>
      </footer>
    </div>
  );
}
