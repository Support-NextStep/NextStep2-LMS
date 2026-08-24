import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ContentHeader from "../components/ContentHeader";
import BackLink from "../components/BackLink";
import Button from "../components/Button";
import { loadContentManagerAccount, type ContentManagerAccount } from "../data/contentManager";
import { getContentPackage, updatePackageState, type ContentPackageRecord } from "../data/contentPackages";

export default function ContentPackageDetail() {
  const navigate = useNavigate();
  const { packageId = "" } = useParams<{ packageId: string }>();
  const [account, setAccount] = useState<ContentManagerAccount | null>(null);
  const [pkg, setPkg] = useState<ContentPackageRecord | null | undefined>(undefined);
  const [checked, setChecked] = useState(false);

  // Form states
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState({
    course: false, structure: false, sessions: false, videos: false,
    practice: false, aiHelp: false, exercises: false, ready: false
  });

  useEffect(() => {
    const acct = loadContentManagerAccount();
    if (!acct) {
      navigate("/content/login", { replace: true });
      return;
    }
    setAccount(acct);
    const loaded = getContentPackage(packageId);
    setPkg(loaded);
    if (loaded && loaded.review) {
      setNotes(loaded.review.notes || "");
      setChecklist(loaded.review.checklist || checklist);
    }
    setChecked(true);
  }, [packageId, navigate]);

  if (!checked || !account) return null;

  if (!pkg) {
    return (
      <div className="min-h-screen bg-[#f4f7fc]">
        <ContentHeader managerName={account.name} />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="font-medium text-navy-500">Package not found.</p>
          <Button type="button" className="!w-auto mt-4" onClick={() => navigate("/content/dashboard")}>
            Back to Dashboard
          </Button>
        </main>
      </div>
    );
  }

  const isDraft = pkg.status === "draft";
  const isInvalid = pkg.status === "invalid";
  const isChangesRequested = pkg.status === "changes_requested";
  const isApproved = pkg.status === "approved";
  const isPublished = pkg.status === "published";

  const canEditReview = isDraft || isChangesRequested;
  
  const handleCheck = (key: keyof typeof checklist) => {
    if (!canEditReview) return;
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  const saveReview = (status: ContentPackageRecord["status"]) => {
    if (!pkg) return;
    const now = new Date().toISOString();
    const review = {
      checklist,
      notes,
      reviewedAt: pkg.review?.reviewedAt || now,
      approvedAt: status === "approved" ? now : pkg.review?.approvedAt,
      publishedAt: status === "published" ? now : pkg.review?.publishedAt,
    };
    const updated: ContentPackageRecord = { ...pkg, status, review };
    updatePackageState(updated);
    setPkg(updated);
  };

  const handleRequestChanges = () => {
    if (!notes.trim()) {
      alert("Please provide review notes explaining what needs to be changed.");
      return;
    }
    saveReview("changes_requested");
  };

  const handleApprove = () => {
    if (!allChecked) return;
    if (window.confirm("Approve this content package?\n\nApproved content is not visible to students until it is published.")) {
      saveReview("approved");
    }
  };

  const handlePublish = () => {
    if (window.confirm("Publish this course?\n\nThis will make the approved content available to students.")) {
      saveReview("published");
    }
  };

  const getStatusBadge = () => {
    if (isInvalid) return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-error/10 text-error">Needs Attention</span>;
    if (isDraft) return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-slate-100 text-navy-500/60">Draft</span>;
    if (isChangesRequested) return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-700">Changes Requested</span>;
    if (isApproved) return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">Approved</span>;
    if (isPublished) return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-brand-100 text-brand-700">Published</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <ContentHeader managerName={account.name} />

      <main className="mx-auto max-w-[1000px] px-6 py-10 sm:px-10">
        <BackLink to="/content/dashboard" label="Back to Dashboard" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-navy-500">{pkg.fileName}</h1>
            <p className="mt-1 text-sm text-navy-500/60">
              {pkg.courseCount} course{pkg.courseCount === 1 ? "" : "s"} &middot; {pkg.subjectCount} subject
              {pkg.subjectCount === 1 ? "" : "s"} &middot; {pkg.sessionCount} session{pkg.sessionCount === 1 ? "" : "s"}
            </p>
          </div>
          {getStatusBadge()}
        </div>

        {isInvalid ? (
          <div className="mt-6 rounded-xl border border-error/20 bg-error/5 p-6">
            <p className="text-sm font-semibold text-error">This package can&apos;t be previewed.</p>
            <p className="mt-1.5 text-sm text-navy-500/60">
              It failed validation on import, so no usable content was saved. Re-import a corrected package from
              the Dashboard.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 flex flex-col gap-6">
              {pkg.courses?.map((course) => (
                <div key={course.id} className="rounded-xl border border-slate-200 bg-white p-6">
                  <h2 className="text-lg font-semibold text-navy-500">{course.title}</h2>
                  <p className="mt-1 text-sm text-navy-500/60">{course.description}</p>

                  <div className="mt-5 flex flex-col gap-5">
                    {[...course.subjects]
                      .sort((a, b) => a.order - b.order)
                      .map((subject) => (
                        <div key={subject.id}>
                          <p className="text-sm font-semibold uppercase tracking-wide text-navy-500/40">
                            {subject.title}
                          </p>
                          <div className="mt-2 flex flex-col gap-2">
                            {[...subject.sessions]
                              .sort((a, b) => a.order - b.order)
                              .map((session) => (
                                <div
                                  key={session.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-navy-500">{session.title}</p>
                                    <p className="truncate text-xs text-navy-500/50">{session.description}</p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="!w-auto shrink-0 px-4 py-1.5 text-sm"
                                    onClick={() =>
                                      navigate(`/content/preview/${pkg.id}/${course.id}/${subject.id}/${session.id}`)
                                    }
                                  >
                                    Preview
                                  </Button>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-navy-500/40 mb-4">
                  Content Review
                </h3>
                
                <div className="flex flex-col gap-3">
                  {[
                    { key: "course", label: "Course information reviewed" },
                    { key: "structure", label: "Subject structure reviewed" },
                    { key: "sessions", label: "Session content reviewed" },
                    { key: "videos", label: "Videos reviewed" },
                    { key: "practice", label: "Practice activities reviewed" },
                    { key: "aiHelp", label: "AI Help reviewed" },
                    { key: "exercises", label: "Exercises reviewed" },
                    { key: "ready", label: "Content is ready for students" },
                  ].map((item) => (
                    <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-500 disabled:opacity-50"
                        checked={checklist[item.key as keyof typeof checklist]}
                        onChange={() => handleCheck(item.key as keyof typeof checklist)}
                        disabled={!canEditReview}
                      />
                      <span className="text-sm text-navy-500">{item.label}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-semibold text-navy-500 mb-2">
                    Review notes:
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-navy-500/60"
                    rows={4}
                    placeholder="Provide feedback here if changes are needed..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!canEditReview}
                  />
                </div>

                {isDraft || isChangesRequested ? (
                  <div className="mt-6 flex flex-col gap-3">
                    <Button type="button" variant="secondary" onClick={handleRequestChanges}>
                      Request Changes
                    </Button>
                    <Button 
                      type="button" 
                      onClick={handleApprove}
                      disabled={!allChecked}
                      className={!allChecked ? "opacity-50" : ""}
                    >
                      Approve Content
                    </Button>
                  </div>
                ) : null}

                {isApproved && (
                  <div className="mt-6 flex flex-col gap-3">
                    <div className="rounded-lg bg-emerald-50 px-4 py-3 border border-emerald-100">
                      <p className="text-sm font-medium text-emerald-800">✓ Content approved</p>
                      <p className="mt-1 text-xs text-emerald-700/80">Ready to publish. Students cannot see this content yet.</p>
                    </div>
                    <Button type="button" onClick={handlePublish}>
                      Publish
                    </Button>
                  </div>
                )}

                {isPublished && (
                  <div className="mt-6">
                    <div className="rounded-lg bg-brand-50 px-4 py-3 border border-brand-100">
                      <p className="text-sm font-medium text-brand-800">✓ Published</p>
                      <p className="mt-1 text-xs text-brand-700/80">
                        This content is now available to students.
                        <br/>
                        Published at: {new Date(pkg.review?.publishedAt || "").toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
