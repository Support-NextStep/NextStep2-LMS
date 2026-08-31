// ---------------------------------------------------------------------------
// Backend adapter for the Content Reviewer workflow — request-changes,
// approve, publish, and the reviewer's actionable queue. Companion to
// authoredSessionApi.ts (the author-side adapter); both wrap the same
// backend package/review endpoints.
// ---------------------------------------------------------------------------

import { apiGet, apiPost } from "./apiClient";
import { type BackendPackageStatus, type PackageSummary } from "./authoredSessionApi";

type RawQueueItem = {
  id: string;
  fileName: string;
  status: PackageSummary["status"];
  updatedAt: string;
  sessionId: string;
  session?: { subjectId: string; subject?: { courseId: string } };
};

function toSummary(p: RawQueueItem): PackageSummary {
  return {
    id: p.id,
    fileName: p.fileName,
    status: p.status,
    updatedAt: p.updatedAt,
    sessionId: p.sessionId,
    subjectId: p.session?.subjectId ?? "",
    courseId: p.session?.subject?.courseId ?? "",
  };
}

/**
 * No `status`: the reviewer's actionable queue — READY_FOR_REVIEW only.
 * CHANGES_REQUESTED belongs to the author's editing cycle; APPROVED/
 * PUBLISHED are completed states — see review.service.ts's own doc comment
 * on the backend for why every non-DRAFT status is deliberately NOT treated
 * as "the queue." Pass `status` for the reviewer dashboard's other,
 * purely-informational tabs (or "ALL" for its tile counts).
 */
export async function listReviewQueue(status?: BackendPackageStatus | "ALL"): Promise<PackageSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const items = await apiGet<RawQueueItem[]>(`/review/packages${query}`);
  return items.map(toSummary);
}

export async function requestChanges(packageId: string, checklist: Record<string, boolean>, notes: string): Promise<void> {
  await apiPost(`/packages/${packageId}/request-changes`, { checklist, notes });
}

export async function approve(packageId: string, checklist: Record<string, boolean>): Promise<void> {
  await apiPost(`/packages/${packageId}/approve`, { checklist });
}

export async function publish(packageId: string): Promise<void> {
  await apiPost(`/packages/${packageId}/publish`, {});
}
