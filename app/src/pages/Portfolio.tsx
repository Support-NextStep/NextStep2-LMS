import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import StudentLayout from "../components/StudentLayout";
import Button from "../components/Button";
import { COURSE } from "../data/mock";
import { useCourseData } from "../data/progress";
import {
  createEmptyProject,
  loadPortfolio,
  savePortfolio,
  type PortfolioData,
  type PortfolioProject,
} from "../data/portfolio";

const SKILL_CATEGORIES = ["Frontend", "Backend", "Database", "AI"];

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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-navy-500">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-navy-500/50">
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-navy-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-navy-500">{label}</span>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 placeholder:text-navy-500/35 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
      />
    </label>
  );
}

export default function Portfolio() {
  const { subjects, courseProgress, currentUser } = useCourseData();
  // Real Student Identity slice — portfolio ownership/default profile name
  // now comes from the authenticated user (GET /auth/me), never mock.ts's
  // hardcoded STUDENT. Starts null and is only loaded once currentUser
  // resolves, so this never briefly shows (or saves into) another account's
  // portfolio — see ../data/portfolio.ts's per-student storage key.
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  useEffect(() => {
    if (currentUser) setPortfolio(loadPortfolio(currentUser.id, currentUser.name));
  }, [currentUser]);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PortfolioData | null>(null);
  const [skillsInput, setSkillsInput] = useState<Record<string, string>>({});

  // Mirrors every other role's `if (!checked || !account) return null;`
  // loading convention (see useRequireAdminAccount.ts etc.) — nothing is
  // rendered until the real authenticated user (and therefore their own,
  // correctly-scoped portfolio) has actually loaded. Never a fabricated
  // placeholder identity in the meantime.
  if (!currentUser || !portfolio) return null;
  // Narrowed, stable references for the closures below — TypeScript's
  // control-flow narrowing from the guard above doesn't extend into nested
  // function declarations, so these give startEditing/saveEditing a type
  // that's actually known non-null rather than requiring an assertion.
  const authenticatedUser = currentUser;
  const loadedPortfolio = portfolio;

  function startEditing() {
    setDraft(loadedPortfolio);
    const inputs: Record<string, string> = {};
    for (const category of SKILL_CATEGORIES) {
      const existing = loadedPortfolio.skills.find((g) => g.category === category);
      inputs[category] = existing ? existing.skills.join(", ") : "";
    }
    setSkillsInput(inputs);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(null);
    setIsEditing(false);
  }

  function saveEditing() {
    if (!draft) return;

    const skills = SKILL_CATEGORIES.map((category) => ({
      category,
      skills: (skillsInput[category] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })).filter((group) => group.skills.length > 0);

    const projects = draft.projects
      .map((p) => ({ ...p, title: p.title.trim() }))
      .filter((p) => p.title.length > 0);

    const next: PortfolioData = { ...draft, skills, projects };
    setPortfolio(next);
    savePortfolio(authenticatedUser.id, next);
    setDraft(null);
    setIsEditing(false);
  }

  function updateDraft(updater: (d: PortfolioData) => PortfolioData) {
    setDraft((prev) => (prev ? updater(prev) : prev));
  }

  function updateProject(id: string, patch: Partial<PortfolioProject>) {
    updateDraft((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function addProject() {
    updateDraft((d) => ({ ...d, projects: [...d.projects, createEmptyProject()] }));
  }

  function removeProject(id: string) {
    updateDraft((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) }));
  }

  const completedSubjects = subjects.filter((s) => s.status === "completed");

  return (
    <StudentLayout>
      <div className="mx-auto flex  flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-navy-500 sm:text-3xl">Portfolio</h1>
            <p className="mt-1.5 text-[15px] text-navy-500/60">
              What you know, what you&apos;ve built, and what you&apos;ve achieved.
            </p>
          </div>
          {!isEditing && (
            <div className="flex flex-wrap gap-3">
              <Link to="/portfolio/view">
                <Button type="button" className="!w-auto px-6">
                  View Portfolio
                </Button>
              </Link>
              <Button type="button" variant="secondary" className="!w-auto px-6" onClick={startEditing}>
                Edit Portfolio
              </Button>
            </div>
          )}
        </div>

        {isEditing && draft ? (
          /* -------------------- EDIT MODE -------------------- */
          <div className="flex flex-col gap-8">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-lg font-bold text-navy-500">Profile</h2>
              <div className="mt-5 flex flex-col gap-4 sm:max-w-md">
                <TextField
                  label="Name"
                  value={draft.profile.name}
                  onChange={(v) => updateDraft((d) => ({ ...d, profile: { ...d.profile, name: v } }))}
                />
                <TextField
                  label="Professional Headline"
                  value={draft.profile.headline}
                  placeholder="e.g. Full-Stack Developer"
                  onChange={(v) => updateDraft((d) => ({ ...d, profile: { ...d.profile, headline: v } }))}
                />
                <TextAreaField
                  label="About Me"
                  value={draft.profile.bio}
                  placeholder="Add a short introduction about yourself."
                  onChange={(v) => updateDraft((d) => ({ ...d, profile: { ...d.profile, bio: v } }))}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-lg font-bold text-navy-500">Skills</h2>
              <p className="mt-1 text-sm text-navy-500/50">Separate skills with commas.</p>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {SKILL_CATEGORIES.map((category) => (
                  <TextField
                    key={category}
                    label={category}
                    value={skillsInput[category] ?? ""}
                    placeholder="e.g. React, Tailwind CSS"
                    onChange={(v) => setSkillsInput((s) => ({ ...s, [category]: v }))}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-navy-500">Projects</h2>
                <Button type="button" variant="secondary" className="!w-auto px-4" onClick={addProject}>
                  Add Project
                </Button>
              </div>

              <div className="mt-5 flex flex-col gap-5">
                {draft.projects.length === 0 && (
                  <p className="text-sm text-navy-500/50">No projects added yet.</p>
                )}
                {draft.projects.map((project, index) => (
                  <div key={project.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-navy-500">Project {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeProject(project.id)}
                        className="text-xs font-semibold text-error hover:text-error/80"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 flex flex-col gap-3">
                      <TextField
                        label="Title"
                        value={project.title}
                        onChange={(v) => updateProject(project.id, { title: v })}
                      />
                      <TextAreaField
                        label="Description"
                        value={project.description}
                        rows={2}
                        onChange={(v) => updateProject(project.id, { description: v })}
                      />
                      <TextField
                        label="Technologies (comma separated)"
                        value={project.technologies.join(", ")}
                        onChange={(v) =>
                          updateProject(project.id, {
                            technologies: v.split(",").map((t) => t.trim()).filter(Boolean),
                          })
                        }
                      />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField
                          label="Project Link"
                          value={project.projectUrl}
                          placeholder="https://"
                          onChange={(v) => updateProject(project.id, { projectUrl: v })}
                        />
                        <TextField
                          label="GitHub Link"
                          value={project.githubUrl}
                          placeholder="https://github.com/..."
                          onChange={(v) => updateProject(project.id, { githubUrl: v })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="text-lg font-bold text-navy-500">Contact &amp; Links</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:max-w-md">
                <TextField
                  label="Email"
                  type="email"
                  value={draft.links.email}
                  placeholder="you@example.com"
                  onChange={(v) => updateDraft((d) => ({ ...d, links: { ...d.links, email: v } }))}
                />
                <TextField
                  label="LinkedIn"
                  value={draft.links.linkedin}
                  placeholder="https://linkedin.com/in/..."
                  onChange={(v) => updateDraft((d) => ({ ...d, links: { ...d.links, linkedin: v } }))}
                />
                <TextField
                  label="GitHub"
                  value={draft.links.github}
                  placeholder="https://github.com/..."
                  onChange={(v) => updateDraft((d) => ({ ...d, links: { ...d.links, github: v } }))}
                />
              </div>
            </section>

            <div className="flex flex-wrap gap-3">
              <Button type="button" className="!w-auto px-6" onClick={saveEditing}>
                Save Portfolio
              </Button>
              <Button type="button" variant="secondary" className="!w-auto px-6" onClick={cancelEditing}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* -------------------- VIEW MODE -------------------- */
          <div className="flex flex-col gap-8">
            {/* 1. Hero */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-l-4 border-brand-500 p-6 sm:p-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy-500 text-lg font-semibold text-white">
                    {initials(portfolio.profile.name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-navy-500 sm:text-2xl">{portfolio.profile.name}</h2>
                    <p className="mt-0.5 text-sm font-medium text-brand-500">
                      {portfolio.profile.headline || "Add a professional headline"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. About Me */}
            <SectionCard title="About Me">
              {portfolio.profile.bio ? (
                <p className="max-w-2xl text-sm leading-relaxed text-navy-500/70">{portfolio.profile.bio}</p>
              ) : (
                <EmptyNote>Add a short introduction about yourself.</EmptyNote>
              )}
            </SectionCard>

            {/* 3. Skills */}
            <SectionCard title="Skills">
              {portfolio.skills.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {portfolio.skills.map((group) => (
                    <div key={group.category}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500/40">
                        {group.category}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-medium text-navy-500/70"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyNote>Add the skills you want to showcase.</EmptyNote>
              )}
            </SectionCard>

            {/* 4. Projects */}
            <SectionCard title="Projects">
              {portfolio.projects.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {portfolio.projects.map((project) => (
                    <div key={project.id} className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
                      <p className="font-semibold text-navy-500">{project.title}</p>
                      {project.description && (
                        <p className="text-sm leading-relaxed text-navy-500/60">{project.description}</p>
                      )}
                      {project.technologies.length > 0 && (
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
                      )}
                      {(project.projectUrl || project.githubUrl) && (
                        <div className="mt-auto flex flex-wrap gap-4 pt-1 text-sm font-semibold">
                          {project.projectUrl && (
                            <a
                              href={project.projectUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-500 hover:text-brand-600"
                            >
                              View Project &rarr;
                            </a>
                          )}
                          {project.githubUrl && (
                            <a
                              href={project.githubUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-navy-500/60 hover:text-navy-500"
                            >
                              GitHub &rarr;
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyNote>No projects added yet.</EmptyNote>
              )}
            </SectionCard>

            {/* 5. Learning & Achievements */}
            <SectionCard title="Learning & Achievements">
              {completedSubjects.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                  <p className="text-sm font-semibold text-navy-500">{COURSE.title}</p>
                  <p className="mt-1 text-sm text-navy-500/50">
                    {courseProgress.completedSubjects} of {courseProgress.totalSubjects} subjects completed
                  </p>
                  <ul className="mt-4 flex flex-col gap-2">
                    {completedSubjects.map((subject) => (
                      <li key={subject.id} className="flex items-center gap-2 text-sm text-navy-500/70">
                        <CheckIcon className="h-4 w-4 shrink-0 text-brand-500" />
                        {subject.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <EmptyNote>Your learning achievements will appear here as you progress.</EmptyNote>
              )}
            </SectionCard>

            {/* 6. Contact & Links */}
            <SectionCard title="Contact & Links">
              {portfolio.links.email || portfolio.links.linkedin || portfolio.links.github ? (
                <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                  {portfolio.links.email && (
                    <a href={`mailto:${portfolio.links.email}`} className="text-sm font-medium text-brand-500 hover:text-brand-600">
                      {portfolio.links.email}
                    </a>
                  )}
                  {portfolio.links.linkedin && (
                    <a href={portfolio.links.linkedin} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-500 hover:text-brand-600">
                      LinkedIn
                    </a>
                  )}
                  {portfolio.links.github && (
                    <a href={portfolio.links.github} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-500 hover:text-brand-600">
                      GitHub
                    </a>
                  )}
                </div>
              ) : (
                <EmptyNote>Add your contact links.</EmptyNote>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

