import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { type AppShellNavItem } from "./AppShell";
import { IconCourse, IconDashboard, IconPerformance, IconPortfolio } from "./navIcons";
import { STUDENT } from "../data/mock";
import { logoutRequest } from "../data/auth";

const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: IconDashboard },
  { label: "My Course", to: "/my-course", icon: IconCourse },
  { label: "Performance", to: "/performance", icon: IconPerformance },
  { label: "Portfolio", to: "/portfolio", icon: IconPortfolio },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  async function handleLogout() {
    // Login is real now (Phase 0) — revoke the server-side session too, not
    // just navigate away. Best-effort (see ../data/auth.ts's logoutRequest),
    // so this always navigates regardless. Every Student route stays
    // unguarded either way (see Login.tsx's own comment on that deliberate
    // scope boundary) — this only makes "Log Out" actually end the real
    // session instead of doing nothing.
    await logoutRequest();
    navigate("/login");
  }

  return (
    <AppShell navItems={NAV_ITEMS} userName={STUDENT.name} onLogout={handleLogout} showNotifications>
      {children}
    </AppShell>
  );
}
