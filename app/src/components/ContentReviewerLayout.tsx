import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { type AppShellNavItem } from "./AppShell";
import { IconApproved, IconChangesRequested, IconDashboard, IconPending, IconPublished } from "./navIcons";
import { clearContentReviewerAccount } from "../data/contentReviewer";

// Content Reviewer = the Content Approval Team: reviews, requests changes,
// approves, and publishes — never authors content (see ContentAuthorLayout.tsx
// for that role). Sidebar is organized around the review queue by status
// rather than around a course/subject/session authoring tree, since this
// workspace is review-oriented, not authoring-oriented.
const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", to: "/review/dashboard", icon: IconDashboard },
  { label: "Pending Review", to: "/review/pending", icon: IconPending },
  { label: "Changes Requested", to: "/review/changes-requested", icon: IconChangesRequested },
  { label: "Approved", to: "/review/approved", icon: IconApproved },
  { label: "Published", to: "/review/published", icon: IconPublished },
];

export default function ContentReviewerLayout({ reviewerName, children }: { reviewerName: string; children: ReactNode }) {
  const navigate = useNavigate();

  async function handleLogout() {
    // clearContentReviewerAccount() is now a real backend call (Phase 0) —
    // best-effort (see ../data/auth.ts), so this always navigates away regardless.
    await clearContentReviewerAccount();
    navigate("/review/login");
  }

  return (
    <AppShell navItems={NAV_ITEMS} userName={reviewerName} roleLabel="Content Reviewer" onLogout={handleLogout}>
      {children}
    </AppShell>
  );
}
