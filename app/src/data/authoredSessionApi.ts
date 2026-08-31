// ---------------------------------------------------------------------------
// Backend adapter for the Content Author authoring workflow — replaces
// contentPackages.ts's localStorage persistence (upsertPackageRecord/
// loadContentPackages/findResumableAuthoredPackage/updatePackageState) as
// the source of truth for AuthoredSessionDraft. Same function shapes as the
// functions this replaces wherever possible, so authoredSession.ts and its
// callers (ContentSessionAuthoring.tsx) change as little as possible — see
// the migration report for the exact call-site diffs.
//
// PACKAGE IDS ARE NOW SERVER-ISSUED: createEmptyDraft() (authoredSession.ts)
// still generates a local placeholder id synchronously (it has no backend
// dependency, and a fresh draft needs SOME id to exist in React state before
// any network round trip completes) — createPackageForDraft() below is what
// actually creates the real ContentPackage row and returns a corrected
// draft with the server-issued id substituted in. Every subsequent
// saveDraft()/submitForReview() call uses that real id.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, apiPut } from "./apiClient";
import type { AuthoredSessionDraft } from "./authoredSession";

export type BackendPackageStatus = "DRAFT" | "READY_FOR_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "PUBLISHED";

export type PackageReviewEntry = {
  id: string;
  action: "CHANGES_REQUESTED" | "APPROVED" | "PUBLISHED";
  reviewerName?: string;
  checklist: Record<string, boolean> | null;
  notes: string | null;
  createdAt: string;
  contentVersionId: string;
};

export type PackageSummary = {
  id: string;
  fileName: string;
  status: BackendPackageStatus;
  updatedAt: string;
  sessionId: string;
  subjectId: string;
  courseId: string;
  /** The most recent reviewer note, if any — enough for "Reviewer notes: ..." on the author's own submissions list without a second call. */
  latestReviewNotes?: string;
};

export type PackageDetail = PackageSummary & {
  draftContent: AuthoredSessionDraft | null;
  currentContentVersionId: string | null;
  contentVersions: { id: string; createdAt: string }[];
  contentReviews: PackageReviewEntry[];
};

type RawPackage = {
  id: string;
  fileName: string;
  status: BackendPackageStatus;
  updatedAt: string;
  sessionId: string;
  draftContent: unknown;
  currentContentVersionId: string | null;
  session?: { id: string; subjectId: string; subject?: { id: string; courseId: string } };
  contentVersions?: { id: string; createdAt: string }[];
  contentReviews?: {
    id: string;
    action: "CHANGES_REQUESTED" | "APPROVED" | "PUBLISHED";
    reviewer?: { name: string };
    checklist: Record<string, boolean> | null;
    notes: string | null;
    createdAt: string;
    contentVersionId: string;
  }[];
};

function toSummary(raw: RawPackage): PackageSummary {
  const latest = raw.contentReviews?.[0];
  return {
    id: raw.id,
    fileName: raw.fileName,
    status: raw.status,
    updatedAt: raw.updatedAt,
    sessionId: raw.sessionId,
    subjectId: raw.session?.subjectId ?? "",
    courseId: raw.session?.subject?.courseId ?? "",
    latestReviewNotes: raw.status === "CHANGES_REQUESTED" ? latest?.notes ?? undefined : undefined,
  };
}

function toDetail(raw: RawPackage): PackageDetail {
  return {
    ...toSummary(raw),
    draftContent: (raw.draftContent as AuthoredSessionDraft | null) ?? null,
    currentContentVersionId: raw.currentContentVersionId,
    contentVersions: raw.contentVersions ?? [],
    contentReviews: (raw.contentReviews ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      reviewerName: r.reviewer?.name,
      checklist: r.checklist,
      notes: r.notes,
      createdAt: r.createdAt,
      contentVersionId: r.contentVersionId,
    })),
  };
}

