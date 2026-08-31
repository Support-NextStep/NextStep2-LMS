import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { useRequireContentAuthorAccount } from "../hooks/useRequireContentAuthorAccount";
import { listCourses, listSubjectSummaries, apiCreateSubject } from "../data/mock";
import { listMyPackages, type PackageSummary } from "../data/authoredSessionApi";

export default function ContentCourseDetail() {
  const { account, checked } = useRequireContentAuthorAccount();
  const { courseId = "" } = useParams<{ courseId: string }>();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myPackages, setMyPackages] = useState<PackageSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyPackages();
        if (!cancelled) setMyPackages(mine);
      } catch {
        // Leave the counts at 0 — display-only badges, never worth blocking the page for.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !account) return null;

  const course = listCourses().find((c) => c.id === courseId);

  if (!course) {
    return (
      <ContentAuthorLayout authorName={account.name}>
        <div className="mx-auto max-w-2xl py-8 text-center">
          <p className="font-medium text-navy-500">Course not found.</p>
          <BackLink to="/content/courses" label="Back to Courses" />
        </div>
      </ContentAuthorLayout>
    );
  }

  // This author's own packages for this course — same pre-existing
  // approximation as before (per-subject counts), just sourced from the
  // backend instead of localStorage.
  const sessionStatuses = myPackages.filter((s) => s.courseId === courseId);
  const subjects = listSubjectSummaries();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setIsSubmitting(true);
    try {
      await apiCreateSubject(courseId, title.trim(), description.trim());
      setIsCreating(false);
      setTitle("");
      setDescription("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20";

  return (
    <ContentAuthorLayout authorName={account.name}>
      <div>
        <BackLink to="/content/courses" label="Back to Courses" />
        <div className="mt-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy-500">{course.title}</h1>
            <p className="mt-1.5 text-sm text-navy-500/60">Pick a subject to see its sessions, or continue authoring one already in progress.</p>
          </div>
          {!isCreating && (
            <Button onClick={() => setIsCreating(true)} className="!w-auto px-6">
              + Add Subject
            </Button>
          )}
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-navy-500">Add a New Subject</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-500">Subject Name</span>
              <input type="text" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} disabled={isSubmitting} placeholder="e.g. Frontend Development" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-500">Subject Description</span>
              <textarea rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSubmitting} placeholder="Brief description..." />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" className="!w-auto px-6" onClick={() => setIsCreating(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" className="!w-auto px-6" disabled={isSubmitting || !title.trim() || !description.trim()}>Add Subject</Button>
            </div>
          </form>
        )}

        {subjects.length === 0 && !isCreating ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center">
            <h3 className="text-lg font-semibold text-navy-500">No subjects yet</h3>
            <p className="mt-2 text-sm text-navy-500/60 max-w-sm">Add your first subject to organize your course content.</p>
            <Button onClick={() => setIsCreating(true)} className="mt-6 !w-auto px-8">
              + Add Subject
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {subjects.map((subject) => {
              const published = sessionStatuses.filter((s) => s.subjectId === subject.id && s.status === "PUBLISHED").length;
              const inProgress = sessionStatuses.filter((s) => s.subjectId === subject.id && s.status !== "PUBLISHED").length;
              return (
                <Link
                  key={subject.id}
                  to={`/content/courses/${courseId}/subjects/${subject.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-navy-500">{subject.title}</p>
                    <p className="mt-1 text-sm text-navy-500/60">{subject.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {published > 0 && (
                      <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">{published} published</span>
                    )}
                    {inProgress > 0 && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-navy-500/60">{inProgress} in progress</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ContentAuthorLayout>
  );
}
