import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { type AppShellNavItem } from "./AppShell";
import { IconCourse, IconDashboard, IconSubmissions } from "./navIcons";
import { clearContentAuthorAccount } from "../data/contentAuthor";

// Content Author = the Content Team: creates and prepares content, never
// approves/publishes it (see ContentReviewerLayout.tsx for that role). This
// replaces the old single "Content Manager" shell, which mixed authoring and
// approval in one workspace — that mix is exactly what this split undoes.
const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", to: "/content/dashboard", icon: IconDashboard },
  { label: "Courses", to: "/content/courses", icon: IconCourse },
  { label: "My Submissions", to: "/content/submissions", icon: IconSubmissions },
];

export default function ContentAuthorLayout({ authorName, children }: { authorName: string; children: ReactNode }) {
  const navigate = useNavigate();

  async function handleLogout() {
    // clearContentAuthorAccount() is now a real backend call (Phase 0) —
    // best-effort (see ../data/auth.ts), so this always navigates away regardless.
    await clearContentAuthorAccount();
    navigate("/content/login");
  }

  return (
    <AppShell navItems={NAV_ITEMS} userName={authorName} roleLabel="Content Author" onLogout={handleLogout}>
      {children}
    </AppShell>
  );
}