/** Creates the real backend ContentPackage for a freshly-started draft, and returns a copy of it with `packageId` replaced by the server-issued id. Call once, right after createEmptyDraft(), before the first save. */
export async function createPackageForDraft(draft: AuthoredSessionDraft): Promise<AuthoredSessionDraft> {
  const created = await apiPost<RawPackage>("/packages", { sessionId: draft.sessionId });
  return { ...draft, packageId: created.id };
}

/** Whole-object upsert of the mutable draft — same shape as the old saveDraft(draft), now a network call. */
export async function saveDraft(draft: AuthoredSessionDraft): Promise<AuthoredSessionDraft> {
  const updated: AuthoredSessionDraft = { ...draft, updatedAt: new Date().toISOString() };
  await apiPut(`/packages/${draft.packageId}/draft`, updated);
  return updated;
}

/**
 * The in-progress (DRAFT/CHANGES_REQUESTED) package for this session, if one
 * exists — same "only resume an in-progress record" contract as the old
 * findResumableAuthoredPackage()/loadDraftForSession(). Three outcomes, not
 * two, because a resumable package can genuinely exist with no real content
 * in it yet: PackagesService.createPackage() writes `draftContent: {}` the
 * moment the package row is created, before the author has ever clicked
 * Save Draft (e.g. they created the session, then closed the tab) — that
 * row is real and still "theirs" (the active-package-per-session uniqueness
 * constraint is already holding it), so treating it as "kind: none" would
 * make the caller call createPackageForDraft() again and hit that same
 * constraint as a 409. "kind: empty" tells the caller to build a fresh
 * empty draft locally but reuse this package's id rather than creating a
 * second one.
 */
export type ResumableDraft =
  | { kind: "none" }
  | { kind: "empty"; packageId: string }
  | { kind: "content"; draft: AuthoredSessionDraft };

export async function loadDraftForSession(sessionId: string): Promise<ResumableDraft> {
  const mine = await apiGet<RawPackage[]>("/packages/mine");
  const resumable = mine.find((p) => p.sessionId === sessionId && (p.status === "DRAFT" || p.status === "CHANGES_REQUESTED"));
  if (!resumable) return { kind: "none" };

  const full = await apiGet<RawPackage>(`/packages/${resumable.id}`);
  const draftContent = full.draftContent as AuthoredSessionDraft | null;
  // `.learning` is only ever absent on a never-saved `{}` — every real save
  // writes the whole draft object at once (see saveDraft() above), so its
  // presence is what actually distinguishes real content from an abandoned
  // empty package.
  if (draftContent && draftContent.learning) {
    return { kind: "content", draft: { ...draftContent, packageId: full.id } };
  }
  return { kind: "empty", packageId: full.id };
}

export async function loadDraftByPackageId(packageId: string): Promise<AuthoredSessionDraft | null> {
  const full = await apiGet<RawPackage>(`/packages/${packageId}`);
  return (full.draftContent as AuthoredSessionDraft | null) ?? null;
}

export async function getPackageDetail(packageId: string): Promise<PackageDetail> {
  return toDetail(await apiGet<RawPackage>(`/packages/${packageId}`));
}

export async function listMyPackages(): Promise<PackageSummary[]> {
  const mine = await apiGet<RawPackage[]>("/packages/mine");
  return mine.map(toSummary);
}

/**
 * The Submit button is already disabled client-side until
 * canSubmitForReview(draft) is true (unchanged — see authoredSession.ts),
 * so a real 400 here should be rare. Server-side completeness is
 * re-validated regardless (never trust the client-disabled-button alone for
 * a state transition that matters) — on failure this throws ApiError with a
 * readable message; callers that want the granular incompleteSections list
 * can already compute it themselves via getIncompleteMandatorySections().
 */
export async function submitForReview(packageId: string): Promise<{ status: BackendPackageStatus }> {
  const result = await apiPost<RawPackage>(`/packages/${packageId}/submit`, {});
  return { status: result.status };
}
