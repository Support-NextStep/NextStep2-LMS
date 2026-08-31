import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { type AppShellNavItem } from "./AppShell";
import { IconContent, IconDashboard, IconStudents } from "./navIcons";
import { clearAdminAccount } from "../data/adminAccount";

const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: IconDashboard },
  { label: "Students", to: "/admin/students", icon: IconStudents },
  { label: "Content", to: "/admin/content", icon: IconContent },
];

export default function AdminLayout({ adminName, children }: { adminName: string; children: ReactNode }) {
  const navigate = useNavigate();

  async function handleLogout() {
    // clearAdminAccount() is now a real backend call (Phase 0) — best-effort
    // (see ../data/auth.ts), so this always navigates away regardless.
    await clearAdminAccount();
    navigate("/admin/login");
  }

  return (
    <AppShell navItems={NAV_ITEMS} userName={adminName} roleLabel="Admin" onLogout={handleLogout}>
      {children}
    </AppShell>
  );
}
