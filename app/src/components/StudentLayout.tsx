import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { type AppShellNavItem } from "./AppShell";
import { IconCourse, IconDashboard, IconPerformance, IconPortfolio } from "./navIcons";
import { STUDENT } from "../data/mock";

const NAV_ITEMS: AppShellNavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: IconDashboard },
  { label: "My Course", to: "/my-course", icon: IconCourse },
  { label: "Performance", to: "/performance", icon: IconPerformance },
  { label: "Portfolio", to: "/portfolio", icon: IconPortfolio },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  function handleLogout() {
    // Mock auth — no real session to invalidate, just return to Login.
    navigate("/login");
  }

  return (
    <AppShell navItems={NAV_ITEMS} userName={STUDENT.name} onLogout={handleLogout} showNotifications>
      {children}
    </AppShell>
  );
}
