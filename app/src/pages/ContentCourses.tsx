import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ContentAuthorLayout from "../components/ContentAuthorLayout";
import Button from "../components/Button";
import { useRequireContentAuthorAccount } from "../hooks/useRequireContentAuthorAccount";
import { listCourses, apiCreateCourse } from "../data/mock";
import { listMyPackages } from "../data/authoredSessionApi";

export default function ContentCourses() {
  const { account, checked } = useRequireContentAuthorAccount();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedSessionCount, setPublishedSessionCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mine = await listMyPackages();
        if (!cancelled) setPublishedSessionCount(mine.filter((p) => p.status === "PUBLISHED").length);
      } catch {
        // Leave the count at 0 — a display-only badge, never worth blocking the page for.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || !account) return null;

  const courses = listCourses();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setIsSubmitting(true);
    try {
      const course = await apiCreateCourse(title.trim(), description.trim());
      navigate(`/content/courses/${course.id}`);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-navy-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20";

  return (
    <ContentAuthorLayout authorName={account.name}>
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy-500">Courses</h1>
            <p className="mt-1.5 text-sm text-navy-500/60">Browse subjects and sessions, or author a new one.</p>
          </div>
          {!isCreating && (
            <Button onClick={() => setIsCreating(true)} className="!w-auto px-6">
              + Create Course
            </Button>
          )}
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-navy-500">Create a New Course</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-500">Course Name</span>
              <input type="text" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} disabled={isSubmitting} placeholder="e.g. Full-Stack Web Development" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-navy-500">Course Description</span>
              <textarea rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSubmitting} placeholder="Brief description..." />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" className="!w-auto px-6" onClick={() => setIsCreating(false)} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" className="!w-auto px-6" disabled={isSubmitting || !title.trim() || !description.trim()}>Create Course</Button>
            </div>
          </form>
        )}

        {courses.length === 0 && !isCreating ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center">
            <h3 className="text-lg font-semibold text-navy-500">No courses yet</h3>
            <p className="mt-2 text-sm text-navy-500/60 max-w-sm">Create your first course to start building your curriculum.</p>
            <Button onClick={() => setIsCreating(true)} className="mt-6 !w-auto px-8">
              + Create Course
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {courses.map((course) => (
              <Link
                key={course.id}
                to={`/content/courses/${course.id}`}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-navy-500">{course.title}</p>
                  <p className="mt-1 text-sm text-navy-500/60">{course.description}</p>
                </div>
                {/* Note: this shows this author's own published sessions across every course, not scoped to this specific course — same pre-existing approximation as before, just now sourced from the backend instead of localStorage. */}
                <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  {publishedSessionCount} session{publishedSessionCount === 1 ? "" : "s"} published
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ContentAuthorLayout>
  );
}
